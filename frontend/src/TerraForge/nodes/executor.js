// Graph executor : topological sort + memoized compute.
// Each node has type + params, produces a Float32Array heightmap (size×size).

import { generateHeightmap, erode } from "@/TerraForge/lib/terrainGen";
import { generateHeightmapGPU, isWebGPUAvailable } from "@/TerraForge/lib/webgpu/gpuNoise";
import { applyPresetShape } from "@/TerraForge/lib/shapes";
import { combineHeightmaps } from "@/TerraForge/lib/combine";
import { riverMask, seaMask, lakeMask, rainAccumulation } from "@/TerraForge/lib/water";

export const NODE_DEFS = {
  noise: {
    label: "Noise",
    inputs: [],
    output: "heightmap",
    defaults: {
      seed: 1337, scale: 0.0018, octaves: 7, persistence: 0.5,
      lacunarity: 2.0, ridgeBlend: 0.4, warp: 0.3, exponent: 1.4,
      useGPU: true,
    },
  },
  shape: {
    label: "Shape",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { presetId: "alpine" },
  },
  erode: {
    label: "Erode",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { iterations: 30000, erosion: 0.3, deposition: 0.3, inertia: 0.05, seed: 42 },
  },
  combine: {
    label: "Combine",
    inputs: ["heightmap", "heightmap"],
    output: "heightmap",
    defaults: { mode: "lerp", blend: 0.5 },
  },
  mask: {
    label: "Mask",
    inputs: ["heightmap", "heightmap"],
    output: "heightmap",
    defaults: { invert: false, threshold: 0.5 },
  },
  blur: {
    label: "Blur",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { radius: 2, passes: 1 },
  },
  terrace: {
    label: "Terrace",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { steps: 8, sharpness: 0.5 },
  },
  curve: {
    label: "Curve",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { gamma: 1.0, gain: 1.0, bias: 0.0 },
  },
  clip: {
    label: "Clip",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { min: 0.0, max: 1.0 },
  },
  normalize: {
    label: "Normalize",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { lo: 0.0, hi: 1.0 },
  },
  warp: {
    label: "Warp",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { amount: 0.05, frequency: 0.01, seed: 17 },
  },
  river: {
    label: "River",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { threshold: 80, depth: 0.04, width: 1 },
  },
  lake: {
    label: "Lake",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { fillDepth: 0.04, minArea: 16, depth: 0.03 },
  },
  sea: {
    label: "Sea",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { level: 0.18, flatten: true },
  },
  rain: {
    label: "Rain",
    inputs: ["heightmap"],
    output: "heightmap",
    defaults: { intensity: 1.0, erodeWeight: 0.0 },
  },
  output: {
    label: "Output",
    inputs: ["heightmap"],
    output: null,
    defaults: {},
  },
};

function dependencyOrder(nodes, edges, terminalId) {
  const upstream = new Map();
  for (const n of nodes) upstream.set(n.id, []);
  for (const e of edges) {
    const targetSlot = parseInt(e.targetHandle?.replace("in-", "") || "0", 10);
    upstream.get(e.target).push({ sourceId: e.source, slot: targetSlot });
  }
  const visited = new Set();
  const order = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    visited.add(id);
    const deps = upstream.get(id) || [];
    for (const d of deps) visit(d.sourceId);
    order.push(id);
  };
  visit(terminalId);
  return { order, upstream };
}

export async function executeGraph(nodes, edges, size, onProgress = () => {}) {
  const terminal = nodes.find((n) => n.data.type === "output");
  if (!terminal) throw new Error("Graph has no Output node");
  const { order, upstream } = dependencyOrder(nodes, edges, terminal.id);
  const results = new Map();
  const total = order.length;
  let i = 0;
  for (const id of order) {
    const node = nodes.find((n) => n.id === id);
    onProgress(i / total, node);
    const ins = upstream.get(id).map((u) => results.get(u.sourceId)).filter(Boolean);
    const data = await computeNode(node, ins, size);
    results.set(id, data);
    i++;
  }
  onProgress(1, null);
  return results.get(terminal.id);
}

// ─── Helpers used by graph nodes ───
function boxBlur(src, size, radius) {
  const r = Math.max(1, radius | 0);
  const w = 2 * r + 1;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  // horizontal
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[y * size + Math.max(0, Math.min(size - 1, i))];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = sum / w;
      const add = Math.max(0, Math.min(size - 1, x + r + 1));
      const rem = Math.max(0, Math.min(size - 1, x - r));
      sum += src[y * size + add] - src[y * size + rem];
    }
  }
  // vertical
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[Math.max(0, Math.min(size - 1, i)) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / w;
      const add = Math.max(0, Math.min(size - 1, y + r + 1));
      const rem = Math.max(0, Math.min(size - 1, y - r));
      sum += tmp[add * size + x] - tmp[rem * size + x];
    }
  }
  return out;
}

function dilate(mask, size, iter) {
  let cur = mask;
  for (let it = 0; it < iter; it++) {
    const next = new Float32Array(cur);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (cur[i] > 0) continue;
        let m = 0;
        if (x > 0) m = Math.max(m, cur[i - 1]);
        if (x < size - 1) m = Math.max(m, cur[i + 1]);
        if (y > 0) m = Math.max(m, cur[i - size]);
        if (y < size - 1) m = Math.max(m, cur[i + size]);
        next[i] = m * 0.85;
      }
    }
    cur = next;
  }
  return cur;
}

async function computeNode(node, inputs, size) {
  const t = node.data.type;
  const p = node.data.params;

  if (t === "noise") {
    if (p.useGPU && isWebGPUAvailable()) {
      const gpu = await generateHeightmapGPU({
        size, seed: p.seed, scale: p.scale, octaves: p.octaves,
        persistence: p.persistence, lacunarity: p.lacunarity,
        ridgeBlend: p.ridgeBlend, warp: p.warp, exponent: p.exponent,
      });
      if (gpu) return gpu;
    }
    return generateHeightmap({
      size, seed: p.seed, scale: p.scale, octaves: p.octaves,
      persistence: p.persistence, lacunarity: p.lacunarity,
      ridgeBlend: p.ridgeBlend, warp: p.warp, exponent: p.exponent,
    });
  }
  if (t === "shape") {
    if (!inputs[0]) throw new Error("Shape node has no input");
    const copy = new Float32Array(inputs[0]);
    applyPresetShape(p.presetId, copy, size);
    return copy;
  }
  if (t === "erode") {
    if (!inputs[0]) throw new Error("Erode node has no input");
    const copy = new Float32Array(inputs[0]);
    erode(copy, size, {
      iterations: p.iterations, erosion: p.erosion,
      deposition: p.deposition, inertia: p.inertia, seed: p.seed,
    });
    return copy;
  }
  if (t === "combine") {
    if (!inputs[0] || !inputs[1]) throw new Error("Combine needs 2 inputs");
    return combineHeightmaps(inputs[0], inputs[1], size, p.mode, p.blend);
  }
  if (t === "mask") {
    if (!inputs[0] || !inputs[1]) throw new Error("Mask needs base + mask");
    const a = inputs[0]; const m = inputs[1];
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let mv = m[i];
      if (p.invert) mv = 1 - mv;
      out[i] = a[i] * mv;
    }
    return out;
  }
  if (t === "blur") {
    if (!inputs[0]) throw new Error("Blur needs input");
    let cur = new Float32Array(inputs[0]);
    for (let pass = 0; pass < (p.passes | 0 || 1); pass++) cur = boxBlur(cur, size, p.radius);
    return cur;
  }
  if (t === "terrace") {
    if (!inputs[0]) throw new Error("Terrace needs input");
    const a = inputs[0];
    const out = new Float32Array(a.length);
    const steps = Math.max(1, p.steps | 0);
    const sharp = Math.max(0, Math.min(1, p.sharpness));
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      const stepped = Math.floor(v * steps) / steps;
      out[i] = stepped * sharp + v * (1 - sharp);
    }
    return out;
  }
  if (t === "curve") {
    if (!inputs[0]) throw new Error("Curve needs input");
    const a = inputs[0];
    const out = new Float32Array(a.length);
    const g = Math.max(0.05, p.gamma);
    const gain = p.gain;
    const bias = p.bias;
    for (let i = 0; i < a.length; i++) {
      const v = Math.max(0, Math.min(1, a[i] + bias));
      out[i] = Math.max(0, Math.min(1, Math.pow(v, 1 / g) * gain));
    }
    return out;
  }
  if (t === "clip") {
    if (!inputs[0]) throw new Error("Clip needs input");
    const a = inputs[0];
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = Math.max(p.min, Math.min(p.max, a[i]));
    return out;
  }
  if (t === "normalize") {
    if (!inputs[0]) throw new Error("Normalize needs input");
    const a = inputs[0];
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < a.length; i++) { if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
    const out = new Float32Array(a.length);
    const range = mx - mn || 1;
    const lo = p.lo, hi = p.hi;
    for (let i = 0; i < a.length; i++) out[i] = lo + ((a[i] - mn) / range) * (hi - lo);
    return out;
  }
  if (t === "warp") {
    if (!inputs[0]) throw new Error("Warp needs input");
    const a = inputs[0];
    const out = new Float32Array(a.length);
    const amt = p.amount;
    const freq = p.frequency;
    const sd = p.seed >>> 0;
    // tiny hash-based offset noise
    const hash = (x, y) => {
      let h = (x * 374761393 + y * 668265263 + sd * 1597334677) >>> 0;
      h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
      return ((h ^ (h >>> 16)) / 0xffffffff) - 0.5;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ox = hash(Math.floor(x * freq), Math.floor(y * freq)) * amt * size;
        const oy = hash(Math.floor(x * freq) + 7919, Math.floor(y * freq) + 7919) * amt * size;
        const sx = Math.max(0, Math.min(size - 1, Math.round(x + ox)));
        const sy = Math.max(0, Math.min(size - 1, Math.round(y + oy)));
        out[y * size + x] = a[sy * size + sx];
      }
    }
    return out;
  }
  if (t === "river") {
    if (!inputs[0]) throw new Error("River needs input");
    const a = inputs[0];
    let mask = riverMask(a, size, { threshold: p.threshold });
    if (p.width > 1) mask = dilate(mask, size, p.width - 1);
    const out = new Float32Array(a);
    for (let i = 0; i < a.length; i++) {
      out[i] = Math.max(0, out[i] - mask[i] * p.depth);
    }
    return out;
  }
  if (t === "lake") {
    if (!inputs[0]) throw new Error("Lake needs input");
    const a = inputs[0];
    const lake = lakeMask(a, size, { fillDepth: p.fillDepth, minArea: p.minArea });
    const out = new Float32Array(a);
    for (let i = 0; i < a.length; i++) {
      if (lake[i] > 0) out[i] = a[i] - p.depth;
    }
    return out;
  }
  if (t === "sea") {
    if (!inputs[0]) throw new Error("Sea needs input");
    const a = inputs[0];
    const out = new Float32Array(a);
    if (p.flatten) {
      for (let i = 0; i < a.length; i++) {
        if (out[i] < p.level) out[i] = p.level;
      }
    }
    return out;
  }
  if (t === "rain") {
    if (!inputs[0]) throw new Error("Rain needs input");
    const a = inputs[0];
    const acc = rainAccumulation(a, size, { intensity: p.intensity });
    const out = new Float32Array(a);
    // Optional gentle erosion proportional to rain accumulation
    const w = p.erodeWeight;
    if (w > 0) {
      for (let i = 0; i < a.length; i++) {
        out[i] = Math.max(0, a[i] - acc[i] * w);
      }
    }
    return out;
  }
  if (t === "output") {
    return inputs[0] || new Float32Array(size * size);
  }
  throw new Error("Unknown node type: " + t);
}

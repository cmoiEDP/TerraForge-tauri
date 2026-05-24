// Graph executor : topological sort + memoized compute.
// Each node has type + params, produces a Float32Array heightmap (size×size).

import { generateHeightmap, erode } from "@/TerraForge/lib/terrainGen";
import { generateHeightmapGPU, isWebGPUAvailable } from "@/TerraForge/lib/webgpu/gpuNoise";
import { applyPresetShape } from "@/TerraForge/lib/shapes";
import { combineHeightmaps } from "@/TerraForge/lib/combine";

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
    defaults: {
      iterations: 30000, erosion: 0.3, deposition: 0.3, inertia: 0.05, seed: 42,
    },
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
  output: {
    label: "Output",
    inputs: ["heightmap"],
    output: null,
    defaults: {},
  },
};

function dependencyOrder(nodes, edges, terminalId) {
  // Build adjacency: node -> list of upstream nodes per input slot
  const upstream = new Map(); // nodeId -> Array<{ sourceId, slot }>
  for (const n of nodes) upstream.set(n.id, []);
  for (const e of edges) {
    const targetSlot = parseInt(e.targetHandle?.replace("in-", "") || "0", 10);
    upstream.get(e.target).push({ sourceId: e.source, slot: targetSlot });
  }
  // DFS post-order from terminal
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
  const results = new Map(); // nodeId -> Float32Array
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
  if (t === "output") {
    return inputs[0] || new Float32Array(size * size);
  }
  throw new Error("Unknown node type: " + t);
}

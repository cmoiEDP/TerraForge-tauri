// Rule-based / geological terrain generation.
//
// 1) Tectonic plates: distribute random "fault ridges" via Voronoi-like cells, build elevation
//    by distance-to-nearest-fault (high near faults = mountain ranges, low = plains/sea).
// 2) Continental shelf: distance-to-edge mask to keep oceans on the borders or use a continent
//    shape (radial bias).
// 3) Hydrology: derive a river network from the tectonic base, then carve channels following
//    the watersheds (steepest-descent backbone).
//
// All deterministic via `seed`.

import { flowAccumulation } from "./water";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Tectonic base : distance to nearest plate boundary (uplift along faults) ───
export function tectonicBase(size, opts = {}) {
  const {
    seed = 1337, plateCount = 16, continentBias = 0.55, mountainSharpness = 1.5,
    seaFalloff = 0.25, // how strong borders fade to sea
  } = opts;
  const rnd = mulberry32(seed);
  // Generate plate centers
  const plates = [];
  for (let i = 0; i < plateCount; i++) {
    plates.push({
      x: rnd() * size, y: rnd() * size,
      // plate "type": 0..1, controls uplift strength (continental vs oceanic)
      uplift: rnd(),
    });
  }
  const h = new Float32Array(size * size);
  // For each cell : find 2 nearest plates → distance to fault = (d2 - d1)
  // Uplift increases NEAR the fault (small d2 - d1).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity, d2 = Infinity, p1 = null, p2 = null;
      for (let k = 0; k < plates.length; k++) {
        const p = plates[k];
        const dx = (p.x - x), dy = (p.y - y);
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; p2 = p1; d1 = d; p1 = p; }
        else if (d < d2) { d2 = d; p2 = p; }
      }
      const fault = Math.sqrt(d2) - Math.sqrt(d1); // 0 on boundary, larger inside cell
      const uplift = (p1 && p2 ? (p1.uplift + p2.uplift) * 0.5 : 0.5);
      // High near fault when both plates are "continental"
      const ridge = Math.exp(-Math.pow(fault / (size * 0.06), mountainSharpness)) * uplift;
      // Continent bias: radial — lower at edges (sea), higher at center
      const cx = x - size * 0.5, cy = y - size * 0.5;
      const radial = 1 - Math.min(1, Math.sqrt(cx * cx + cy * cy) / (size * 0.55));
      const continent = radial * continentBias + (1 - continentBias);
      h[y * size + x] = Math.max(0, Math.min(1, ridge * 0.85 * continent + (continent - seaFalloff) * 0.35 + 0.05));
    }
  }
  return h;
}

// ─── Add procedural noise detail on top of the tectonic base ───
export function addDetailLayer(h, size, opts = {}) {
  const { seed = 17, scale = 0.008, octaves = 5, amplitude = 0.20 } = opts;
  const rnd = mulberry32(seed);
  // Pre-generate octave seeds
  const octSeeds = new Array(octaves).fill(0).map(() => (rnd() * 0xffffffff) >>> 0);
  // Hash-based value noise
  const hashCell = (x, y, s) => {
    let v = (x * 1597334677 + y * 3812015801 + s * 2654435761) >>> 0;
    v ^= v >>> 16; v = Math.imul(v, 2246822519);
    v ^= v >>> 13; v = Math.imul(v, 3266489917);
    v ^= v >>> 16;
    return (v >>> 0) / 4294967295;
  };
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const vnoise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smoothstep(xf), v = smoothstep(yf);
    const a = hashCell(xi, yi, s);
    const b = hashCell(xi + 1, yi, s);
    const c = hashCell(xi, yi + 1, s);
    const d = hashCell(xi + 1, yi + 1, s);
    return (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) * 2 - 1;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const n = vnoise(x * scale * freq, y * scale * freq, octSeeds[o]);
        sum += n * amp; norm += amp;
        amp *= 0.55; freq *= 2.0;
      }
      const i = y * size + x;
      h[i] = Math.max(0, Math.min(1, h[i] + (sum / norm) * amplitude));
    }
  }
  return h;
}

// ─── River network : carve channels along D8 flow accumulation backbone ───
export function carveRiverNetwork(h, size, opts = {}) {
  const {
    threshold = 80,     // min flow accumulation to be a river
    carveDepth = 0.05,  // max depth carved
    widthFalloff = 4,   // how wide a strong river bed is (px)
    erodeFactor = 0.4,  // sediment transport intensity (0=none, 1=full flow erosion)
  } = opts;
  const { acc, drains } = flowAccumulation(h, size);
  const N = size * size;
  let maxAcc = 0;
  for (let i = 0; i < N; i++) if (acc[i] > maxAcc) maxAcc = acc[i];
  const normAcc = Math.max(1, Math.sqrt(maxAcc));

  // 1) Build river strength mask (0..1)
  const river = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (acc[i] > threshold) {
      river[i] = Math.min(1, Math.sqrt(acc[i]) / normAcc);
    }
  }

  // 2) Carve : subtract river-strength * carveDepth, with neighbor smoothing for width
  const out = new Float32Array(h);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const r = river[i];
      if (r <= 0) continue;
      const w = Math.max(1, Math.floor(widthFalloff * r));
      for (let oy = -w; oy <= w; oy++) {
        for (let ox = -w; ox <= w; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const d = Math.sqrt(ox * ox + oy * oy) / Math.max(1, w);
          const falloff = Math.max(0, 1 - d);
          const j = ny * size + nx;
          out[j] = Math.max(0, out[j] - r * carveDepth * falloff);
        }
      }
    }
  }

  // 3) Sediment transport : pour acc[i] * erodeFactor of height redistribution downstream
  // Simple: each river cell loses a tiny bit of height, deposits at its drain target.
  if (erodeFactor > 0) {
    for (let i = 0; i < N; i++) {
      if (river[i] <= 0) continue;
      const d = drains[i];
      if (d < 0) continue;
      const xfer = river[i] * 0.01 * erodeFactor;
      out[i] = Math.max(0, out[i] - xfer);
      out[d] = Math.min(1, out[d] + xfer * 0.3); // deposit a fraction downstream
    }
  }
  return out;
}

// ─── Full geological generator : tectonic + detail + rivers ───
export function generateGeoTerrain({ size, seed = 1337, plateCount, mountainSharpness = 1.5,
  continentBias = 0.55, detailAmplitude = 0.20, detailScale = 0.008,
  riverThreshold = 80, riverCarveDepth = 0.05, riverWidth = 4 } = {}) {
  const plates = plateCount || Math.max(6, Math.min(48, Math.floor(size / 96)));
  let h = tectonicBase(size, { seed, plateCount: plates, mountainSharpness, continentBias });
  h = addDetailLayer(h, size, { seed: seed + 7, scale: detailScale, amplitude: detailAmplitude });
  h = carveRiverNetwork(h, size, {
    threshold: riverThreshold, carveDepth: riverCarveDepth, widthFalloff: riverWidth,
  });
  return h;
}

// ─── Coverage / continuity helpers ───
// When user increases size from S0 to S1, plate count grows proportionally so feature density
// (mountains per km², rivers per km²) stays similar — i.e. true territorial extension, no zoom.
export function plateCountForSize(size, baseDensity = 96) {
  return Math.max(6, Math.min(120, Math.floor(size / baseDensity)));
}

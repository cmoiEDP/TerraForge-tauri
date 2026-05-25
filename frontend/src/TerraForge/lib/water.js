// Water simulation utilities — flow accumulation, lake detection, sea level, rain accumulation.
// All operate on Float32Array heightmaps in [0..1].

// Compute D8 flow direction + flow accumulation.
// Returns { acc: Float32Array (>=1 each cell), drains: Int32Array (next cell index, -1 if local min) }
export function flowAccumulation(h, size) {
  const N = size * size;
  const acc = new Float32Array(N).fill(1);
  const drains = new Int32Array(N).fill(-1);

  // D8 offsets
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];

  // Determine drain (lowest neighbor) per cell
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hi = h[i];
      let bestJ = -1;
      let bestDrop = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + dx[k], ny = y + dy[k];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx;
        const drop = hi - h[j];
        if (drop > bestDrop) { bestDrop = drop; bestJ = j; }
      }
      drains[i] = bestJ;
    }
  }

  // Sort cells by elevation descending, then push acc downstream
  const order = new Int32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  // Counting sort by quantized elevation for speed (256 buckets is enough)
  const BUCKETS = 1024;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  for (let i = 0; i < N; i++) {
    const b = Math.min(BUCKETS - 1, Math.max(0, Math.floor(h[i] * (BUCKETS - 1))));
    buckets[b].push(i);
  }
  let k = 0;
  for (let b = BUCKETS - 1; b >= 0; b--) {
    const bucket = buckets[b];
    for (let m = 0; m < bucket.length; m++) order[k++] = bucket[m];
  }

  for (let m = 0; m < N; m++) {
    const i = order[m];
    const d = drains[i];
    if (d >= 0) acc[d] += acc[i];
  }
  return { acc, drains };
}

// Build a river mask (Float32Array, 0 or strength) from flow accumulation.
// Cells with acc > threshold are flagged as rivers, intensity scales with sqrt(acc).
export function riverMask(h, size, opts = {}) {
  const { threshold = 80, strength = 1.0 } = opts;
  const { acc } = flowAccumulation(h, size);
  const mask = new Float32Array(size * size);
  const N = size * size;
  let maxAcc = 0;
  for (let i = 0; i < N; i++) if (acc[i] > maxAcc) maxAcc = acc[i];
  const norm = Math.max(1, Math.sqrt(maxAcc));
  for (let i = 0; i < N; i++) {
    if (acc[i] > threshold) {
      mask[i] = Math.min(1, (Math.sqrt(acc[i]) / norm) * strength);
    }
  }
  return mask;
}

// Sea / ocean: every cell below seaLevel is flagged 1.0, fading 0.05 unit above.
export function seaMask(h, size, seaLevel = 0.18) {
  const mask = new Float32Array(size * size);
  const fade = 0.05;
  const N = size * size;
  for (let i = 0; i < N; i++) {
    if (h[i] <= seaLevel) mask[i] = 1;
    else if (h[i] < seaLevel + fade) mask[i] = 1 - (h[i] - seaLevel) / fade;
  }
  return mask;
}

// Detect interior local minima then flood-fill upward to a lake water level.
// Returns a mask of lake water height (relative to original ground).
export function lakeMask(h, size, opts = {}) {
  const { fillDepth = 0.04, minArea = 8, seaLevel = -1 } = opts;
  const N = size * size;
  const visited = new Uint8Array(N);
  const lake = new Float32Array(N);

  // For each unvisited cell, find a basin by flood-filling cells with h <= fillLevel
  // Heuristic : start from local minima, flood while elevation < min + fillDepth.
  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];

  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (visited[i]) continue;
      const hi = h[i];
      if (seaLevel >= 0 && hi <= seaLevel) { visited[i] = 1; continue; }

      // Check if local min (strictly lower than 8 neighbors)
      let isMin = true;
      for (let oy = -1; oy <= 1 && isMin; oy++) {
        for (let ox = -1; ox <= 1 && isMin; ox++) {
          if (ox === 0 && oy === 0) continue;
          if (h[(y + oy) * size + (x + ox)] < hi) isMin = false;
        }
      }
      if (!isMin) continue;

      // Flood-fill BFS up to hi + fillDepth
      const fillLevel = hi + fillDepth;
      const stack = [i];
      const visitedRun = [];
      while (stack.length) {
        const j = stack.pop();
        if (visited[j]) continue;
        if (h[j] > fillLevel) continue;
        visited[j] = 1;
        visitedRun.push(j);
        const jx = j % size, jy = (j / size) | 0;
        for (let k = 0; k < 4; k++) {
          const nx = jx + dx[k], ny = jy + dy[k];
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          stack.push(ny * size + nx);
        }
      }
      if (visitedRun.length >= minArea) {
        for (const j of visitedRun) lake[j] = fillLevel - h[j];
      } else {
        for (const j of visitedRun) visited[j] = 0; // release small areas
      }
    }
  }
  return lake;
}

// Combine sea + lake + river into a single RGBA water overlay (Uint8ClampedArray)
// Sea = deep blue, Lakes = mid blue, Rivers = bright cyan.
export function waterOverlayRGBA(h, size, opts = {}) {
  const {
    seaLevel = 0.18, lakeFill = 0.04, riverThreshold = 80,
    rivers = true, lakes = true, sea = true,
  } = opts;
  const N = size * size;
  const rgba = new Uint8ClampedArray(N * 4);

  const seaM = sea ? seaMask(h, size, seaLevel) : new Float32Array(N);
  const lakeM = lakes ? lakeMask(h, size, { fillDepth: lakeFill, seaLevel: sea ? seaLevel : -1 }) : new Float32Array(N);
  const riverM = rivers ? riverMask(h, size, { threshold: riverThreshold }) : new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const s = seaM[i], l = lakeM[i], r = riverM[i];
    if (s > 0) {
      rgba[i * 4] = 22; rgba[i * 4 + 1] = 48; rgba[i * 4 + 2] = 92;
      rgba[i * 4 + 3] = Math.round(s * 255);
    } else if (l > 0) {
      rgba[i * 4] = 56; rgba[i * 4 + 1] = 110; rgba[i * 4 + 2] = 165;
      rgba[i * 4 + 3] = Math.round(Math.min(1, l * 20 + 0.4) * 230);
    } else if (r > 0) {
      rgba[i * 4] = 110; rgba[i * 4 + 1] = 200; rgba[i * 4 + 2] = 230;
      rgba[i * 4 + 3] = Math.round(r * 255);
    }
  }
  return rgba;
}

// Rain accumulator — simulate uniform rainfall, accumulate downhill.
// Returns Float32Array of accumulated water per cell, normalized to [0..1].
export function rainAccumulation(h, size, opts = {}) {
  const { intensity = 1.0 } = opts;
  const { acc } = flowAccumulation(h, size);
  const N = size * size;
  const out = new Float32Array(N);
  let max = 1;
  for (let i = 0; i < N; i++) if (acc[i] > max) max = acc[i];
  const inv = intensity / Math.log(1 + max);
  for (let i = 0; i < N; i++) out[i] = Math.min(1, Math.log(1 + acc[i]) * inv);
  return out;
}

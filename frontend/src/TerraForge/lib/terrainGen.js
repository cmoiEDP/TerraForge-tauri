// Procedural terrain generation: fractal Brownian motion + ridged noise + hydraulic erosion
import { createNoise2D } from "simplex-noise";

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// fbm + ridged blend
export function generateHeightmap({
  size,
  seed = 1337,
  scale = 0.0018,
  octaves = 7,
  persistence = 0.5,
  lacunarity = 2.0,
  ridgeBlend = 0.4,
  warp = 0.3,
  exponent = 1.4,
  onProgress = null,
}) {
  const rng = mulberry32(seed);
  const noise = createNoise2D(rng);
  const noiseWarp = createNoise2D(rng);

  const data = new Float32Array(size * size);
  let mn = Infinity;
  let mx = -Infinity;
  const reportEvery = Math.max(1, Math.floor(size / 16));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = noiseWarp(x * scale * 0.5, y * scale * 0.5) * warp * 200;
      const wy = noiseWarp(x * scale * 0.5 + 100, y * scale * 0.5 + 100) * warp * 200;
      let amp = 1;
      let freq = 1;
      let fbm = 0;
      let ridged = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const nx = (x + wx) * scale * freq;
        const ny = (y + wy) * scale * freq;
        const n = noise(nx, ny);
        fbm += n * amp;
        ridged += (1 - Math.abs(n)) * amp;
        norm += amp;
        amp *= persistence;
        freq *= lacunarity;
      }
      fbm = fbm / norm; // [-1,1]
      ridged = ridged / norm; // [0,1]
      let h = (fbm * 0.5 + 0.5) * (1 - ridgeBlend) + ridged * ridgeBlend;
      h = Math.pow(Math.max(0, Math.min(1, h)), exponent);
      data[y * size + x] = h;
      if (h < mn) mn = h;
      if (h > mx) mx = h;
    }
    if (onProgress && y % reportEvery === 0) {
      onProgress(y / size * 0.6); // 0..60% generation
    }
  }
  // normalize
  const rng2 = mx - mn || 1;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - mn) / rng2;
  return data;
}

// Simple hydraulic erosion (particle-based)
export function erode(heightmap, size, {
  iterations = 50000,
  inertia = 0.05,
  capacity = 4.0,
  minSlope = 0.01,
  deposition = 0.3,
  erosion = 0.3,
  evaporation = 0.01,
  gravity = 4,
  maxLifetime = 30,
  initialWater = 1,
  initialSpeed = 1,
  seed = 42,
  onProgress = null,
} = {}) {
  const rng = mulberry32(seed);
  const reportEvery = Math.max(1, Math.floor(iterations / 20));
  const h = heightmap;
  const N = size;

  function gradient(px, py) {
    const x = Math.max(0, Math.min(N - 2, Math.floor(px)));
    const y = Math.max(0, Math.min(N - 2, Math.floor(py)));
    const fx = px - x;
    const fy = py - y;
    const h00 = h[y * N + x];
    const h10 = h[y * N + x + 1];
    const h01 = h[(y + 1) * N + x];
    const h11 = h[(y + 1) * N + x + 1];
    const gx = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
    const gy = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
    const height = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
    return { gx, gy, height };
  }

  function deposit(px, py, amount) {
    const x = Math.max(0, Math.min(N - 2, Math.floor(px)));
    const y = Math.max(0, Math.min(N - 2, Math.floor(py)));
    const fx = px - x;
    const fy = py - y;
    h[y * N + x] += amount * (1 - fx) * (1 - fy);
    h[y * N + x + 1] += amount * fx * (1 - fy);
    h[(y + 1) * N + x] += amount * (1 - fx) * fy;
    h[(y + 1) * N + x + 1] += amount * fx * fy;
  }

  function erodeAt(px, py, amount) {
    const radius = 3;
    const x0 = Math.max(0, Math.floor(px - radius));
    const x1 = Math.min(N - 1, Math.floor(px + radius));
    const y0 = Math.max(0, Math.floor(py - radius));
    const y1 = Math.min(N - 1, Math.floor(py + radius));
    let total = 0;
    const weights = [];
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d = Math.sqrt((xx - px) ** 2 + (yy - py) ** 2);
        const w = Math.max(0, radius - d);
        total += w;
        weights.push({ idx: yy * N + xx, w });
      }
    }
    if (total === 0) return;
    for (const { idx, w } of weights) {
      const dh = amount * (w / total);
      h[idx] = Math.max(0, h[idx] - dh);
    }
  }

  for (let i = 0; i < iterations; i++) {
    let px = rng() * (N - 1);
    let py = rng() * (N - 1);
    let dx = 0;
    let dy = 0;
    let speed = initialSpeed;
    let water = initialWater;
    let sediment = 0;
    for (let life = 0; life < maxLifetime; life++) {
      const { gx, gy, height } = gradient(px, py);
      dx = dx * inertia - gx * (1 - inertia);
      dy = dy * inertia - gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len !== 0) { dx /= len; dy /= len; }
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || nx >= N - 1 || ny < 0 || ny >= N - 1) break;
      const newHeight = gradient(nx, ny).height;
      const dh = newHeight - height;
      const cap = Math.max(-dh, minSlope) * speed * water * capacity;
      if (sediment > cap || dh > 0) {
        const depAmt = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * deposition;
        sediment -= depAmt;
        deposit(px, py, depAmt);
      } else {
        const erAmt = Math.min((cap - sediment) * erosion, -dh);
        sediment += erAmt;
        erodeAt(px, py, erAmt);
      }
      speed = Math.sqrt(Math.max(0, speed * speed + (-dh) * gravity));
      water *= (1 - evaporation);
      px = nx;
      py = ny;
    }
    if (onProgress && i % reportEvery === 0) {
      onProgress(0.6 + (i / iterations) * 0.4);
    }
  }
  // renormalize
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < h.length; i++) {
    if (h[i] < mn) mn = h[i];
    if (h[i] > mx) mx = h[i];
  }
  const range = mx - mn || 1;
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) / range;
  return h;
}

// Bicubic upscale + fractal detail re-synthesis
export function upscaleWithDetail(srcData, srcSize, dstSize, {
  detailStrength = 0.15,
  detailOctaves = 4,
  detailScale = 0.01,
  seed = 7,
  preserveRidges = true,
  onProgress = null,
} = {}) {
  const dst = new Float32Array(dstSize * dstSize);
  const ratio = (srcSize - 1) / (dstSize - 1);
  const rng = mulberry32(seed);
  const noise = createNoise2D(rng);

  function cubic(p0, p1, p2, p3, t) {
    const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c = -0.5 * p0 + 0.5 * p2;
    const d = p1;
    return a * t * t * t + b * t * t + c * t + d;
  }
  function sample(x, y) {
    x = Math.max(0, Math.min(srcSize - 1, x));
    y = Math.max(0, Math.min(srcSize - 1, y));
    return srcData[y * srcSize + x];
  }

  const reportEvery = Math.max(1, Math.floor(dstSize / 20));
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const sx = x * ratio;
      const sy = y * ratio;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      const col = [];
      for (let m = -1; m <= 2; m++) {
        const row = [];
        for (let n = -1; n <= 2; n++) {
          row.push(sample(ix + n, iy + m));
        }
        col.push(cubic(row[0], row[1], row[2], row[3], fx));
      }
      let h = cubic(col[0], col[1], col[2], col[3], fy);

      // gradient magnitude (edge-aware)
      const gx = (sample(ix + 1, iy) - sample(ix - 1, iy)) * 0.5;
      const gy = (sample(ix, iy + 1) - sample(ix, iy - 1)) * 0.5;
      const grad = Math.min(1, Math.hypot(gx, gy) * 12);

      // fractal detail
      let detail = 0;
      let amp = 1, freq = 1, norm = 0;
      for (let o = 0; o < detailOctaves; o++) {
        detail += noise(x * detailScale * freq, y * detailScale * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
      }
      detail /= norm; // [-1,1]
      const weight = preserveRidges ? (0.3 + 0.7 * grad) : 1.0;
      h += detail * detailStrength * weight;
      dst[y * dstSize + x] = Math.max(0, Math.min(1, h));
    }
    if (onProgress && y % reportEvery === 0) {
      onProgress(y / dstSize);
    }
  }
  return dst;
}

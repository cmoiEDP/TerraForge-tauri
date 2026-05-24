// Per-preset shape post-processing. Applied AFTER noise generation to make each preset
// visually distinct (instead of just being a noise param tweak).
// All shape functions take heightmap in place and return it. h is Float32Array 0..1.

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

function normalize(h) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < h.length; i++) { if (h[i] < mn) mn = h[i]; if (h[i] > mx) mx = h[i]; }
  const r = mx - mn || 1;
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) / r;
  return h;
}

// Radial cone mask: 1 at center, 0 at edges. Power controls steepness.
function radialMask(size, power = 2.0, innerRadius = 0.0) {
  const mask = new Float32Array(size * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR;
      let v = 1 - smoothstep(innerRadius, 1.0, d);
      v = Math.pow(v, power);
      mask[y * size + x] = v;
    }
  }
  return mask;
}

// Identity (no post-process)
export function shapeIdentity(h) { return h; }

// Alpine: sharpen peaks
export function shapeAlpine(h) {
  for (let i = 0; i < h.length; i++) {
    h[i] = Math.pow(h[i], 0.85);
  }
  return normalize(h);
}

// Rolling Hills: soften, push to mid-range
export function shapeRolling(h) {
  for (let i = 0; i < h.length; i++) {
    h[i] = Math.pow(h[i], 1.1) * 0.7 + 0.15;
  }
  return normalize(h);
}

// Desert Mesa: flat-topped plateaus (clamp + step pattern)
export function shapeMesa(h) {
  for (let i = 0; i < h.length; i++) {
    let v = h[i];
    // Quantize into 4 plateau levels with smooth edges
    const levels = 4;
    const lv = v * levels;
    const base = Math.floor(lv);
    const frac = lv - base;
    const edge = smoothstep(0.85, 1.0, frac) * 0.15;
    v = (base + edge) / levels + frac * 0.05;
    h[i] = v;
  }
  return normalize(h);
}

// Volcanic Island: radial cone + crater dip in center + lower to water at edges
export function shapeVolcanic(h, size) {
  const mask = radialMask(size, 1.8, 0.1);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const d = Math.hypot(x - cx, y - cy) / maxR;
      let v = h[i];
      // multiply by cone mask
      v = v * 0.4 + mask[i] * 0.7;
      // crater dip near center
      const craterT = smoothstep(0, 0.08, d);
      const craterDepth = 0.25 * (1 - craterT);
      v -= craterDepth;
      h[i] = Math.max(0, v);
    }
  }
  return normalize(h);
}

// Archipelago: radial falloff to water + bias many small islands
export function shapeArchipelago(h, size) {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const d = Math.hypot(x - cx, y - cy) / maxR;
      // pull edges underwater
      const edgeFalloff = 1 - smoothstep(0.55, 1.0, d);
      // emphasize highs (islands) and depress lows (water)
      let v = h[i];
      v = Math.pow(v, 1.4); // steepen
      v = v * edgeFalloff * 0.85 + 0.05;
      h[i] = v;
    }
  }
  return normalize(h);
}

// Canyon: take inverted ridged noise and gouge linear cuts across.
// Apply strong vertical/horizontal carving inspired by river valleys.
export function shapeCanyon(h, size) {
  // Carving pattern: a wavy "river" channel along x using a sine-perturbed centerline.
  // Wherever a pixel is close to the channel, we lower the height.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // 2 winding channels
      const ch1 = size * 0.4 + Math.sin(x * 0.025) * size * 0.12 + Math.sin(x * 0.07) * size * 0.04;
      const ch2 = size * 0.7 + Math.sin(x * 0.018 + 1.3) * size * 0.10;
      const d1 = Math.abs(y - ch1);
      const d2 = Math.abs(y - ch2);
      const d = Math.min(d1, d2);
      const carveRadius = size * 0.03;
      const carve = 1 - smoothstep(carveRadius * 0.4, carveRadius * 2.2, d);
      let v = h[i];
      // High elevation overall, then carve deep narrow valleys
      v = Math.pow(v, 0.9) * 0.7 + 0.25;
      v -= carve * 0.55;
      h[i] = Math.max(0, v);
    }
  }
  return normalize(h);
}

// High Plateau: lift mid-range, flatten top
export function shapePlateau(h) {
  for (let i = 0; i < h.length; i++) {
    let v = h[i];
    // S-curve: lows stay low, mids lift fast, highs plateau
    v = smoothstep(0.15, 0.55, v) * 0.7 + v * 0.3;
    // flatten near top
    if (v > 0.7) v = 0.7 + (v - 0.7) * 0.3;
    h[i] = v;
  }
  return normalize(h);
}

// Dispatch by preset id
export function applyPresetShape(presetId, h, size) {
  switch (presetId) {
    case "alpine": return shapeAlpine(h);
    case "rolling": return shapeRolling(h);
    case "desert": return shapeMesa(h);
    case "volcanic": return shapeVolcanic(h, size);
    case "archipelago": return shapeArchipelago(h, size);
    case "canyon": return shapeCanyon(h, size);
    case "plateau": return shapePlateau(h);
    default: return h;
  }
}

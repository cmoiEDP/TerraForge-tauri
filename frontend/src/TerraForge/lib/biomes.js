// Biome classification → splatmap (RGBA, each channel = a biome weight)
// R = sand/beach, G = grass, B = rock, A = snow
// Water is implicit (height < waterLevel). Exported separately if needed.

export const DEFAULT_BIOME_PARAMS = {
  waterLevel: 0.12,
  sandWidth: 0.05,
  grassMax: 0.55,
  rockMax: 0.82,
  slopeBias: 0.45,
  blendSoftness: 0.04,
};

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}

// Compute slope at pixel using central differences
export function computeSlopeMap(height, size) {
  const slope = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(size - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(size - 1, y + 1);
      const dx = height[y * size + xr] - height[y * size + xl];
      const dy = height[yd * size + x] - height[yu * size + x];
      slope[y * size + x] = Math.min(1, Math.hypot(dx, dy) * size * 0.05);
    }
  }
  return slope;
}

// Returns { splatmap: Uint8ClampedArray (RGBA), waterMask: Uint8Array, slopeMap: Float32Array }
export function computeBiomeSplatmap(height, size, params = DEFAULT_BIOME_PARAMS) {
  const { waterLevel, sandWidth, grassMax, rockMax, slopeBias, blendSoftness } = params;
  const slope = computeSlopeMap(height, size);
  const splat = new Uint8ClampedArray(size * size * 4);
  const waterMask = new Uint8Array(size * size);

  for (let i = 0; i < size * size; i++) {
    const h = height[i];
    const s = slope[i];
    if (h < waterLevel) {
      waterMask[i] = 255;
      splat[i * 4] = 0;
      splat[i * 4 + 1] = 0;
      splat[i * 4 + 2] = 0;
      splat[i * 4 + 3] = 0;
      continue;
    }
    const hN = (h - waterLevel) / (1 - waterLevel + 1e-6);

    // Weight curves with smoothstep transitions
    const wSand = (1 - smoothstep(sandWidth - blendSoftness, sandWidth + blendSoftness, hN)) * (1 - s * slopeBias);
    const wGrass = smoothstep(sandWidth - blendSoftness, sandWidth + blendSoftness, hN)
                 * (1 - smoothstep(grassMax - blendSoftness, grassMax + blendSoftness, hN))
                 * (1 - s * slopeBias);
    const wRock = smoothstep(grassMax - blendSoftness, grassMax + blendSoftness, hN)
                * (1 - smoothstep(rockMax - blendSoftness, rockMax + blendSoftness, hN))
                + s * slopeBias * 0.7;
    const wSnow = smoothstep(rockMax - blendSoftness, rockMax + blendSoftness, hN);

    const total = wSand + wGrass + wRock + wSnow + 1e-6;
    splat[i * 4] = Math.round((wSand / total) * 255);
    splat[i * 4 + 1] = Math.round((wGrass / total) * 255);
    splat[i * 4 + 2] = Math.round((wRock / total) * 255);
    splat[i * 4 + 3] = Math.round((wSnow / total) * 255);
  }
  return { splatmap: splat, waterMask, slopeMap: slope };
}

// Color preview from splat + height (for the 3D viewer)
export function biomeColorAt(h, s, params = DEFAULT_BIOME_PARAMS) {
  const { waterLevel, sandWidth, grassMax, rockMax, slopeBias, blendSoftness } = params;
  if (h < waterLevel) {
    const d = (waterLevel - h) / (waterLevel + 1e-6);
    return [0.05 + 0.05 * (1 - d), 0.18 + 0.10 * (1 - d), 0.28 + 0.10 * (1 - d)];
  }
  const hN = (h - waterLevel) / (1 - waterLevel + 1e-6);
  const wSand = (1 - smoothstep(sandWidth - blendSoftness, sandWidth + blendSoftness, hN)) * (1 - s * slopeBias);
  const wGrass = smoothstep(sandWidth - blendSoftness, sandWidth + blendSoftness, hN)
               * (1 - smoothstep(grassMax - blendSoftness, grassMax + blendSoftness, hN))
               * (1 - s * slopeBias);
  const wRock = smoothstep(grassMax - blendSoftness, grassMax + blendSoftness, hN)
              * (1 - smoothstep(rockMax - blendSoftness, rockMax + blendSoftness, hN))
              + s * slopeBias * 0.7;
  const wSnow = smoothstep(rockMax - blendSoftness, rockMax + blendSoftness, hN);
  const total = wSand + wGrass + wRock + wSnow + 1e-6;
  const cSand = [0.78, 0.68, 0.45];
  const cGrass = [0.32, 0.46, 0.22];
  const cRock = [0.42, 0.38, 0.34];
  const cSnow = [0.95, 0.95, 0.97];
  return [
    (cSand[0] * wSand + cGrass[0] * wGrass + cRock[0] * wRock + cSnow[0] * wSnow) / total,
    (cSand[1] * wSand + cGrass[1] * wGrass + cRock[1] * wRock + cSnow[1] * wSnow) / total,
    (cSand[2] * wSand + cGrass[2] * wGrass + cRock[2] * wRock + cSnow[2] * wSnow) / total,
  ];
}

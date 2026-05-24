// Curated heightmap presets. Each preset sets generator + erosion + biome + water defaults.
export const PRESETS = [
  {
    id: "alpine",
    name: "Alpine Peaks",
    tag: "snow · ridges",
    gen: { scale: 0.0020, octaves: 8, persistence: 0.50, ridgeBlend: 0.75, warp: 0.20, exponent: 1.7 },
    erosion: { iterations: 80000, erosion: 0.45, deposition: 0.20, inertia: 0.05 },
    biome: { waterLevel: 0.12, sandWidth: 0.04, grassMax: 0.45, rockMax: 0.78, slopeBias: 0.55 },
  },
  {
    id: "rolling",
    name: "Rolling Hills",
    tag: "green · soft",
    gen: { scale: 0.0014, octaves: 5, persistence: 0.55, ridgeBlend: 0.10, warp: 0.40, exponent: 1.0 },
    erosion: { iterations: 30000, erosion: 0.25, deposition: 0.40, inertia: 0.10 },
    biome: { waterLevel: 0.08, sandWidth: 0.05, grassMax: 0.78, rockMax: 0.95, slopeBias: 0.30 },
  },
  {
    id: "desert",
    name: "Desert Mesa",
    tag: "arid · plateau",
    gen: { scale: 0.0010, octaves: 6, persistence: 0.45, ridgeBlend: 0.30, warp: 0.15, exponent: 2.4 },
    erosion: { iterations: 60000, erosion: 0.35, deposition: 0.15, inertia: 0.07 },
    biome: { waterLevel: 0.00, sandWidth: 0.70, grassMax: 0.0, rockMax: 0.95, slopeBias: 0.40 },
  },
  {
    id: "volcanic",
    name: "Volcanic Island",
    tag: "cone · obsidian",
    gen: { scale: 0.0024, octaves: 7, persistence: 0.55, ridgeBlend: 0.55, warp: 0.50, exponent: 1.9 },
    erosion: { iterations: 50000, erosion: 0.40, deposition: 0.25, inertia: 0.08 },
    biome: { waterLevel: 0.20, sandWidth: 0.03, grassMax: 0.40, rockMax: 0.85, slopeBias: 0.50 },
  },
  {
    id: "archipelago",
    name: "Archipelago",
    tag: "water · islands",
    gen: { scale: 0.0030, octaves: 6, persistence: 0.50, ridgeBlend: 0.15, warp: 0.60, exponent: 1.2 },
    erosion: { iterations: 25000, erosion: 0.20, deposition: 0.35, inertia: 0.10 },
    biome: { waterLevel: 0.45, sandWidth: 0.06, grassMax: 0.80, rockMax: 0.95, slopeBias: 0.30 },
  },
  {
    id: "canyon",
    name: "Canyon",
    tag: "carved · river",
    gen: { scale: 0.0015, octaves: 6, persistence: 0.45, ridgeBlend: 0.40, warp: 0.10, exponent: 1.6 },
    erosion: { iterations: 120000, erosion: 0.55, deposition: 0.15, inertia: 0.04 },
    biome: { waterLevel: 0.05, sandWidth: 0.12, grassMax: 0.45, rockMax: 0.90, slopeBias: 0.45 },
  },
  {
    id: "plateau",
    name: "High Plateau",
    tag: "elevated · flat-top",
    gen: { scale: 0.0008, octaves: 5, persistence: 0.40, ridgeBlend: 0.20, warp: 0.20, exponent: 0.7 },
    erosion: { iterations: 40000, erosion: 0.30, deposition: 0.30, inertia: 0.08 },
    biome: { waterLevel: 0.06, sandWidth: 0.04, grassMax: 0.55, rockMax: 0.85, slopeBias: 0.40 },
  },
];

export function getPresetParams(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

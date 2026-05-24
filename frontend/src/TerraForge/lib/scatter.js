// Scatter dot maps for vegetation / props.
// Output : a high-res grayscale image (PNG) where each white dot = one instance placement
// for the user to import into Unity / Unreal procedural scattering.
// Algorithm : Poisson-like rejection sampling with per-pixel suitability.

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_SCATTER_LAYERS = [
  {
    id: "trees",
    name: "Trees",
    color: "#5fa86b",
    enabled: true,
    density: 0.65,
    minSpacing: 6,
    minHeight: 0.14,
    maxHeight: 0.62,
    maxSlope: 0.45,
    avoidWater: 0.03,
    jitter: 0.6,
    seed: 11,
  },
  {
    id: "bushes",
    name: "Bushes",
    color: "#8fb255",
    enabled: true,
    density: 0.85,
    minSpacing: 3,
    minHeight: 0.13,
    maxHeight: 0.75,
    maxSlope: 0.65,
    avoidWater: 0.015,
    jitter: 0.9,
    seed: 23,
  },
  {
    id: "rocks",
    name: "Rocks",
    color: "#9b9994",
    enabled: false,
    density: 0.40,
    minSpacing: 8,
    minHeight: 0.20,
    maxHeight: 0.95,
    maxSlope: 1.0,
    avoidWater: 0.02,
    jitter: 1.0,
    seed: 37,
  },
];

// Sample dot positions given a heightmap, slopemap and suitability rules
export function scatterPoints(height, slope, size, layer) {
  const rng = mulberry32(layer.seed);
  const points = [];
  const cellSize = Math.max(1, layer.minSpacing);
  const cols = Math.ceil(size / cellSize);
  const rows = Math.ceil(size / cellSize);
  // Targeted count : density * cells * (jitter for unevenness)
  const total = Math.floor(cols * rows * layer.density);
  let placed = 0;
  let attempts = 0;
  const maxAttempts = total * 8;
  const occupied = new Uint8Array(cols * rows);

  while (placed < total && attempts < maxAttempts) {
    attempts++;
    // pick a random cell, then jitter within the cell
    const cx = Math.floor(rng() * cols);
    const cy = Math.floor(rng() * rows);
    if (occupied[cy * cols + cx]) continue;
    const jitterX = (rng() - 0.5) * layer.jitter * cellSize;
    const jitterY = (rng() - 0.5) * layer.jitter * cellSize;
    const px = Math.max(0, Math.min(size - 1, Math.round(cx * cellSize + cellSize / 2 + jitterX)));
    const py = Math.max(0, Math.min(size - 1, Math.round(cy * cellSize + cellSize / 2 + jitterY)));
    const h = height[py * size + px];
    const s = slope[py * size + px];
    if (h < layer.minHeight + layer.avoidWater) continue;
    if (h > layer.maxHeight) continue;
    if (s > layer.maxSlope) continue;
    occupied[cy * cols + cx] = 1;
    points.push([px, py]);
    placed++;
  }
  return points;
}

// Rasterize dot points into a PNG-ready RGBA buffer (white dot on black bg).
// Dot radius is configurable per layer.
export function rasterizeDotMap(points, size, dotRadius = 1, colorHex = "#ffffff") {
  const data = new Uint8ClampedArray(size * size * 4);
  // black + alpha 255 background by default to keep file viewable
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 3] = 255;
  }
  // parse color
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);

  for (const [px, py] of points) {
    for (let dy = -dotRadius; dy <= dotRadius; dy++) {
      for (let dx = -dotRadius; dx <= dotRadius; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 > dotRadius * dotRadius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const i = (y * size + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

// Single-channel grayscale dot map (for Unity scatter weight map). 1 dot = 1 white pixel.
export function rasterizeDotMapGrayscale(points, size) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 3] = 255;
  }
  for (const [px, py] of points) {
    const i = (py * size + px) * 4;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
  }
  return data;
}

// Water classification mask : produces a per-pixel water class for export and visualization.
//   0 = land       (transparent / white)
//   1 = river      (cyan)
//   2 = lake       (blue)
//   3 = sea/ocean  (rose/magenta, as requested for clear distinction)
// Colors are chosen so they remain easy to pick / threshold in DCC apps (Photoshop wand, Substance).

import { flowAccumulation, lakeMask, seaMask } from "./water";

export const WATER_COLORS = {
  land:  [0, 0, 0, 0],            // transparent
  river: [110, 200, 230, 255],    // cyan
  lake:  [56,  110, 200, 255],    // blue
  sea:   [255, 90,  180, 255],    // rose / magenta — user request: pink == sea
};

// Returns Uint8Array(N) of class ids (0..3), AND an RGBA Uint8ClampedArray for direct image use.
export function classifyWater(h, size, opts = {}) {
  const {
    seaLevel = 0.18, lakeFill = 0.04, riverThreshold = 80,
    enableSea = true, enableLake = true, enableRiver = true,
  } = opts;
  const N = size * size;
  const cls = new Uint8Array(N);
  // Sea first (lowest priority gets overridden by inland water below)
  if (enableSea) {
    const sm = seaMask(h, size, seaLevel);
    for (let i = 0; i < N; i++) if (sm[i] > 0) cls[i] = 3;
  }
  if (enableLake) {
    const lm = lakeMask(h, size, { fillDepth: lakeFill, seaLevel: enableSea ? seaLevel : -1 });
    for (let i = 0; i < N; i++) if (lm[i] > 0 && cls[i] !== 3) cls[i] = 2;
  }
  if (enableRiver) {
    const { acc } = flowAccumulation(h, size);
    let maxAcc = 0; for (let i = 0; i < N; i++) if (acc[i] > maxAcc) maxAcc = acc[i];
    for (let i = 0; i < N; i++) {
      if (acc[i] > riverThreshold && cls[i] === 0) cls[i] = 1;
    }
  }
  const rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    let c = WATER_COLORS.land;
    if (cls[i] === 1) c = WATER_COLORS.river;
    else if (cls[i] === 2) c = WATER_COLORS.lake;
    else if (cls[i] === 3) c = WATER_COLORS.sea;
    rgba[i * 4]     = c[0];
    rgba[i * 4 + 1] = c[1];
    rgba[i * 4 + 2] = c[2];
    rgba[i * 4 + 3] = c[3];
  }
  return { cls, rgba };
}

// Export the water classification as a PNG (color-coded for DCC pipelines).
export function exportWaterMaskPNG(h, size, filename = "water_mask.png", opts = {}) {
  const { rgba } = classifyWater(h, size, opts);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

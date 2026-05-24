// Combine two heightmaps with various blend modes.
export const BLEND_MODES = ["add", "multiply", "max", "min", "lerp", "screen", "subtract"];

export function combineHeightmaps(a, b, size, mode = "lerp", blend = 0.5) {
  if (a.length !== b.length) throw new Error("size mismatch");
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    let v;
    switch (mode) {
      case "add": v = va + vb * blend; break;
      case "subtract": v = va - vb * blend; break;
      case "multiply": v = va * (1 - blend + vb * blend); break;
      case "max": v = Math.max(va, vb * blend + va * (1 - blend)); break;
      case "min": v = Math.min(va, vb * blend + va * (1 - blend)); break;
      case "screen": v = 1 - (1 - va) * (1 - vb * blend); break;
      case "lerp":
      default: v = va * (1 - blend) + vb * blend; break;
    }
    out[i] = Math.max(0, Math.min(1, v));
  }
  return out;
}

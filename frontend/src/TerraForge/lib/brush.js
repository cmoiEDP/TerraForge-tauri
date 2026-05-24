// Brush operations in pure JS (mirrors the Rust brush.rs).
// Works on a Float32Array heightmap [0..1].

function smoothstep01(t) { return t * t * (3.0 - 2.0 * t); }
function falloff(d, r) {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return smoothstep01(t);
}

export function applyBrush(h, size, cx, cy, params) {
  const { mode, radius, strength, targetHeight } = params;
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(size - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(size - 1, Math.ceil(cy + r));

  if (mode === "raise" || mode === "lower") {
    const sign = mode === "raise" ? 1 : -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const w = falloff(d, r);
        if (w === 0) continue;
        const i = y * size + x;
        h[i] = Math.max(0, Math.min(1, h[i] + sign * strength * w));
      }
    }
  } else if (mode === "flatten") {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const w = falloff(d, r);
        if (w === 0) continue;
        const i = y * size + x;
        h[i] = Math.max(0, Math.min(1, h[i] + (targetHeight - h[i]) * strength * w));
      }
    }
  } else if (mode === "smooth") {
    const kr = 2;
    const writes = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const w = falloff(d, r);
        if (w === 0) continue;
        let sum = 0, cnt = 0;
        for (let ky = -kr; ky <= kr; ky++) {
          for (let kx = -kr; kx <= kr; kx++) {
            const nx = Math.max(0, Math.min(size - 1, x + kx));
            const ny = Math.max(0, Math.min(size - 1, y + ky));
            sum += h[ny * size + nx];
            cnt++;
          }
        }
        const avg = sum / cnt;
        const i = y * size + x;
        writes.push([i, Math.max(0, Math.min(1, h[i] + (avg - h[i]) * strength * w))]);
      }
    }
    for (const [i, v] of writes) h[i] = v;
  }
}

// Flatten the heightmap along a road spline. Mirrors flatten_along_road in roads.rs.
import { sampleRoadSpline } from "@/TerraForge/lib/roads";

export function flattenAlongRoad(h, size, waypoints, halfWidth, falloffPx, strength) {
  if (waypoints.length < 2) return;
  const samples = sampleRoadSpline(waypoints, 96);

  const centerH = [];
  for (const s of samples) {
    const x = Math.max(0, Math.min(size - 1, Math.floor(s.x * (size - 1))));
    const y = Math.max(0, Math.min(size - 1, Math.floor(s.y * (size - 1))));
    centerH.push(h[y * size + x]);
  }
  const win = 4;
  const smoothed = centerH.map((_, i) => {
    const lo = Math.max(0, i - win);
    const hi = Math.min(centerH.length - 1, i + win);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += centerH[j];
    return sum / (hi - lo + 1);
  });

  const outer = halfWidth + falloffPx;
  const pad = Math.ceil(outer) + 2;

  for (let si = 0; si < samples.length - 1; si++) {
    const a = samples[si];
    const b = samples[si + 1];
    const ax = a.x * (size - 1);
    const ay = a.y * (size - 1);
    const bx = b.x * (size - 1);
    const by = b.y * (size - 1);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + pad));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + pad));
    const dxs = bx - ax;
    const dys = by - ay;
    const segLen2 = Math.max(1e-6, dxs * dxs + dys * dys);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x - ax;
        const py = y - ay;
        let t = (px * dxs + py * dys) / segLen2;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dxs;
        const cy = ay + t * dys;
        const d = Math.hypot(x - cx, y - cy);
        if (d > outer) continue;
        let w = d <= halfWidth ? 1 : 1 - (d - halfWidth) / falloffPx;
        w = Math.max(0, Math.min(1, w)) * strength;
        const target = smoothed[si] + (smoothed[Math.min(samples.length - 1, si + 1)] - smoothed[si]) * t;
        const i = y * size + x;
        h[i] = h[i] + (target - h[i]) * w;
      }
    }
  }
}

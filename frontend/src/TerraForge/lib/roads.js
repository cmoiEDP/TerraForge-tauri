// Road rasterization from user-defined waypoints (normalized 0..1 coords).
// Uses Catmull-Rom spline, rasterizes with width + falloff. Outputs RGBA mask.

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

// waypoints: [{x:0..1, y:0..1}, ...]
export function sampleRoadSpline(waypoints, samplesPerSegment = 32) {
  if (waypoints.length < 2) return [];
  const pts = [];
  const wp = waypoints;
  for (let i = 0; i < wp.length - 1; i++) {
    const p0 = wp[Math.max(0, i - 1)];
    const p1 = wp[i];
    const p2 = wp[i + 1];
    const p3 = wp[Math.min(wp.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      pts.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
      });
    }
  }
  pts.push(wp[wp.length - 1]);
  return pts;
}

// Rasterize the road into RGBA. If `tintImage` (Uint8ClampedArray RGBA of any size) is provided,
// the road colors are sampled from it along the road longitudinal axis (stretches along the spline).
export function rasterizeRoads(waypoints, size, {
  width = 8,              // pixels
  falloff = 4,            // pixels of soft edge
  color = [200, 180, 140, 255],
  tintImage = null,       // { data, w, h }
} = {}) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) data[i * 4 + 3] = 0;
  if (waypoints.length < 2) return data;

  const samples = sampleRoadSpline(waypoints, 64);
  const totalLen = samples.length;
  const outerRadius = width / 2 + falloff;

  // bounding box of road for perf
  const padPx = Math.ceil(outerRadius) + 2;

  for (let si = 0; si < samples.length - 1; si++) {
    const a = samples[si];
    const b = samples[si + 1];
    const ax = a.x * (size - 1);
    const ay = a.y * (size - 1);
    const bx = b.x * (size - 1);
    const by = b.y * (size - 1);
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - padPx));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + padPx));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - padPx));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + padPx));
    const dxs = bx - ax;
    const dys = by - ay;
    const segLen2 = dxs * dxs + dys * dys || 1;
    const segLen = Math.sqrt(segLen2);
    const tBase = si / totalLen;
    const tNext = (si + 1) / totalLen;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x - ax;
        const py = y - ay;
        let tProj = (px * dxs + py * dys) / segLen2;
        tProj = Math.max(0, Math.min(1, tProj));
        const cx = ax + tProj * dxs;
        const cy = ay + tProj * dys;
        const d = Math.hypot(x - cx, y - cy);
        if (d > outerRadius) continue;
        let alpha;
        if (d <= width / 2) alpha = 1;
        else alpha = 1 - (d - width / 2) / falloff;
        alpha = Math.max(0, Math.min(1, alpha));
        // sample tint
        let r = color[0], g = color[1], bch = color[2];
        if (tintImage) {
          const tAlong = tBase + (tNext - tBase) * tProj;
          // perpendicular coord -1..1 across the road width
          const perp = (d / outerRadius);
          const tu = Math.max(0, Math.min(tintImage.w - 1, Math.floor(tAlong * (tintImage.w - 1))));
          const tv = Math.max(0, Math.min(tintImage.h - 1, Math.floor(perp * (tintImage.h - 1))));
          const ti = (tv * tintImage.w + tu) * 4;
          r = tintImage.data[ti];
          g = tintImage.data[ti + 1];
          bch = tintImage.data[ti + 2];
        }
        const i = (y * size + x) * 4;
        const existing = data[i + 3] / 255;
        const newA = Math.max(existing, alpha);
        data[i] = Math.round(r);
        data[i + 1] = Math.round(g);
        data[i + 2] = Math.round(bch);
        data[i + 3] = Math.round(newA * 255);
      }
    }
  }
  return data;
}

// Preset road textures (procedural, small 64x16 strips).
export function presetRoadTextures() {
  const make = (rowFn, name) => {
    const w = 64, h = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const c = rowFn(x / w, y / h);
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    return { name, w, h, data };
  };
  const noise = (s) => Math.abs(Math.sin(s * 12.9898) * 43758.5453 % 1);
  return [
    make((u, v) => {
      const n = noise(u * 100 + v * 7) * 40;
      const base = 60 + n;
      return [base, base, base + 5];
    }, "asphalt"),
    make((u, v) => {
      const n = noise(u * 60 + v * 3) * 50;
      return [120 + n, 85 + n * 0.6, 50 + n * 0.4];
    }, "dirt"),
    make((u, v) => {
      const n = noise(u * 200 + v * 11) * 80;
      return [150 + n, 145 + n, 135 + n];
    }, "gravel"),
    make((u, v) => {
      const stripe = Math.floor(u * 16) % 2 === 0 ? 1 : 0.85;
      return [180 * stripe, 160 * stripe, 130 * stripe];
    }, "cobble"),
  ];
}

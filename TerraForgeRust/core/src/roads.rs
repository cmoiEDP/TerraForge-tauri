//! Road rasterization with Catmull-Rom spline + width + falloff. Port of `lib/roads.js`.

#[derive(Clone, Copy, Debug)]
pub struct Waypoint { pub x: f32, pub y: f32 }

fn catmull_rom(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let t2 = t * t;
    let t3 = t2 * t;
    0.5 * (
        2.0 * p1
        + (-p0 + p2) * t
        + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2
        + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3
    )
}

pub fn sample_spline(wp: &[Waypoint], samples_per_segment: u32) -> Vec<Waypoint> {
    if wp.len() < 2 { return Vec::new(); }
    let mut out: Vec<Waypoint> = Vec::new();
    for i in 0..wp.len() - 1 {
        let p0 = wp[i.saturating_sub(1)];
        let p1 = wp[i];
        let p2 = wp[i + 1];
        let p3 = wp[(i + 2).min(wp.len() - 1)];
        for s in 0..samples_per_segment {
            let t = s as f32 / samples_per_segment as f32;
            out.push(Waypoint {
                x: catmull_rom(p0.x, p1.x, p2.x, p3.x, t),
                y: catmull_rom(p0.y, p1.y, p2.y, p3.y, t),
            });
        }
    }
    out.push(*wp.last().unwrap());
    out
}

#[derive(Clone, Debug)]
pub struct RoadParams {
    pub width: f32,
    pub falloff: f32,
    pub color: [u8; 4],
}

impl Default for RoadParams {
    fn default() -> Self { Self { width: 8.0, falloff: 4.0, color: [200, 180, 140, 255] } }
}

/// Rasterize the road into an RGBA buffer of `size * size` pixels.
pub fn rasterize_roads(wp: &[Waypoint], size: u32, p: &RoadParams) -> Vec<u8> {
    let n = size as usize;
    let mut data = vec![0u8; n * n * 4];
    if wp.len() < 2 { return data; }
    let samples = sample_spline(wp, 64);
    let outer = p.width * 0.5 + p.falloff;
    let pad = (outer.ceil() as i32) + 2;

    for si in 0..samples.len() - 1 {
        let a = samples[si];
        let b = samples[si + 1];
        let ax = a.x * (n as f32 - 1.0);
        let ay = a.y * (n as f32 - 1.0);
        let bx = b.x * (n as f32 - 1.0);
        let by = b.y * (n as f32 - 1.0);
        let min_x = ((ax.min(bx)) as i32 - pad).max(0) as usize;
        let max_x = ((ax.max(bx)) as i32 + pad).min(n as i32 - 1) as usize;
        let min_y = ((ay.min(by)) as i32 - pad).max(0) as usize;
        let max_y = ((ay.max(by)) as i32 + pad).min(n as i32 - 1) as usize;
        let dxs = bx - ax;
        let dys = by - ay;
        let seg_len2 = (dxs * dxs + dys * dys).max(1e-6);

        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px = x as f32 - ax;
                let py = y as f32 - ay;
                let t = ((px * dxs + py * dys) / seg_len2).clamp(0.0, 1.0);
                let cx = ax + t * dxs;
                let cy = ay + t * dys;
                let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                if d > outer { continue; }
                let alpha = if d <= p.width * 0.5 { 1.0 } else { 1.0 - (d - p.width * 0.5) / p.falloff };
                let alpha = alpha.clamp(0.0, 1.0);
                let i = (y * n + x) * 4;
                let existing = data[i + 3] as f32 / 255.0;
                let new_a = existing.max(alpha);
                data[i] = p.color[0];
                data[i + 1] = p.color[1];
                data[i + 2] = p.color[2];
                data[i + 3] = (new_a * 255.0).round() as u8;
            }
        }
    }
    data
}

/// Flatten the heightmap along a road spline.
/// Heights along the road centerline are pulled toward the rolling average of the
/// centerline (so the road follows the terrain but smooths bumps). Strength controls
/// how aggressive the flattening is; `width_blend` is the pixel half-width over
/// which the effect tapers (matches the visual road width).
pub fn flatten_along_road(
    h: &mut [f32],
    size: u32,
    wp: &[Waypoint],
    half_width: f32,
    falloff: f32,
    strength: f32,
) {
    if wp.len() < 2 { return; }
    let samples = sample_spline(wp, 96);
    let n = size as usize;

    // 1. Sample centerline heights and smooth them along the road (running average).
    let mut center_h: Vec<f32> = Vec::with_capacity(samples.len());
    for s in &samples {
        let x = (s.x * (n as f32 - 1.0)).clamp(0.0, n as f32 - 1.0) as usize;
        let y = (s.y * (n as f32 - 1.0)).clamp(0.0, n as f32 - 1.0) as usize;
        center_h.push(h[y * n + x]);
    }
    // box-filter the centerline (window 9) for smooth slope.
    let win = 4i32;
    let smoothed: Vec<f32> = (0..center_h.len()).map(|i| {
        let lo = (i as i32 - win).max(0) as usize;
        let hi = (i as i32 + win).min(center_h.len() as i32 - 1) as usize;
        let mut sum = 0.0f32;
        for j in lo..=hi { sum += center_h[j]; }
        sum / (hi - lo + 1) as f32
    }).collect();

    // 2. For each sample segment, write target height into pixels within (half_width + falloff).
    let outer = half_width + falloff;
    let pad = (outer.ceil() as i32) + 2;
    for si in 0..samples.len() - 1 {
        let a = samples[si];
        let b = samples[si + 1];
        let ax = a.x * (n as f32 - 1.0);
        let ay = a.y * (n as f32 - 1.0);
        let bx = b.x * (n as f32 - 1.0);
        let by = b.y * (n as f32 - 1.0);
        let min_x = ((ax.min(bx)) as i32 - pad).max(0) as usize;
        let max_x = ((ax.max(bx)) as i32 + pad).min(n as i32 - 1) as usize;
        let min_y = ((ay.min(by)) as i32 - pad).max(0) as usize;
        let max_y = ((ay.max(by)) as i32 + pad).min(n as i32 - 1) as usize;
        let dxs = bx - ax;
        let dys = by - ay;
        let seg_len2 = (dxs * dxs + dys * dys).max(1e-6);

        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px = x as f32 - ax;
                let py = y as f32 - ay;
                let t = ((px * dxs + py * dys) / seg_len2).clamp(0.0, 1.0);
                let cx = ax + t * dxs;
                let cy = ay + t * dys;
                let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                if d > outer { continue; }
                let w = if d <= half_width { 1.0 } else { 1.0 - (d - half_width) / falloff };
                let w = w.clamp(0.0, 1.0) * strength;
                let target = smoothed[si] + (smoothed[(si + 1).min(smoothed.len() - 1)] - smoothed[si]) * t;
                let i = y * n + x;
                h[i] = h[i] + (target - h[i]) * w;
            }
        }
    }
}

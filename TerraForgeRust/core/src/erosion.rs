//! Hydraulic erosion — particle-based, single-threaded.
//! Direct port of `lib/terrainGen.js::erode`.

use crate::{normalize, Mulberry32};

#[derive(Clone, Debug)]
pub struct ErosionParams {
    pub iterations: u32,
    pub inertia: f32,
    pub capacity: f32,
    pub min_slope: f32,
    pub deposition: f32,
    pub erosion: f32,
    pub evaporation: f32,
    pub gravity: f32,
    pub max_lifetime: u32,
    pub initial_water: f32,
    pub initial_speed: f32,
    pub seed: u32,
}

impl Default for ErosionParams {
    fn default() -> Self {
        Self {
            iterations: 50_000,
            inertia: 0.05,
            capacity: 4.0,
            min_slope: 0.01,
            deposition: 0.3,
            erosion: 0.3,
            evaporation: 0.01,
            gravity: 4.0,
            max_lifetime: 30,
            initial_water: 1.0,
            initial_speed: 1.0,
            seed: 42,
        }
    }
}

struct Gradient { gx: f32, gy: f32, height: f32 }

fn gradient(h: &[f32], n: usize, px: f32, py: f32) -> Gradient {
    let x = (px.floor() as isize).clamp(0, n as isize - 2) as usize;
    let y = (py.floor() as isize).clamp(0, n as isize - 2) as usize;
    let fx = px - x as f32;
    let fy = py - y as f32;
    let h00 = h[y * n + x];
    let h10 = h[y * n + x + 1];
    let h01 = h[(y + 1) * n + x];
    let h11 = h[(y + 1) * n + x + 1];
    let gx = (h10 - h00) * (1.0 - fy) + (h11 - h01) * fy;
    let gy = (h01 - h00) * (1.0 - fx) + (h11 - h10) * fx;
    let height = h00 * (1.0 - fx) * (1.0 - fy)
               + h10 * fx * (1.0 - fy)
               + h01 * (1.0 - fx) * fy
               + h11 * fx * fy;
    Gradient { gx, gy, height }
}

fn deposit(h: &mut [f32], n: usize, px: f32, py: f32, amount: f32) {
    let x = (px.floor() as isize).clamp(0, n as isize - 2) as usize;
    let y = (py.floor() as isize).clamp(0, n as isize - 2) as usize;
    let fx = px - x as f32;
    let fy = py - y as f32;
    h[y * n + x] += amount * (1.0 - fx) * (1.0 - fy);
    h[y * n + x + 1] += amount * fx * (1.0 - fy);
    h[(y + 1) * n + x] += amount * (1.0 - fx) * fy;
    h[(y + 1) * n + x + 1] += amount * fx * fy;
}

fn erode_at(h: &mut [f32], n: usize, px: f32, py: f32, amount: f32) {
    let radius = 3.0f32;
    let x0 = ((px - radius) as isize).max(0) as usize;
    let x1 = ((px + radius) as isize).min(n as isize - 1) as usize;
    let y0 = ((py - radius) as isize).max(0) as usize;
    let y1 = ((py + radius) as isize).min(n as isize - 1) as usize;
    let mut total = 0.0f32;
    let mut entries: Vec<(usize, f32)> = Vec::new();
    for yy in y0..=y1 {
        for xx in x0..=x1 {
            let d = ((xx as f32 - px).powi(2) + (yy as f32 - py).powi(2)).sqrt();
            let w = (radius - d).max(0.0);
            if w > 0.0 {
                total += w;
                entries.push((yy * n + xx, w));
            }
        }
    }
    if total == 0.0 { return; }
    for (idx, w) in entries {
        let dh = amount * (w / total);
        h[idx] = (h[idx] - dh).max(0.0);
    }
}

/// Apply hydraulic erosion in place.
pub fn erode(h: &mut [f32], size: u32, p: &ErosionParams) {
    let n = size as usize;
    let mut rng = Mulberry32::new(p.seed);
    for _ in 0..p.iterations {
        let mut px = rng.next_f32() * (n as f32 - 1.0);
        let mut py = rng.next_f32() * (n as f32 - 1.0);
        let mut dx = 0.0f32;
        let mut dy = 0.0f32;
        let mut speed = p.initial_speed;
        let mut water = p.initial_water;
        let mut sediment = 0.0f32;
        for _ in 0..p.max_lifetime {
            let g = gradient(h, n, px, py);
            dx = dx * p.inertia - g.gx * (1.0 - p.inertia);
            dy = dy * p.inertia - g.gy * (1.0 - p.inertia);
            let len = (dx * dx + dy * dy).sqrt();
            if len != 0.0 { dx /= len; dy /= len; }
            let nx = px + dx;
            let ny = py + dy;
            if nx < 0.0 || nx >= n as f32 - 1.0 || ny < 0.0 || ny >= n as f32 - 1.0 { break; }
            let new_h = gradient(h, n, nx, ny).height;
            let dh = new_h - g.height;
            let cap = (-dh).max(p.min_slope) * speed * water * p.capacity;
            if sediment > cap || dh > 0.0 {
                let dep = if dh > 0.0 { dh.min(sediment) } else { (sediment - cap) * p.deposition };
                sediment -= dep;
                deposit(h, n, px, py, dep);
            } else {
                let er = ((cap - sediment) * p.erosion).min(-dh);
                sediment += er;
                erode_at(h, n, px, py, er);
            }
            speed = (speed * speed + (-dh) * p.gravity).max(0.0).sqrt();
            water *= 1.0 - p.evaporation;
            px = nx;
            py = ny;
        }
    }
    normalize(h);
}

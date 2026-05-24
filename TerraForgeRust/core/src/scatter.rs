//! Scatter dot maps for vegetation / props. Port of `lib/scatter.js`.

use crate::Mulberry32;

#[derive(Clone, Debug)]
pub struct ScatterLayer {
    pub id: String,
    pub density: f32,
    pub min_spacing: u32,
    pub min_height: f32,
    pub max_height: f32,
    pub max_slope: f32,
    pub avoid_water: f32,
    pub jitter: f32,
    pub seed: u32,
}

impl ScatterLayer {
    pub fn trees() -> Self {
        Self {
            id: "trees".into(), density: 0.65, min_spacing: 6,
            min_height: 0.14, max_height: 0.62, max_slope: 0.45,
            avoid_water: 0.03, jitter: 0.6, seed: 11,
        }
    }
    pub fn bushes() -> Self {
        Self {
            id: "bushes".into(), density: 0.85, min_spacing: 3,
            min_height: 0.13, max_height: 0.75, max_slope: 0.65,
            avoid_water: 0.015, jitter: 0.9, seed: 23,
        }
    }
    pub fn rocks() -> Self {
        Self {
            id: "rocks".into(), density: 0.40, min_spacing: 8,
            min_height: 0.20, max_height: 0.95, max_slope: 1.0,
            avoid_water: 0.02, jitter: 1.0, seed: 37,
        }
    }
}

pub fn scatter_points(h: &[f32], slope: &[f32], size: u32, layer: &ScatterLayer) -> Vec<(u32, u32)> {
    let n = size as usize;
    let mut rng = Mulberry32::new(layer.seed);
    let cell = layer.min_spacing.max(1) as usize;
    let cols = (n + cell - 1) / cell;
    let rows = (n + cell - 1) / cell;
    let total = ((cols * rows) as f32 * layer.density) as usize;
    let max_attempts = total * 8;
    let mut occupied = vec![false; cols * rows];
    let mut points: Vec<(u32, u32)> = Vec::with_capacity(total);
    let mut attempts = 0;

    while points.len() < total && attempts < max_attempts {
        attempts += 1;
        let cx = (rng.next_f32() * cols as f32) as usize;
        let cy = (rng.next_f32() * rows as f32) as usize;
        if cx >= cols || cy >= rows { continue; }
        if occupied[cy * cols + cx] { continue; }
        let jx = (rng.next_f32() - 0.5) * layer.jitter * cell as f32;
        let jy = (rng.next_f32() - 0.5) * layer.jitter * cell as f32;
        let px = ((cx as f32 * cell as f32 + cell as f32 * 0.5 + jx).round() as isize).clamp(0, n as isize - 1) as usize;
        let py = ((cy as f32 * cell as f32 + cell as f32 * 0.5 + jy).round() as isize).clamp(0, n as isize - 1) as usize;
        let hv = h[py * n + px];
        let sv = slope[py * n + px];
        if hv < layer.min_height + layer.avoid_water { continue; }
        if hv > layer.max_height { continue; }
        if sv > layer.max_slope { continue; }
        occupied[cy * cols + cx] = true;
        points.push((px as u32, py as u32));
    }
    points
}

/// Rasterize a 1-px-per-dot grayscale RGBA mask suitable for Unity scatter input.
pub fn rasterize_dot_map_grayscale(points: &[(u32, u32)], size: u32) -> Vec<u8> {
    let n = (size * size) as usize;
    let mut data = vec![0u8; n * 4];
    for i in 0..n { data[i * 4 + 3] = 255; }
    for &(px, py) in points {
        let i = (py as usize * size as usize + px as usize) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
    }
    data
}

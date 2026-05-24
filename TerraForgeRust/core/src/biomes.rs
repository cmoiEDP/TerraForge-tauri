//! Biome classification → RGBA splatmap. Port of `lib/biomes.js`.

use crate::smoothstep;

#[derive(Clone, Debug)]
pub struct BiomeParams {
    pub water_level: f32,
    pub sand_width: f32,
    pub grass_max: f32,
    pub rock_max: f32,
    pub slope_bias: f32,
    pub blend_softness: f32,
}

impl Default for BiomeParams {
    fn default() -> Self {
        Self {
            water_level: 0.12,
            sand_width: 0.05,
            grass_max: 0.55,
            rock_max: 0.82,
            slope_bias: 0.45,
            blend_softness: 0.04,
        }
    }
}

pub fn compute_slope_map(h: &[f32], size: u32) -> Vec<f32> {
    let n = size as usize;
    let mut slope = vec![0f32; n * n];
    for y in 0..n {
        for x in 0..n {
            let xl = x.saturating_sub(1);
            let xr = (x + 1).min(n - 1);
            let yu = y.saturating_sub(1);
            let yd = (y + 1).min(n - 1);
            let dx = h[y * n + xr] - h[y * n + xl];
            let dy = h[yd * n + x] - h[yu * n + x];
            slope[y * n + x] = ((dx * dx + dy * dy).sqrt() * n as f32 * 0.05).min(1.0);
        }
    }
    slope
}

pub struct BiomeResult {
    pub splatmap: Vec<u8>,    // RGBA
    pub water_mask: Vec<u8>,  // 0 / 255
    pub slope_map: Vec<f32>,
}

/// Compute the RGBA splatmap (R=sand, G=grass, B=rock, A=snow) + water mask + slope.
pub fn compute_biome_splatmap(h: &[f32], size: u32, p: &BiomeParams) -> BiomeResult {
    let n = (size * size) as usize;
    let slope = compute_slope_map(h, size);
    let mut splat = vec![0u8; n * 4];
    let mut water = vec![0u8; n];

    for i in 0..n {
        let height = h[i];
        let s = slope[i];
        if height < p.water_level {
            water[i] = 255;
            continue; // splat already zeros
        }
        let hn = (height - p.water_level) / (1.0 - p.water_level + 1e-6);
        let w_sand = (1.0 - smoothstep(p.sand_width - p.blend_softness, p.sand_width + p.blend_softness, hn))
            * (1.0 - s * p.slope_bias);
        let w_grass = smoothstep(p.sand_width - p.blend_softness, p.sand_width + p.blend_softness, hn)
            * (1.0 - smoothstep(p.grass_max - p.blend_softness, p.grass_max + p.blend_softness, hn))
            * (1.0 - s * p.slope_bias);
        let w_rock = smoothstep(p.grass_max - p.blend_softness, p.grass_max + p.blend_softness, hn)
            * (1.0 - smoothstep(p.rock_max - p.blend_softness, p.rock_max + p.blend_softness, hn))
            + s * p.slope_bias * 0.7;
        let w_snow = smoothstep(p.rock_max - p.blend_softness, p.rock_max + p.blend_softness, hn);
        let total = w_sand + w_grass + w_rock + w_snow + 1e-6;
        splat[i * 4] = ((w_sand / total) * 255.0).round() as u8;
        splat[i * 4 + 1] = ((w_grass / total) * 255.0).round() as u8;
        splat[i * 4 + 2] = ((w_rock / total) * 255.0).round() as u8;
        splat[i * 4 + 3] = ((w_snow / total) * 255.0).round() as u8;
    }
    BiomeResult { splatmap: splat, water_mask: water, slope_map: slope }
}

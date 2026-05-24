//! Bicubic upscale + fractal detail re-synthesis. Port of `lib/terrainGen.js::upscaleWithDetail`.

use crate::Heightmap;
use rayon::prelude::*;

#[derive(Clone, Debug)]
pub struct UpscaleParams {
    pub detail_strength: f32,
    pub detail_octaves: u32,
    pub detail_scale: f32,
    pub seed: u32,
    pub preserve_ridges: bool,
}

impl Default for UpscaleParams {
    fn default() -> Self {
        Self {
            detail_strength: 0.15, detail_octaves: 4, detail_scale: 0.01,
            seed: 7, preserve_ridges: true,
        }
    }
}

// Simple value noise reused for detail (NOT the same perm table as noise.rs to keep this file standalone).
fn hash2(x: i32, y: i32, seed: u32) -> f32 {
    let mut h = (x as u32).wrapping_mul(374761393)
        .wrapping_add((y as u32).wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(2654435761));
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    ((h ^ (h >> 16)) as f32) / 4_294_967_296.0 * 2.0 - 1.0
}

fn smooth(t: f32) -> f32 { t * t * (3.0 - 2.0 * t) }

fn vnoise(x: f32, y: f32, seed: u32) -> f32 {
    let xi = x.floor() as i32;
    let yi = y.floor() as i32;
    let xf = x - xi as f32;
    let yf = y - yi as f32;
    let a = hash2(xi, yi, seed);
    let b = hash2(xi + 1, yi, seed);
    let c = hash2(xi, yi + 1, seed);
    let d = hash2(xi + 1, yi + 1, seed);
    let u = smooth(xf);
    let v = smooth(yf);
    let ab = a + (b - a) * u;
    let cd = c + (d - c) * u;
    ab + (cd - ab) * v
}

fn cubic(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
    let a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    let b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
    let c = -0.5 * p0 + 0.5 * p2;
    let d = p1;
    a * t * t * t + b * t * t + c * t + d
}

fn sample(src: &[f32], src_size: u32, x: i32, y: i32) -> f32 {
    let n = src_size as i32;
    let xc = x.clamp(0, n - 1) as usize;
    let yc = y.clamp(0, n - 1) as usize;
    src[yc * src_size as usize + xc]
}

pub fn upscale_with_detail(src: &[f32], src_size: u32, dst_size: u32, p: &UpscaleParams) -> Heightmap {
    let dst = dst_size as usize;
    let mut out = vec![0f32; dst * dst];
    let ratio = (src_size as f32 - 1.0) / (dst_size as f32 - 1.0);
    let seed = p.seed;
    let octaves = p.detail_octaves;

    out.par_chunks_mut(dst).enumerate().for_each(|(y, row)| {
        for x in 0..dst {
            let sx = x as f32 * ratio;
            let sy = y as f32 * ratio;
            let ix = sx.floor() as i32;
            let iy = sy.floor() as i32;
            let fx = sx - ix as f32;
            let fy = sy - iy as f32;

            let mut cols = [0f32; 4];
            for m in -1..=2 {
                let r = [
                    sample(src, src_size, ix - 1, iy + m),
                    sample(src, src_size, ix, iy + m),
                    sample(src, src_size, ix + 1, iy + m),
                    sample(src, src_size, ix + 2, iy + m),
                ];
                cols[(m + 1) as usize] = cubic(r[0], r[1], r[2], r[3], fx);
            }
            let mut h = cubic(cols[0], cols[1], cols[2], cols[3], fy);

            // gradient magnitude for edge-aware weighting
            let gx = (sample(src, src_size, ix + 1, iy) - sample(src, src_size, ix - 1, iy)) * 0.5;
            let gy = (sample(src, src_size, ix, iy + 1) - sample(src, src_size, ix, iy - 1)) * 0.5;
            let grad = ((gx * gx + gy * gy).sqrt() * 12.0).min(1.0);

            let mut detail = 0.0f32;
            let mut amp = 1.0f32;
            let mut freq = 1.0f32;
            let mut norm = 0.0f32;
            for _ in 0..octaves {
                detail += vnoise(x as f32 * p.detail_scale * freq, y as f32 * p.detail_scale * freq, seed) * amp;
                norm += amp;
                amp *= 0.5;
                freq *= 2.0;
            }
            detail /= norm;
            let weight = if p.preserve_ridges { 0.3 + 0.7 * grad } else { 1.0 };
            h += detail * p.detail_strength * weight;
            row[x] = h.clamp(0.0, 1.0);
        }
    });

    out
}

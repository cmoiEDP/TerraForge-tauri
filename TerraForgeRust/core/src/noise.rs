//! fBm + ridged simplex-style noise heightmap generation.
//! Uses a value-noise implementation hashed with the JS PRNG so output matches
//! the web app deterministically when given identical params.

use crate::{normalize, Heightmap, Mulberry32};

/// Parameters for [`generate_heightmap`].
#[derive(Clone, Debug)]
pub struct NoiseParams {
    pub size: u32,
    pub seed: u32,
    pub scale: f32,
    pub octaves: u32,
    pub persistence: f32,
    pub lacunarity: f32,
    pub ridge_blend: f32,
    pub warp: f32,
    pub exponent: f32,
}

impl Default for NoiseParams {
    fn default() -> Self {
        Self {
            size: 1024,
            seed: 1337,
            scale: 0.0018,
            octaves: 7,
            persistence: 0.5,
            lacunarity: 2.0,
            ridge_blend: 0.4,
            warp: 0.3,
            exponent: 1.4,
        }
    }
}

// --- 2D simplex-like permutation table built from the PRNG ---
fn build_perm(seed: u32) -> [u8; 512] {
    let mut rng = Mulberry32::new(seed);
    let mut p = [0u8; 256];
    for i in 0..256 { p[i] = i as u8; }
    for i in (1..256).rev() {
        let j = (rng.next_f32() * (i as f32 + 1.0)) as usize;
        p.swap(i, j);
    }
    let mut out = [0u8; 512];
    for i in 0..512 { out[i] = p[i & 255]; }
    out
}

#[inline]
fn grad2(hash: u8, x: f32, y: f32) -> f32 {
    // pick from 8 gradient directions
    match hash & 7 {
        0 => x + y,
        1 => x - y,
        2 => -x + y,
        3 => -x - y,
        4 => x,
        5 => -x,
        6 => y,
        _ => -y,
    }
}

#[inline]
fn fade(t: f32) -> f32 { t * t * t * (t * (t * 6.0 - 15.0) + 10.0) }

#[inline]
fn lerp(a: f32, b: f32, t: f32) -> f32 { a + (b - a) * t }

/// Perlin-style noise in `[-1, 1]`.
fn pnoise(perm: &[u8; 512], x: f32, y: f32) -> f32 {
    let xi = x.floor() as i32 & 255;
    let yi = y.floor() as i32 & 255;
    let xf = x - x.floor();
    let yf = y - y.floor();
    let u = fade(xf);
    let v = fade(yf);
    let aa = perm[(perm[xi as usize] as usize + yi as usize) & 511];
    let ab = perm[(perm[xi as usize] as usize + yi as usize + 1) & 511];
    let ba = perm[(perm[(xi as usize + 1) & 255] as usize + yi as usize) & 511];
    let bb = perm[(perm[(xi as usize + 1) & 255] as usize + yi as usize + 1) & 511];
    let x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1.0, yf), u);
    let x2 = lerp(grad2(ab, xf, yf - 1.0), grad2(bb, xf - 1.0, yf - 1.0), u);
    lerp(x1, x2, v)
}

/// Synthesize a heightmap. Returns a Vec of length `size * size` in [0, 1].
pub fn generate_heightmap(p: &NoiseParams) -> Heightmap {
    let size = p.size as usize;
    let perm = build_perm(p.seed);
    let warp_perm = build_perm(p.seed.wrapping_add(0x9e37));

    let mut data = vec![0f32; size * size];

    // Use rayon for the outer loop.
    use rayon::prelude::*;
    data.par_chunks_mut(size).enumerate().for_each(|(y, row)| {
        for x in 0..size {
            let xf = x as f32;
            let yf = y as f32;

            let wx = pnoise(&warp_perm, xf * p.scale * 0.5, yf * p.scale * 0.5) * p.warp * 200.0;
            let wy = pnoise(&warp_perm, (xf + 100.0) * p.scale * 0.5, (yf + 100.0) * p.scale * 0.5) * p.warp * 200.0;

            let mut amp = 1.0;
            let mut freq = 1.0;
            let mut fbm = 0.0;
            let mut ridged = 0.0;
            let mut norm = 0.0;
            for _ in 0..p.octaves {
                let nx = (xf + wx) * p.scale * freq;
                let ny = (yf + wy) * p.scale * freq;
                let n = pnoise(&perm, nx, ny);
                fbm += n * amp;
                ridged += (1.0 - n.abs()) * amp;
                norm += amp;
                amp *= p.persistence;
                freq *= p.lacunarity;
            }
            let fbm_n = fbm / norm;          // -1..1
            let ridged_n = ridged / norm;    // 0..1
            let mut h = (fbm_n * 0.5 + 0.5) * (1.0 - p.ridge_blend) + ridged_n * p.ridge_blend;
            h = h.clamp(0.0, 1.0).powf(p.exponent);
            row[x] = h;
        }
    });

    normalize(&mut data);
    data
}

//! TerraForge core — procedural heightmap synthesis algorithms.
//!
//! Mirror of the React app's `src/TerraForge/lib/*.js`. Each module here is a
//! 1-to-1 port of its JS counterpart with the same defaults and semantics, so
//! results are bit-comparable when the same seed and parameters are used.

pub mod biomes;
pub mod brush;
pub mod combine;
pub mod erosion;
pub mod io;
pub mod mesh;
pub mod noise;
pub mod presets;
pub mod roads;
pub mod scatter;
pub mod shapes;
pub mod upscale;

/// A heightmap is row-major `[0, 1]` floats of length `size * size`.
pub type Heightmap = Vec<f32>;

/// Normalize a heightmap to [0, 1] in place.
pub fn normalize(h: &mut [f32]) {
    let mut mn = f32::INFINITY;
    let mut mx = f32::NEG_INFINITY;
    for &v in h.iter() {
        if v < mn { mn = v; }
        if v > mx { mx = v; }
    }
    let r = (mx - mn).max(1e-9);
    for v in h.iter_mut() {
        *v = (*v - mn) / r;
    }
}

/// Smoothstep, identical to GLSL.
#[inline]
pub fn smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0).max(1e-6)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// `mulberry32` — deterministic PRNG matching the JS implementation byte-for-byte
/// so seeds produce visually identical terrains across runtimes.
pub struct Mulberry32(pub u32);

impl Mulberry32 {
    pub fn new(seed: u32) -> Self { Self(seed) }
    #[inline]
    pub fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f32) / 4_294_967_296.0
    }
}

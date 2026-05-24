//! Preset shape post-processing. Port of `lib/shapes.js`.

use crate::{normalize, smoothstep};

fn radial_mask(size: u32, power: f32, inner_radius: f32) -> Vec<f32> {
    let n = size as usize;
    let mut mask = vec![0f32; n * n];
    let cx = (n as f32 - 1.0) * 0.5;
    let cy = (n as f32 - 1.0) * 0.5;
    let max_r = (cx * cx + cy * cy).sqrt();
    for y in 0..n {
        for x in 0..n {
            let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt() / max_r;
            let v = (1.0 - smoothstep(inner_radius, 1.0, d)).powf(power);
            mask[y * n + x] = v;
        }
    }
    mask
}

pub fn shape_identity(_h: &mut [f32]) {}

pub fn shape_alpine(h: &mut [f32]) {
    for v in h.iter_mut() { *v = (*v).powf(0.85); }
    normalize(h);
}

pub fn shape_rolling(h: &mut [f32]) {
    for v in h.iter_mut() { *v = (*v).powf(1.1) * 0.7 + 0.15; }
    normalize(h);
}

pub fn shape_mesa(h: &mut [f32]) {
    for v in h.iter_mut() {
        let levels = 4.0f32;
        let lv = *v * levels;
        let base = lv.floor();
        let frac = lv - base;
        let edge = smoothstep(0.85, 1.0, frac) * 0.15;
        *v = (base + edge) / levels + frac * 0.05;
    }
    normalize(h);
}

pub fn shape_volcanic(h: &mut [f32], size: u32) {
    let n = size as usize;
    let mask = radial_mask(size, 1.8, 0.1);
    let cx = (n as f32 - 1.0) * 0.5;
    let cy = (n as f32 - 1.0) * 0.5;
    let max_r = (cx * cx + cy * cy).sqrt();
    for y in 0..n {
        for x in 0..n {
            let i = y * n + x;
            let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt() / max_r;
            let mut v = h[i] * 0.4 + mask[i] * 0.7;
            let crater_t = smoothstep(0.0, 0.08, d);
            v -= 0.25 * (1.0 - crater_t);
            h[i] = v.max(0.0);
        }
    }
    normalize(h);
}

pub fn shape_archipelago(h: &mut [f32], size: u32) {
    let n = size as usize;
    let cx = (n as f32 - 1.0) * 0.5;
    let cy = (n as f32 - 1.0) * 0.5;
    let max_r = (cx * cx + cy * cy).sqrt();
    for y in 0..n {
        for x in 0..n {
            let i = y * n + x;
            let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt() / max_r;
            let edge_falloff = 1.0 - smoothstep(0.55, 1.0, d);
            let mut v = h[i].powf(1.4);
            v = v * edge_falloff * 0.85 + 0.05;
            h[i] = v;
        }
    }
    normalize(h);
}

pub fn shape_canyon(h: &mut [f32], size: u32) {
    let n = size as usize;
    for y in 0..n {
        for x in 0..n {
            let i = y * n + x;
            let ch1 = n as f32 * 0.4 + ((x as f32) * 0.025).sin() * n as f32 * 0.12 + ((x as f32) * 0.07).sin() * n as f32 * 0.04;
            let ch2 = n as f32 * 0.7 + ((x as f32) * 0.018 + 1.3).sin() * n as f32 * 0.10;
            let d1 = (y as f32 - ch1).abs();
            let d2 = (y as f32 - ch2).abs();
            let d = d1.min(d2);
            let carve_r = n as f32 * 0.03;
            let carve = 1.0 - smoothstep(carve_r * 0.4, carve_r * 2.2, d);
            let mut v = h[i].powf(0.9) * 0.7 + 0.25;
            v -= carve * 0.55;
            h[i] = v.max(0.0);
        }
    }
    normalize(h);
}

pub fn shape_plateau(h: &mut [f32]) {
    for v in h.iter_mut() {
        let mut x = *v;
        x = smoothstep(0.15, 0.55, x) * 0.7 + x * 0.3;
        if x > 0.7 { x = 0.7 + (x - 0.7) * 0.3; }
        *v = x;
    }
    normalize(h);
}

/// Apply the shape associated with a preset id. Unknown ids are no-ops.
pub fn apply_preset_shape(preset_id: &str, h: &mut [f32], size: u32) {
    match preset_id {
        "alpine" => shape_alpine(h),
        "rolling" => shape_rolling(h),
        "desert" => shape_mesa(h),
        "volcanic" => shape_volcanic(h, size),
        "archipelago" => shape_archipelago(h, size),
        "canyon" => shape_canyon(h, size),
        "plateau" => shape_plateau(h),
        _ => shape_identity(h),
    }
}

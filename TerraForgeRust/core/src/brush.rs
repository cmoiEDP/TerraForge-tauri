//! Brush operations on heightmaps. Click + drag → modify a circular region.

#[derive(Clone, Copy, Debug)]
pub enum BrushMode {
    Raise,
    Lower,
    Flatten,   // converges toward target height
    Smooth,    // box-blur within the radius
}

impl BrushMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "raise" => Some(Self::Raise),
            "lower" => Some(Self::Lower),
            "flatten" => Some(Self::Flatten),
            "smooth" => Some(Self::Smooth),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct BrushParams {
    pub mode: BrushMode,
    /// Radius in pixels.
    pub radius: f32,
    /// Strength 0..1.
    pub strength: f32,
    /// For Flatten only — target height [0, 1].
    pub target_height: f32,
}

impl Default for BrushParams {
    fn default() -> Self {
        Self { mode: BrushMode::Raise, radius: 24.0, strength: 0.05, target_height: 0.5 }
    }
}

#[inline]
fn falloff(d: f32, radius: f32) -> f32 {
    if d >= radius { return 0.0; }
    let t = 1.0 - d / radius;
    t * t * (3.0 - 2.0 * t) // smoothstep
}

/// Apply the brush centered at (cx, cy) in pixel coords.
pub fn apply_brush(h: &mut [f32], size: u32, cx: f32, cy: f32, p: &BrushParams) {
    let n = size as usize;
    let r = p.radius.max(1.0);
    let x0 = ((cx - r).floor() as isize).max(0) as usize;
    let x1 = ((cx + r).ceil() as isize).min(n as isize - 1) as usize;
    let y0 = ((cy - r).floor() as isize).max(0) as usize;
    let y1 = ((cy + r).ceil() as isize).min(n as isize - 1) as usize;

    match p.mode {
        BrushMode::Raise | BrushMode::Lower => {
            let sign = if matches!(p.mode, BrushMode::Raise) { 1.0 } else { -1.0 };
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                    let w = falloff(d, r);
                    if w == 0.0 { continue; }
                    let i = y * n + x;
                    h[i] = (h[i] + sign * p.strength * w).clamp(0.0, 1.0);
                }
            }
        }
        BrushMode::Flatten => {
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                    let w = falloff(d, r);
                    if w == 0.0 { continue; }
                    let i = y * n + x;
                    h[i] = h[i] + (p.target_height - h[i]) * p.strength * w;
                    h[i] = h[i].clamp(0.0, 1.0);
                }
            }
        }
        BrushMode::Smooth => {
            // simple weighted blur with a small kernel inside the brush
            let mut writes: Vec<(usize, f32)> = Vec::new();
            for y in y0..=y1 {
                for x in x0..=x1 {
                    let d = ((x as f32 - cx).powi(2) + (y as f32 - cy).powi(2)).sqrt();
                    let w = falloff(d, r);
                    if w == 0.0 { continue; }
                    let mut sum = 0.0f32;
                    let mut cnt = 0.0f32;
                    let kr = 2i32;
                    for ky in -kr..=kr {
                        for kx in -kr..=kr {
                            let nx = (x as i32 + kx).clamp(0, n as i32 - 1) as usize;
                            let ny = (y as i32 + ky).clamp(0, n as i32 - 1) as usize;
                            sum += h[ny * n + nx];
                            cnt += 1.0;
                        }
                    }
                    let avg = sum / cnt;
                    let i = y * n + x;
                    let new = h[i] + (avg - h[i]) * p.strength * w;
                    writes.push((i, new.clamp(0.0, 1.0)));
                }
            }
            for (i, v) in writes { h[i] = v; }
        }
    }
}

/// Apply a brush stroke (line of touches) — caller interpolates between samples.
pub fn apply_stroke(h: &mut [f32], size: u32, pts: &[(f32, f32)], p: &BrushParams) {
    for &(x, y) in pts { apply_brush(h, size, x, y, p); }
}

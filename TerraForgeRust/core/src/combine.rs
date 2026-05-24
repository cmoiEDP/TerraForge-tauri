//! Heightmap blend modes. Port of `lib/combine.js`.

#[derive(Clone, Copy, Debug)]
pub enum BlendMode { Add, Subtract, Multiply, Max, Min, Screen, Lerp }

impl BlendMode {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "add" => Some(Self::Add),
            "subtract" => Some(Self::Subtract),
            "multiply" => Some(Self::Multiply),
            "max" => Some(Self::Max),
            "min" => Some(Self::Min),
            "screen" => Some(Self::Screen),
            "lerp" => Some(Self::Lerp),
            _ => None,
        }
    }
}

pub fn combine_heightmaps(a: &[f32], b: &[f32], mode: BlendMode, blend: f32) -> Vec<f32> {
    assert_eq!(a.len(), b.len());
    let mut out = vec![0f32; a.len()];
    for i in 0..a.len() {
        let va = a[i];
        let vb = b[i];
        let v = match mode {
            BlendMode::Add => va + vb * blend,
            BlendMode::Subtract => va - vb * blend,
            BlendMode::Multiply => va * (1.0 - blend + vb * blend),
            BlendMode::Max => va.max(vb * blend + va * (1.0 - blend)),
            BlendMode::Min => va.min(vb * blend + va * (1.0 - blend)),
            BlendMode::Screen => 1.0 - (1.0 - va) * (1.0 - vb * blend),
            BlendMode::Lerp => va * (1.0 - blend) + vb * blend,
        };
        out[i] = v.clamp(0.0, 1.0);
    }
    out
}

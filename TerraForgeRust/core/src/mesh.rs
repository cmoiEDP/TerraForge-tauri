//! Mesh export. Heightmap → Wavefront OBJ.

use std::io::{BufWriter, Write};
use std::path::Path;

/// Write a triangulated mesh from a heightmap to a `.obj` file.
/// World-space coordinates: X / Z in [-1, 1] across the terrain, Y is height * height_scale.
pub fn write_obj<P: AsRef<Path>>(
    path: P,
    h: &[f32],
    size: u32,
    height_scale: f32,
    decimate: u32, // 1 = full res, 2 = half, 4 = quarter…
) -> std::io::Result<()> {
    let n = size as usize;
    let step = decimate.max(1) as usize;
    let cells_x = (n - 1) / step;
    let cells_y = (n - 1) / step;
    let vx = cells_x + 1;
    let vy = cells_y + 1;

    let f = std::fs::File::create(path)?;
    let mut w = BufWriter::new(f);
    writeln!(w, "# TerraForge mesh export — {vx}x{vy} verts")?;

    // Vertices
    for j in 0..vy {
        for i in 0..vx {
            let sx = i * step;
            let sy = j * step;
            let h_val = h[sy * n + sx];
            // X, Z normalized [-1, 1]
            let x = (i as f32 / cells_x as f32) * 2.0 - 1.0;
            let z = (j as f32 / cells_y as f32) * 2.0 - 1.0;
            let y = h_val * height_scale;
            writeln!(w, "v {x:.5} {y:.5} {z:.5}")?;
        }
    }

    // UVs
    for j in 0..vy {
        for i in 0..vx {
            let u = i as f32 / cells_x as f32;
            let v = j as f32 / cells_y as f32;
            writeln!(w, "vt {u:.5} {v:.5}")?;
        }
    }

    // Faces (1-indexed, two triangles per quad)
    for j in 0..cells_y {
        for i in 0..cells_x {
            let a = j * vx + i + 1;
            let b = j * vx + i + 2;
            let c = (j + 1) * vx + i + 2;
            let d = (j + 1) * vx + i + 1;
            writeln!(w, "f {a}/{a} {b}/{b} {c}/{c}")?;
            writeln!(w, "f {a}/{a} {c}/{c} {d}/{d}")?;
        }
    }

    w.flush()
}

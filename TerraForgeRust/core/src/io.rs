//! Heightmap I/O — .r16 RAW + PNG read/write.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

/// Write a heightmap (f32 [0,1]) to a 16-bit unsigned little-endian RAW (.r16) file.
pub fn write_r16<P: AsRef<Path>>(path: P, data: &[f32]) -> std::io::Result<()> {
    let f = File::create(path)?;
    let mut w = BufWriter::new(f);
    let mut buf = [0u8; 2];
    for &v in data {
        let q = (v.clamp(0.0, 1.0) * 65535.0).round() as u16;
        buf.copy_from_slice(&q.to_le_bytes());
        w.write_all(&buf)?;
    }
    w.flush()
}

/// Read a .r16 heightmap. Returns (data, inferred_size).
pub fn read_r16<P: AsRef<Path>>(path: P) -> std::io::Result<(Vec<f32>, u32)> {
    let f = File::open(path)?;
    let mut r = BufReader::new(f);
    let mut bytes = Vec::new();
    r.read_to_end(&mut bytes)?;
    let samples = bytes.len() / 2;
    let size = (samples as f64).sqrt() as u32;
    if (size * size) as usize != samples {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "not a square .r16 (sample count is not a perfect square)",
        ));
    }
    let mut data = vec![0f32; samples];
    for i in 0..samples {
        let v = u16::from_le_bytes([bytes[i * 2], bytes[i * 2 + 1]]);
        data[i] = v as f32 / 65535.0;
    }
    Ok((data, size))
}

/// Write a Vec<f32> as 8-bit grayscale PNG.
pub fn write_png_gray<P: AsRef<Path>>(path: P, data: &[f32], size: u32) -> Result<(), png::EncodingError> {
    let f = File::create(path)?;
    let w = BufWriter::new(f);
    let mut encoder = png::Encoder::new(w, size, size);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    let mut buf = vec![0u8; data.len()];
    for (i, &v) in data.iter().enumerate() {
        buf[i] = (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    writer.write_image_data(&buf)?;
    Ok(())
}

/// Write a Vec<f32> as 16-bit grayscale PNG (preserves precision unlike 8-bit).
pub fn write_png_gray16<P: AsRef<Path>>(path: P, data: &[f32], size: u32) -> Result<(), png::EncodingError> {
    let f = File::create(path)?;
    let w = BufWriter::new(f);
    let mut encoder = png::Encoder::new(w, size, size);
    encoder.set_color(png::ColorType::Grayscale);
    encoder.set_depth(png::BitDepth::Sixteen);
    let mut writer = encoder.write_header()?;
    let mut buf = vec![0u8; data.len() * 2];
    for (i, &v) in data.iter().enumerate() {
        let q = (v.clamp(0.0, 1.0) * 65535.0).round() as u16;
        let bytes = q.to_be_bytes(); // PNG uses big-endian!
        buf[i * 2] = bytes[0];
        buf[i * 2 + 1] = bytes[1];
    }
    writer.write_image_data(&buf)?;
    Ok(())
}

/// Write a packed RGBA buffer (Vec<u8> of length size*size*4) as PNG.
pub fn write_png_rgba<P: AsRef<Path>>(path: P, rgba: &[u8], size: u32) -> Result<(), png::EncodingError> {
    let f = File::create(path)?;
    let w = BufWriter::new(f);
    let mut encoder = png::Encoder::new(w, size, size);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(rgba)?;
    Ok(())
}

/// Read a PNG file and return it as a normalized [0, 1] luminance Vec<f32>,
/// center-cropped to a square (`size` = min(width, height)).
pub fn read_png_as_heightmap<P: AsRef<Path>>(path: P) -> Result<(Vec<f32>, u32), Box<dyn std::error::Error>> {
    let f = File::open(path)?;
    let decoder = png::Decoder::new(BufReader::new(f));
    let mut reader = decoder.read_info()?;
    let info = reader.info();
    let w = info.width as usize;
    let h = info.height as usize;
    let depth = info.bit_depth;
    let color = info.color_type;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let frame = reader.next_frame(&mut buf)?;
    let raw = &buf[..frame.buffer_size()];
    let size = w.min(h);
    let mut out = vec![0f32; size * size];
    let sx = (w - size) / 2;
    let sy = (h - size) / 2;

    let channels = match color {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err("indexed PNGs are not supported".into()),
    };
    let bpp = match depth {
        png::BitDepth::Eight => 1,
        png::BitDepth::Sixteen => 2,
        _ => return Err("unsupported bit depth".into()),
    };
    let stride = w * channels * bpp;

    for y in 0..size {
        for x in 0..size {
            let px_off = (sy + y) * stride + (sx + x) * channels * bpp;
            let v = if bpp == 1 {
                (match channels {
                    1 => raw[px_off] as f32,
                    2 => raw[px_off] as f32,
                    3 | 4 => {
                        let r = raw[px_off] as f32;
                        let g = raw[px_off + 1] as f32;
                        let b = raw[px_off + 2] as f32;
                        0.2126 * r + 0.7152 * g + 0.0722 * b
                    }
                    _ => 0.0,
                }) / 255.0
            } else {
                // 16-bit: PNG is big-endian
                let read_be = |o: usize| u16::from_be_bytes([raw[o], raw[o + 1]]) as f32;
                (match channels {
                    1 | 2 => read_be(px_off),
                    3 | 4 => {
                        let r = read_be(px_off);
                        let g = read_be(px_off + 2);
                        let b = read_be(px_off + 4);
                        0.2126 * r + 0.7152 * g + 0.0722 * b
                    }
                    _ => 0.0,
                }) / 65535.0
            };
            out[y * size + x] = v;
        }
    }
    // normalize for consistency with the JS path
    crate::normalize(&mut out);
    Ok((out, size as u32))
}

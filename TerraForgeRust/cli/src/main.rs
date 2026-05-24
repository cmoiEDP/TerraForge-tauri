//! TerraForge CLI — subcommand front-end to the core library.
//!
//! Run `terraforge --help` to see all subcommands.

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use std::time::Instant;
use terraforge_core::{
    biomes::{compute_biome_splatmap, BiomeParams},
    combine::{combine_heightmaps, BlendMode},
    erosion::{erode, ErosionParams},
    io,
    noise::{generate_heightmap, NoiseParams},
    presets::get_preset,
    roads::{rasterize_roads, RoadParams, Waypoint},
    scatter::{rasterize_dot_map_grayscale, scatter_points, ScatterLayer},
    shapes::apply_preset_shape,
    upscale::{upscale_with_detail, UpscaleParams},
};

#[derive(Parser)]
#[command(
    name = "terraforge",
    version,
    about = "Procedural heightmap generator — Rust port of the TerraForge web app"
)]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Synthesize a heightmap from noise + optional preset shape + optional erosion.
    Gen {
        #[arg(long, default_value_t = 1024)] size: u32,
        #[arg(long, default_value_t = 1337)] seed: u32,
        /// Use a curated preset (alpine, rolling, desert, volcanic, archipelago, canyon, plateau)
        #[arg(long)] preset: Option<String>,
        /// Apply hydraulic erosion after generation
        #[arg(long, default_value_t = false)] erode: bool,
        #[arg(long, default_value_t = 50_000)] iterations: u32,
        #[arg(long)] out: PathBuf,
        /// Also export an 8-bit PNG preview alongside the .r16
        #[arg(long)] png_preview: Option<PathBuf>,
    },

    /// Apply hydraulic erosion to an existing heightmap (.r16 or .png).
    Erode {
        #[arg(long)] input: PathBuf,
        #[arg(long, default_value_t = 50_000)] iterations: u32,
        #[arg(long, default_value_t = 0.3)] erosion: f32,
        #[arg(long, default_value_t = 0.3)] deposition: f32,
        #[arg(long, default_value_t = 0.05)] inertia: f32,
        #[arg(long, default_value_t = 42)] seed: u32,
        #[arg(long)] out: PathBuf,
    },

    /// Upscale a heightmap to a higher resolution with bicubic + fractal detail.
    Upscale {
        #[arg(long)] input: PathBuf,
        #[arg(long, default_value_t = 4096)] to: u32,
        #[arg(long, default_value_t = 0.15)] detail: f32,
        #[arg(long, default_value_t = 4)] octaves: u32,
        #[arg(long, default_value_t = 7)] seed: u32,
        #[arg(long, default_value_t = true)] preserve_ridges: bool,
        #[arg(long)] out: PathBuf,
    },

    /// Generate a biome splatmap from a heightmap. Output is RGBA PNG.
    Biome {
        #[arg(long)] input: PathBuf,
        #[arg(long, default_value_t = 0.12)] water: f32,
        #[arg(long, default_value_t = 0.05)] sand: f32,
        #[arg(long, default_value_t = 0.55)] grass_max: f32,
        #[arg(long, default_value_t = 0.82)] rock_max: f32,
        #[arg(long, default_value_t = 0.45)] slope_bias: f32,
        #[arg(long)] out: PathBuf,
    },

    /// Scatter a vegetation/prop dot map from a heightmap.
    Scatter {
        #[arg(long)] input: PathBuf,
        /// Layer preset: trees, bushes, rocks
        #[arg(long, default_value = "trees")] layer: String,
        #[arg(long)] density: Option<f32>,
        #[arg(long)] min_spacing: Option<u32>,
        #[arg(long)] max_slope: Option<f32>,
        #[arg(long)] seed: Option<u32>,
        #[arg(long)] out: PathBuf,
    },

    /// Combine two heightmaps with a blend mode.
    Combine {
        #[arg(long)] a: PathBuf,
        #[arg(long)] b: PathBuf,
        /// Blend mode: add, subtract, multiply, max, min, screen, lerp
        #[arg(long, default_value = "lerp")] mode: String,
        #[arg(long, default_value_t = 0.5)] blend: f32,
        #[arg(long)] out: PathBuf,
    },

    /// Rasterize a road mask from a waypoint list.
    Road {
        #[arg(long)] input: PathBuf,
        /// Waypoint list: "x1,y1 x2,y2 …" in normalized [0,1] coordinates
        #[arg(long)] waypoints: String,
        #[arg(long, default_value_t = 8.0)] width: f32,
        #[arg(long, default_value_t = 4.0)] falloff: f32,
        #[arg(long)] out: PathBuf,
    },
}

fn load_heightmap(path: &PathBuf) -> (Vec<f32>, u32) {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext.eq_ignore_ascii_case("r16") || ext.eq_ignore_ascii_case("raw") {
        io::read_r16(path).expect("failed to read .r16")
    } else {
        io::read_png_as_heightmap(path).expect("failed to read png")
    }
}

fn save_heightmap(path: &PathBuf, data: &[f32], size: u32) {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    if ext.eq_ignore_ascii_case("r16") || ext.eq_ignore_ascii_case("raw") {
        io::write_r16(path, data).expect("failed to write .r16");
    } else if ext.eq_ignore_ascii_case("png") {
        io::write_png_gray16(path, data, size).expect("failed to write png");
    } else {
        panic!("unknown output extension; use .r16 or .png");
    }
}

fn main() {
    let cli = Cli::parse();
    match cli.command {
        Cmd::Gen { size, seed, preset, erode: do_erode, iterations, out, png_preview } => {
            let mut np = NoiseParams { size, seed, ..Default::default() };
            let mut ep = ErosionParams { iterations, seed: seed ^ 0xabcd, ..Default::default() };
            let preset_id = preset.clone();
            if let Some(id) = &preset {
                if let Some(p) = get_preset(id) {
                    np = NoiseParams { size, seed, ..p.noise };
                    ep = ErosionParams { iterations, seed: seed ^ 0xabcd, ..p.erosion };
                } else {
                    eprintln!("unknown preset: {id}; using defaults");
                }
            }
            let t0 = Instant::now();
            let mut h = generate_heightmap(&np);
            if let Some(id) = preset_id { apply_preset_shape(&id, &mut h, size); }
            if do_erode { erode(&mut h, size, &ep); }
            println!("✓ generated {size}×{size} in {:.2}s", t0.elapsed().as_secs_f32());
            save_heightmap(&out, &h, size);
            println!("→ {}", out.display());
            if let Some(p) = png_preview {
                io::write_png_gray(&p, &h, size).expect("png write");
                println!("→ {}", p.display());
            }
        }

        Cmd::Erode { input, iterations, erosion: er, deposition, inertia, seed, out } => {
            let (mut h, size) = load_heightmap(&input);
            let p = ErosionParams { iterations, erosion: er, deposition, inertia, seed, ..Default::default() };
            let t0 = Instant::now();
            erode(&mut h, size, &p);
            println!("✓ eroded {iterations} particles in {:.2}s", t0.elapsed().as_secs_f32());
            save_heightmap(&out, &h, size);
            println!("→ {}", out.display());
        }

        Cmd::Upscale { input, to, detail, octaves, seed, preserve_ridges, out } => {
            let (src, src_size) = load_heightmap(&input);
            let p = UpscaleParams { detail_strength: detail, detail_octaves: octaves, seed, preserve_ridges, ..Default::default() };
            let t0 = Instant::now();
            let up = upscale_with_detail(&src, src_size, to, &p);
            println!("✓ upscaled {src_size}→{to} in {:.2}s", t0.elapsed().as_secs_f32());
            save_heightmap(&out, &up, to);
            println!("→ {}", out.display());
        }

        Cmd::Biome { input, water, sand, grass_max, rock_max, slope_bias, out } => {
            let (h, size) = load_heightmap(&input);
            let p = BiomeParams { water_level: water, sand_width: sand, grass_max, rock_max, slope_bias, ..Default::default() };
            let r = compute_biome_splatmap(&h, size, &p);
            io::write_png_rgba(&out, &r.splatmap, size).expect("png");
            println!("→ {} ({}×{} RGBA splat)", out.display(), size, size);
        }

        Cmd::Scatter { input, layer, density, min_spacing, max_slope, seed, out } => {
            let (h, size) = load_heightmap(&input);
            let mut l = match layer.as_str() {
                "trees" => ScatterLayer::trees(),
                "bushes" => ScatterLayer::bushes(),
                "rocks" => ScatterLayer::rocks(),
                other => { eprintln!("unknown layer '{other}', using trees"); ScatterLayer::trees() }
            };
            if let Some(d) = density { l.density = d; }
            if let Some(s) = min_spacing { l.min_spacing = s; }
            if let Some(s) = max_slope { l.max_slope = s; }
            if let Some(s) = seed { l.seed = s; }
            let slope = terraforge_core::biomes::compute_slope_map(&h, size);
            let pts = scatter_points(&h, &slope, size, &l);
            let mask = rasterize_dot_map_grayscale(&pts, size);
            io::write_png_rgba(&out, &mask, size).expect("png");
            println!("✓ scattered {} points → {}", pts.len(), out.display());
        }

        Cmd::Combine { a, b, mode, blend, out } => {
            let (ha, size_a) = load_heightmap(&a);
            let (hb, size_b) = load_heightmap(&b);
            if size_a != size_b { panic!("size mismatch: {} vs {}", size_a, size_b); }
            let m = BlendMode::parse(&mode).expect("invalid blend mode");
            let combined = combine_heightmaps(&ha, &hb, m, blend);
            save_heightmap(&out, &combined, size_a);
            println!("→ {}", out.display());
        }

        Cmd::Road { input, waypoints, width, falloff, out } => {
            let (_, size) = load_heightmap(&input);
            let mut wp: Vec<Waypoint> = Vec::new();
            for tok in waypoints.split_whitespace() {
                let parts: Vec<&str> = tok.split(',').collect();
                if parts.len() != 2 { panic!("waypoint must be 'x,y' got {tok}"); }
                wp.push(Waypoint { x: parts[0].parse().unwrap(), y: parts[1].parse().unwrap() });
            }
            if wp.len() < 2 { panic!("need at least 2 waypoints"); }
            let p = RoadParams { width, falloff, ..Default::default() };
            let mask = rasterize_roads(&wp, size, &p);
            io::write_png_rgba(&out, &mask, size).expect("png");
            println!("✓ road with {} waypoints → {}", wp.len(), out.display());
        }
    }
}

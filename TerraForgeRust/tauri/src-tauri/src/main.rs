// TerraForge Tauri backend — Rust commands exposed to the React frontend.
// The frontend detects `window.__TAURI_INTERNALS__` and routes heavy compute
// (noise, erosion, upscale, scatter, road raster, brush, mesh export) to these
// commands instead of running the JS implementation.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use terraforge_core::{
    biomes::{compute_biome_splatmap, compute_slope_map, BiomeParams},
    brush::{apply_brush, BrushMode, BrushParams},
    combine::{combine_heightmaps, BlendMode},
    erosion::{erode, ErosionParams},
    io as tio,
    mesh::write_obj,
    noise::{generate_heightmap, NoiseParams},
    presets::get_preset,
    roads::{flatten_along_road, rasterize_roads, RoadParams, Waypoint},
    scatter::{rasterize_dot_map_grayscale, scatter_points, ScatterLayer},
    shapes::apply_preset_shape,
    upscale::{upscale_with_detail, UpscaleParams},
};

/// In-memory store keyed by string id so the frontend can keep a handle to a
/// heightmap without round-tripping the whole `Vec<f32>` over IPC each call.
struct Store {
    maps: Mutex<std::collections::HashMap<String, (Vec<f32>, u32)>>,
}

impl Default for Store {
    fn default() -> Self {
        Self { maps: Mutex::new(std::collections::HashMap::new()) }
    }
}

fn put_map(store: &State<Store>, id: &str, data: Vec<f32>, size: u32) {
    store.maps.lock().unwrap().insert(id.to_string(), (data, size));
}
fn get_map(store: &State<Store>, id: &str) -> Option<(Vec<f32>, u32)> {
    store.maps.lock().unwrap().get(id).cloned()
}

// ─── DTOs (mirror JS payloads loosely) ──────────────────────────────────────

#[derive(Deserialize)]
struct NoiseDto {
    size: u32, seed: u32, scale: f32, octaves: u32,
    persistence: f32, lacunarity: f32, ridge_blend: f32,
    warp: f32, exponent: f32,
}
impl From<NoiseDto> for NoiseParams {
    fn from(d: NoiseDto) -> Self {
        Self {
            size: d.size, seed: d.seed, scale: d.scale, octaves: d.octaves,
            persistence: d.persistence, lacunarity: d.lacunarity,
            ridge_blend: d.ridge_blend, warp: d.warp, exponent: d.exponent,
        }
    }
}

#[derive(Deserialize)]
struct ErodeDto {
    iterations: u32, erosion: f32, deposition: f32, inertia: f32, seed: u32,
}

#[derive(Deserialize)]
struct UpscaleDto {
    target: u32, detail_strength: f32, detail_octaves: u32,
    detail_scale: f32, seed: u32, preserve_ridges: bool,
}

#[derive(Deserialize)]
struct BiomeDto {
    water_level: f32, sand_width: f32, grass_max: f32,
    rock_max: f32, slope_bias: f32, blend_softness: f32,
}
impl From<BiomeDto> for BiomeParams {
    fn from(d: BiomeDto) -> Self {
        Self {
            water_level: d.water_level, sand_width: d.sand_width,
            grass_max: d.grass_max, rock_max: d.rock_max,
            slope_bias: d.slope_bias, blend_softness: d.blend_softness,
        }
    }
}

#[derive(Deserialize)]
struct ScatterDto {
    id: String, density: f32, min_spacing: u32,
    min_height: f32, max_height: f32, max_slope: f32,
    avoid_water: f32, jitter: f32, seed: u32,
}

#[derive(Deserialize)]
struct RoadDto {
    waypoints: Vec<[f32; 2]>,
    width: f32, falloff: f32,
}

#[derive(Deserialize)]
struct BrushDto {
    cx: f32, cy: f32, mode: String, radius: f32, strength: f32, target_height: f32,
}

#[derive(Serialize)]
struct ScatterResult {
    points: Vec<[u32; 2]>,
    dot_map_b64: String, // PNG-ready RGBA -> base64 (small enough at typical sizes)
}

// ─── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
fn tf_generate(store: State<Store>, id: String, params: NoiseDto, preset: Option<String>) -> Result<u32, String> {
    let size = params.size;
    let np: NoiseParams = match &preset {
        Some(pid) => {
            if let Some(p) = get_preset(pid) {
                NoiseParams { size, seed: params.seed, ..p.noise }
            } else { params.into() }
        }
        None => params.into(),
    };
    let mut h = generate_heightmap(&np);
    if let Some(pid) = preset { apply_preset_shape(&pid, &mut h, size); }
    put_map(&store, &id, h, size);
    Ok(size)
}

#[tauri::command]
fn tf_erode(store: State<Store>, id: String, dst_id: String, params: ErodeDto) -> Result<(), String> {
    let (mut h, size) = get_map(&store, &id).ok_or("source heightmap not found")?;
    let p = ErosionParams {
        iterations: params.iterations, erosion: params.erosion,
        deposition: params.deposition, inertia: params.inertia,
        seed: params.seed, ..Default::default()
    };
    erode(&mut h, size, &p);
    put_map(&store, &dst_id, h, size);
    Ok(())
}

#[tauri::command]
fn tf_upscale(store: State<Store>, id: String, dst_id: String, params: UpscaleDto) -> Result<u32, String> {
    let (src, src_size) = get_map(&store, &id).ok_or("source heightmap not found")?;
    let p = UpscaleParams {
        detail_strength: params.detail_strength, detail_octaves: params.detail_octaves,
        detail_scale: params.detail_scale, seed: params.seed,
        preserve_ridges: params.preserve_ridges,
    };
    let up = upscale_with_detail(&src, src_size, params.target, &p);
    put_map(&store, &dst_id, up, params.target);
    Ok(params.target)
}

#[tauri::command]
fn tf_combine(store: State<Store>, a: String, b: String, dst_id: String, mode: String, blend: f32) -> Result<(), String> {
    let (ha, size_a) = get_map(&store, &a).ok_or("a not found")?;
    let (hb, size_b) = get_map(&store, &b).ok_or("b not found")?;
    if size_a != size_b { return Err("size mismatch".into()); }
    let m = BlendMode::parse(&mode).ok_or("invalid mode")?;
    let r = combine_heightmaps(&ha, &hb, m, blend);
    put_map(&store, &dst_id, r, size_a);
    Ok(())
}

#[tauri::command]
fn tf_biome_splatmap(store: State<Store>, id: String, params: BiomeDto) -> Result<Vec<u8>, String> {
    let (h, size) = get_map(&store, &id).ok_or("source not found")?;
    let bp: BiomeParams = params.into();
    let r = compute_biome_splatmap(&h, size, &bp);
    Ok(r.splatmap)
}

#[tauri::command]
fn tf_scatter(store: State<Store>, id: String, params: ScatterDto) -> Result<ScatterResult, String> {
    let (h, size) = get_map(&store, &id).ok_or("source not found")?;
    let layer = ScatterLayer {
        id: params.id, density: params.density, min_spacing: params.min_spacing,
        min_height: params.min_height, max_height: params.max_height,
        max_slope: params.max_slope, avoid_water: params.avoid_water,
        jitter: params.jitter, seed: params.seed,
    };
    let slope = compute_slope_map(&h, size);
    let pts = scatter_points(&h, &slope, size, &layer);
    let png_data = rasterize_dot_map_grayscale(&pts, size);
    use base64::{engine::general_purpose, Engine as _};
    let b64 = general_purpose::STANDARD.encode(&png_data);
    let points: Vec<[u32; 2]> = pts.into_iter().map(|(x, y)| [x, y]).collect();
    Ok(ScatterResult { points, dot_map_b64: b64 })
}

#[tauri::command]
fn tf_road_raster(store: State<Store>, id: String, params: RoadDto) -> Result<Vec<u8>, String> {
    let (_, size) = get_map(&store, &id).ok_or("source not found")?;
    let wp: Vec<Waypoint> = params.waypoints.iter().map(|[x, y]| Waypoint { x: *x, y: *y }).collect();
    let rp = RoadParams { width: params.width, falloff: params.falloff, ..Default::default() };
    Ok(rasterize_roads(&wp, size, &rp))
}

#[tauri::command]
fn tf_road_flatten(store: State<Store>, id: String, params: RoadDto, strength: f32) -> Result<(), String> {
    let (mut h, size) = get_map(&store, &id).ok_or("source not found")?;
    let wp: Vec<Waypoint> = params.waypoints.iter().map(|[x, y]| Waypoint { x: *x, y: *y }).collect();
    flatten_along_road(&mut h, size, &wp, params.width * 0.5, params.falloff, strength);
    put_map(&store, &id, h, size);
    Ok(())
}

#[tauri::command]
fn tf_brush(store: State<Store>, id: String, params: BrushDto) -> Result<(), String> {
    let (mut h, size) = get_map(&store, &id).ok_or("source not found")?;
    let bp = BrushParams {
        mode: BrushMode::parse(&params.mode).unwrap_or(BrushMode::Raise),
        radius: params.radius, strength: params.strength, target_height: params.target_height,
    };
    apply_brush(&mut h, size, params.cx, params.cy, &bp);
    put_map(&store, &id, h, size);
    Ok(())
}

#[tauri::command]
fn tf_get_heightmap(store: State<Store>, id: String) -> Result<(Vec<f32>, u32), String> {
    get_map(&store, &id).ok_or_else(|| "not found".into())
}

#[tauri::command]
fn tf_put_heightmap(store: State<Store>, id: String, data: Vec<f32>, size: u32) -> Result<(), String> {
    put_map(&store, &id, data, size);
    Ok(())
}

#[tauri::command]
fn tf_export_r16(store: State<Store>, id: String, path: String) -> Result<(), String> {
    let (h, _) = get_map(&store, &id).ok_or("not found")?;
    tio::write_r16(path, &h).map_err(|e| e.to_string())
}

#[tauri::command]
fn tf_export_png16(store: State<Store>, id: String, path: String) -> Result<(), String> {
    let (h, size) = get_map(&store, &id).ok_or("not found")?;
    tio::write_png_gray16(path, &h, size).map_err(|e| e.to_string())
}

#[tauri::command]
fn tf_export_obj(store: State<Store>, id: String, path: String, height_scale: f32, decimate: u32) -> Result<(), String> {
    let (h, size) = get_map(&store, &id).ok_or("not found")?;
    write_obj(path, &h, size, height_scale, decimate).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Store::default())
        .invoke_handler(tauri::generate_handler![
            tf_generate, tf_erode, tf_upscale, tf_combine,
            tf_biome_splatmap, tf_scatter, tf_road_raster, tf_road_flatten,
            tf_brush, tf_get_heightmap, tf_put_heightmap,
            tf_export_r16, tf_export_png16, tf_export_obj,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            { if let Some(window) = app.get_webview_window("main") { window.open_devtools(); } }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() { run(); }

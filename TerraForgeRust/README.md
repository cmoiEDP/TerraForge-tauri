# TerraForge — Rust port

Native Rust implementation of the TerraForge heightmap synthesis pipeline.
The web app remains the canonical UI; this crate ports the **core algorithms**
to fast, dependency-light Rust + a CLI front-end for batch / scripted workflows.

## What's ported
| Module               | Source                                | Status |
|----------------------|---------------------------------------|--------|
| `noise`              | `lib/terrainGen.js::generateHeightmap`| ✅ fBm + ridged + domain warp |
| `erosion`            | `lib/terrainGen.js::erode`            | ✅ particle hydraulic |
| `shapes`             | `lib/shapes.js`                       | ✅ all 7 preset shapes |
| `biomes`             | `lib/biomes.js`                       | ✅ slope map + RGBA splatmap |
| `scatter`            | `lib/scatter.js`                      | ✅ dot positions + raster |
| `roads`              | `lib/roads.js`                        | ✅ Catmull-Rom spline + raster |
| `combine`            | `lib/combine.js`                      | ✅ 7 blend modes |
| `upscale`            | `lib/terrainGen.js::upscaleWithDetail`| ✅ bicubic + fractal detail |
| `presets`            | `lib/presets.js`                      | ✅ all 7 |
| `io`                 | `lib/heightmap.js`                    | ✅ .r16 export, PNG I/O |
| **Tauri desktop**    | `pages/TerrainStudio.jsx`             | ✅ React UI + Rust core via 14 `tf_*` commands (3D viewer included) |

## What's NOT ported (deliberately)
- React UI / Three.js viewer / reactflow node graph editor — these are inherently
  browser features. If a native GUI is wanted later, candidates are `egui`+`wgpu`
  or `bevy`, but that's a separate ~week-sized project.
- WebGPU compute — `wgpu-rs` could replace it, but the Rust noise pass on CPU
  with rayon already smokes the JS CPU version. Adding GPU is Phase 2 if needed.

## Build & run

Install Rust if you don't have it:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Build the CLI:
```bash
cd TerraForgeRust
cargo build --release -p terraforge-cli
```

The binary lands at `target/release/terraforge`.

Build & run the native desktop app (use Tauri — full React UI + 3D viewer + Rust core):
```bash
cargo install tauri-cli --version "^2"  # one-time
cd TerraForgeRust/tauri/src-tauri
cargo tauri build
```

Note : the standalone `egui` desktop crate was removed (it had no 3D viewer) — the Tauri shell is now the only native desktop target. It bundles the same React UI used on the web, with all heavy compute routed to Rust via `tf_*` commands.

## CLI usage

### Generate a heightmap with a preset
```bash
terraforge gen --size 4096 --preset alpine --seed 1337 \
    --out terrain.r16 --png-preview terrain.png
```

### Apply hydraulic erosion to an existing heightmap
```bash
terraforge erode --in terrain.r16 --iterations 80000 \
    --erosion 0.45 --deposition 0.2 --out terrain_eroded.r16
```

### Upscale a heightmap with fractal detail re-synthesis
```bash
terraforge upscale --in lowres.png --to 4096 --detail 0.15 \
    --octaves 5 --out upscaled.r16
```

### Generate a biome splatmap (RGBA: sand/grass/rock/snow)
```bash
terraforge biome --in terrain.r16 --water 0.12 --sand 0.05 \
    --grass-max 0.55 --rock-max 0.82 --out splatmap.png
```

### Scatter vegetation dot maps
```bash
terraforge scatter --in terrain.r16 --layer trees \
    --density 0.65 --min-spacing 6 --max-slope 0.45 \
    --out scatter_trees.png
```

### Combine two heightmaps
```bash
terraforge combine --a base.r16 --b detail.r16 \
    --mode lerp --blend 0.5 --out combined.r16
```

### Apply a road from waypoints
```bash
terraforge road --in terrain.r16 --width 12 --falloff 6 \
    --waypoints "0.1,0.2 0.3,0.45 0.6,0.6 0.85,0.5" \
    --out road_mask.png
```

### Full pipeline example (mirrors the React graph)
```bash
terraforge gen --size 2048 --preset volcanic --seed 42 --out step1.r16
terraforge erode --in step1.r16 --iterations 50000 --out step2.r16
terraforge biome --in step2.r16 --water 0.20 --out splat.png
terraforge scatter --in step2.r16 --layer trees --out trees.png
```

## Module layout
```
TerraForgeRust/
├── Cargo.toml              # workspace
├── core/                   # terraforge-core (lib)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── noise.rs
│       ├── erosion.rs
│       ├── shapes.rs
│       ├── biomes.rs
│       ├── scatter.rs
│       ├── roads.rs        # spline raster + flatten_along_road
│       ├── combine.rs
│       ├── upscale.rs
│       ├── presets.rs
│       ├── brush.rs        # raise / lower / flatten / smooth
│       ├── mesh.rs         # OBJ export from heightmap
│       └── io.rs
├── cli/                    # terraforge (bin)
│   ├── Cargo.toml
│   └── src/main.rs
└── tauri/                  # terraforge-tauri (reuses React UI)
    └── src-tauri/
        ├── Cargo.toml
        ├── build.rs
        ├── tauri.conf.json
        ├── capabilities/default.json
        └── src/main.rs     # 14 commands wrapping terraforge-core
```

## Tauri build (UI identical to web app)

The Tauri target reuses **the existing React frontend** (`/app/frontend/`) and routes all heavy compute to Rust commands. UI = strictement la même que la web version.

```bash
cargo install tauri-cli --version "^2"  # one-time
cd /app/TerraForgeRust/tauri/src-tauri

# dev (hot reload, points at React dev server on :3000)
cargo tauri dev

# release native binary (~10 MB, no Electron bloat)
cargo tauri build
```

Linux deps for WebKitGTK :
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

Exposed commands (`tf_*`) :
| Command | Effect |
|---------|--------|
| `tf_generate` | noise + optional preset shape, stored in Rust under string id |
| `tf_erode` | hydraulic erosion in place |
| `tf_upscale` | bicubic + fractal detail |
| `tf_combine` | blend two heightmaps |
| `tf_biome_splatmap` | RGBA splatmap |
| `tf_scatter` | dot map + positions |
| `tf_road_raster` | RGBA road overlay |
| `tf_road_flatten` | flatten heightmap under a road spline |
| `tf_brush` | raise / lower / flatten / smooth |
| `tf_export_r16` / `tf_export_png16` / `tf_export_obj` | save to disk |
| `tf_get_heightmap` / `tf_put_heightmap` | round-trip raw data |

The frontend detects Tauri at runtime (`window.__TAURI_INTERNALS__`) via `lib/tauri.js` — the same React build runs in **both** browser and Tauri.

## Output formats
Identical to the web app:
- `.r16` — 16-bit unsigned little-endian RAW, row-major, square. Direct import into Unity / Unreal / CryEngine terrain importers.
- `.png` — 8-bit grayscale for previews, 8-bit RGBA for splatmaps / scatter / road masks.

## Design notes
- All heightmaps are `Vec<f32>` in row-major order, values in [0, 1].
- No `unsafe` blocks. No external math deps (the noise hashing is hand-rolled,
  bit-identical to the JS path for cross-validation).
- `rayon` is used only for the noise and upscale outer loops where it gives
  ~4–8× speedup on multi-core. Erosion stays single-threaded (the particle
  algorithm is sequential by nature; parallelization needs splitting into
  independent tiles, deferred).

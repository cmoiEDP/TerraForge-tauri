# TerraForge — Tauri (native desktop, full React UI + Rust core)

Native cross-platform desktop build of TerraForge. Uses the exact same React UI as the web app, with all heavy compute (noise / erosion / upscale / brush / road raster / biome splatmap / scatter / combine) routed through a Rust core via 14 `tf_*` Tauri commands.

## ⚠️ Quick build (avoids the `frontendDist doesn't exist` error)

The Tauri shell consumes `frontend/build/`. **Plain `cargo build` does NOT auto-generate it** — only `cargo tauri build` does. Three working options:

### One-shot script (recommended)
**Windows:**
```powershell
.\build.ps1            # release build
.\build.ps1 -Dev       # dev mode (hot reload)
```
**macOS / Linux:**
```bash
./build.sh             # release
./build.sh --dev       # dev mode
```

### Or manually — `cargo tauri build` (chains everything)
```bash
cargo install tauri-cli --version "^2"            # one-time
cd TerraForgeRust/tauri/src-tauri
cargo tauri build
```

### Or manually — plain `cargo build` (frontend must already be built)
```bash
cd frontend && yarn install && yarn build
cd ../TerraForgeRust/tauri/src-tauri && cargo build --release
```

→ See `TerraForgeRust/BUILD.md` for the full troubleshooting reference.

## Why Tauri (and not the previous standalone egui desktop)

The previous `terraforge-desktop` crate used eframe + egui and rendered a hillshade preview only — no real 3D viewer. **It has been removed.** Tauri reuses the React Three.js viewer, so the desktop app is feature-identical to the web app, but :
- All synthesis runs in native Rust (rayon-parallel where useful) — 4-8× faster than the JS path
- Single binary ~10 MB, no Electron bloat
- Native file dialogs for import / export
- Full filesystem access for `.r16` and PNG writes without browser download prompts

## Prerequisites
- Rust toolchain (`rustup`) — https://rustup.rs
- Node.js 18+ and Yarn
- Platform deps :
  - **Windows** : Visual Studio Build Tools 2022 (C++ workload) + WebView2 runtime (preinstalled on Win 11)
  - **macOS** : Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** : `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential curl wget file libssl-dev`

## Build output locations

| Platform | Files |
|----------|-------|
| Windows  | `TerraForgeRust/target/release/bundle/msi/*.msi` + `nsis/*.exe` |
| macOS    | `TerraForgeRust/target/release/bundle/dmg/*.dmg` + `macos/*.app` |
| Linux    | `TerraForgeRust/target/release/bundle/deb/*.deb` + `appimage/*.AppImage` |

## CLI

A standalone `terraforge` CLI is also part of the workspace for batch/scripted workflows :
```bash
cargo build --release -p terraforge-cli
./target/release/terraforge gen --size 4096 --preset alpine --out terrain.r16
```
See `TerraForgeRust/README.md` for the full CLI reference.

## Workspace layout
```
TerraForge-tauri/
├── build.ps1 / build.sh          # one-shot build scripts
├── frontend/                     # React UI (shared with the web app)
└── TerraForgeRust/
    ├── BUILD.md                  # troubleshooting reference
    ├── Cargo.toml                # workspace = [core, cli, tauri/src-tauri]
    ├── core/                     # terraforge-core (lib) — noise, erosion, biomes, scatter, roads, combine, upscale, brush, mesh, io
    ├── cli/                      # terraforge-cli (bin)
    └── tauri/src-tauri/          # terraforge-tauri (bin) — Tauri 2 shell with 14 tf_* commands
        ├── icons/                # icon.ico, icon.icns, 32x32.png, 128x128.png, Square*Logo.png (Windows Store)
        ├── capabilities/
        ├── tauri.conf.json
        └── src/main.rs
```

## Exposed Tauri commands (`tf_*`)
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

The frontend detects Tauri at runtime via `window.__TAURI_INTERNALS__` (`frontend/src/TerraForge/lib/tauri.js`). The same React build runs in both browser and Tauri unchanged.

## Output formats
- `.r16` — 16-bit unsigned little-endian RAW, square. Unity / Unreal / CryEngine compatible
- `.obj` — mesh export (for DCC pipelines)
- `.png` — 8-bit grayscale (heightmap preview) or 8-bit RGBA (splatmap, scatter, road)

## License
See LICENSE in this repo.

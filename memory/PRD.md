# TERRA.FORGE — Heightmap Studio (PRD)

## Problem statement (original, FR)
> "cree un logiciel qui permet de prendre un .terain (gaea) et le generer en 4k heightmap"
> User insistait sur un patch DLL de Gaea pour débloquer la version free → **refusé** (contournement de licence commerciale). Pivot accepté par l'utilisateur : Option B+C combinées avec visualisation 3D, sortie .r16 16-bit RAW.

## What was built

Client-side React app + Rust/Tauri shell sharing the same React UI.

### Generator (Option C)
- Procedural synthesis: fBm + ridged simplex blend, domain-warped, exponent relief shaping
- Hydraulic erosion (particle-based) with configurable iterations / erosion / deposition / inertia
- Output sizes: 512, 1K, 2K, 4K
- Presets : Alpine Peaks, Rolling Hills, Desert Mesa, Volcanic Island, Archipelago, Canyon, High Plateau

### Upscaler (Option B)
- Accepts PNG/JPG/.r16 heightmap input
- Bicubic resample to 1K / 2K / 4K / 8K
- Fractal detail re-synthesis with edge-aware ridge preservation

### Visualization
- Three.js 3D viewer with manual orbit + zoom
- Vertex-colored terrain (biome-based: water / grass / rock / snow)
- Wireframe toggle, height-scale slider, mesh-density selector
- Top-down minimap (grayscale + overlays)
- Live progress bar, busy stage indicator
- Brush tool (raise / lower / flatten / smooth) painted directly on the minimap
- Live editing via `editVersion` bump → viewer re-renders on each stroke

### Pipeline features
- Biomes splatmap RGBA export
- Vegetation scatter (configurable layers, dot map export)
- Road editor (spline waypoints, custom texture, flatten onto heightmap)
- Combine A ⊕ B with multiple blend modes
- Node Graph editor (reactflow) : noise / shape / erode / combine / mask / output

### Export
- `.r16` 16-bit unsigned little-endian RAW (Unity/Unreal/CryEngine compatible)
- `.png` 8-bit preview
- Splatmap RGBA
- Per-layer scatter dot maps + combined

## Tech stack
- React 19 + react-router 7
- Three.js 0.184 (raw, no @react-three/fiber)
- simplex-noise 4
- reactflow 11
- TailwindCSS + custom dark "topographic" theme
- sonner toasts
- Tauri 2 shell (Rust workspace : core / desktop / cli / tauri)

## What was explicitly NOT built
- DLL patch / runtime hook / binary modification of QuadSpinner Gaea — refused as license circumvention.

## Files
- `/app/frontend/src/TerraForge/pages/TerrainStudio.jsx` — main page
- `/app/frontend/src/TerraForge/components/*.jsx` — panels & viewers
- `/app/frontend/src/TerraForge/lib/*.js` — terrainGen, erosion, biomes, scatter, roads, brush, presets, tauri-bridge
- `/app/frontend/src/TerraForge/nodes/{NodeGraph,executor,nodeTypes}.jsx` — graph editor
- `/app/TerraForgeRust/{core,cli,desktop,tauri}` — Rust workspace
- `/app/frontend/src/index.css` — theme

## Implementation log
- 2026-02-24 — Phase 0 : MVP Generator + Upscaler + 3D viewer + .r16 export
- 2026-02-24 — Phase 1 : Presets, biomes, scatter, roads, combine, brush, WebGPU noise, node graph, Tauri scaffold
- 2026-02-24 — Phase 2 fix : Brush 3D re-render via `editVersion` bump
- 2026-02-24 — Phase 3 fix : `nodrag` className on all interactive elements inside reactflow nodes
- 2026-02-24 — Phase 4 fix (this session) : Phase 3 had introduced compile-time errors (variable shadowing + undefined var + leftover dup block + state name mismatch). Recovered, validated by testing_agent (100% pass) and prod build (`yarn build`) succeeds → Tauri build path works.

## Backlog
- **P1** Web Worker for 4K/8K generation (currently blocks UI ~5-15s at 4K)
- **P1** Texture/color map export alongside heightmap
- **P2** Tilable / seamless mode (mirror-wrap noise sampling)
- **P2** Project save/load via MongoDB (backend already scaffolded)
- **P2** EXR HDR export
- **P2** Move `NODE_COMPONENTS` outside `NodeGraph` (or wrap in `useMemo`) to silence reactflow perf warning
- **P3** Thermal erosion in addition to hydraulic
- **P3** Mask painting (mountains/plains zones)
- **P3** Add `{ willReadFrequently: true }` to all 2D contexts used for repeated readbacks

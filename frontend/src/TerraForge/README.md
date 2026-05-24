# TerraForge — Architecture &amp; Roadmap

Auto-generated handover doc for the next session.

## Module layout
```
src/TerraForge/
├── pages/
│   └── TerrainStudio.jsx         # main page, wires every panel
├── components/
│   ├── GeneratorPanel.jsx        # noise + erosion sliders
│   ├── UpscalerPanel.jsx         # bicubic + fractal detail upscaler
│   ├── PresetSelector.jsx        # 7 curated presets (alpine, rolling, desert, …)
│   ├── BiomePanel.jsx            # water-level / sand / grass / rock / snow tuning + splatmap export
│   ├── VegetationPanel.jsx       # scatter layers (trees, bushes, rocks) -> dot maps
│   ├── RoadPanel.jsx             # waypoint list, road geometry, texture upload
│   ├── CombinePanel.jsx          # blend two heightmaps with mode + amount
│   ├── TerrainViewer3D.jsx       # Three.js mesh with biome shading + overlays
│   ├── MiniMap.jsx               # interactive top-down (click = waypoint)
│   └── Slider2.jsx               # shared slider primitive
└── lib/
    ├── terrainGen.js             # fbm + ridged simplex, hydraulic erosion, upscaler
    ├── heightmap.js              # .r16 export, PNG export, image/r16 parsing
    ├── presets.js                # PRESETS array + getPresetParams()
    ├── biomes.js                 # splatmap (RGBA = sand/grass/rock/snow), slope map
    ├── scatter.js                # rejection-sampled dot positions + raster helpers
    ├── roads.js                  # Catmull-Rom spline + width/falloff rasterization
    └── combine.js                # add / multiply / max / min / lerp / screen / subtract
```

## Data flow
1. **Preset** writes into `genParams` + `biomeParams`.
2. **Live preview** (debounced 180 ms) re-renders a 256×256 quick noise into `previewData`, drawn by `TerrainViewer3D`.
3. **Synthesize Terrain** runs full-size into `genResult`. **Erosion** mutates a copy in place.
4. **Combine** runs a second `generateHeightmap()` with another preset/seed, blends → `combineResult`. "Use as Base" promotes to `genResult`.
5. **Biome** params drive `TerrainViewer3D` colors live (cheap recolor only) AND splatmap export.
6. **Scatter** uses `computeSlopeMap` + per-layer rules → `scatterResults[layerId] = [[x,y]…]`.
7. **Roads** : minimap clicks append normalized waypoints → Catmull-Rom → `rasterizeRoads()` produces an RGBA overlay (downsampled to 1024 for preview, full size on export).

## Exports (Unity/Unreal pipeline)
- `terrain_{size}.r16` — 16-bit unsigned LE, row-major, square
- `terrain_{size}.png` — 8-bit preview
- `splatmap_{size}.png` — RGBA (R=sand, G=grass, B=rock, A=snow)
- `scatter_{layer}_{size}.png` — grayscale dot map (1px = 1 instance)
- `scatter_combined_{size}.png` — color overview
- `road_mask_{size}.png` — RGBA with alpha = road intensity, RGB tinted from texture

## TODO — Phase B (next session)

> **Status (updated)** : Phase B is now MERGED in commit `aa41ea7`. Both items below are implemented in MVP form. The text remains for reference of original design intent + future hardening.

### 1. WebGPU compute pipeline
Replace CPU loops in `terrainGen.js` (`generateHeightmap`, `erode`, `upscaleWithDetail`) with WGSL compute shaders. Detect via `navigator.gpu`, **fallback to CPU**. Target 4K in &lt;1s instead of ~5–15s.

- Storage textures: `r32float` for height, `r32float` ping-pong for erosion droplet stepping
- Compute group size: 16×16
- Erosion is the hardest port — particles need atomic adds when depositing/eroding within a kernel radius. Either:
  - Per-droplet single-thread (simple but slow on GPU), or
  - Voxelize into bucketed cells and process per-cell (research literature: GPU hydraulic erosion à la HE-WaterFlow).
- Keep `terrainGen.js` as the CPU fallback; introduce `terrainGenGPU.js` and pick at runtime.

### 2. Node graph editor (Gaea-style)
- Library candidate: `reactflow` (lightweight, MIT)
- Node types to start with: `NoiseNode`, `ErodeNode`, `CombineNode`, `BiomeNode`, `ScatterNode`, `RoadNode`, `OutputNode`
- Each node has typed sockets (heightmap, mask, RGBA). Edges = data flow.
- Execution = topological sort + cached compute. Re-run only dirty downstream.
- Persist graph as JSON (`/api/graphs/{id}` — backend already scaffolded with Mongo).
- UI: bottom drawer panel (50% screen height) toggled by a button, viewer stays on top.

### 3. Misc nice-to-haves
- Save/Load projects (MongoDB via backend, currently unused)
- EXR HDR export (use a tiny JS encoder)
- Tilable / seamless mode (mirror-wrap sampling in noise generation)
- Thermal erosion alongside hydraulic
- Mask painting tool (draw influence regions on minimap)

## Known limitations
- All computation on main thread → 4K @ default params ~6s, 8K upscale ~25s, blocks UI (no Web Worker yet by design choice — keep diff minimal)
- 3D viewer is downsampled to 256 mesh for perf (full data still used for exports)
- Live preview disables itself implicitly while `busy` (the synthesize button is the source of truth for committed result)

## Style invariants — do NOT touch
- Bricolage Grotesque + JetBrains Mono typography
- Dark `var(--bg-0)` background, accent `--accent` (#d97644), `--accent-2` teal
- Topographic grid background (`.topo-bg`)
- `label-mono`, `tag`, `panel`, `btn-primary`, `btn-ghost` are the shared atoms
- User explicitly said "ne touche pas au style de l'ui elle est trop belle actuellement"

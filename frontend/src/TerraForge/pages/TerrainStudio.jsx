import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import GeneratorPanel from "@/TerraForge/components/GeneratorPanel";
import UpscalerPanel from "@/TerraForge/components/UpscalerPanel";
import TerrainViewer3D from "@/TerraForge/components/TerrainViewer3D";
import MiniMap from "@/TerraForge/components/MiniMap";
import PresetSelector from "@/TerraForge/components/PresetSelector";
import BiomePanel from "@/TerraForge/components/BiomePanel";
import VegetationPanel from "@/TerraForge/components/VegetationPanel";
import RoadPanel from "@/TerraForge/components/RoadPanel";
import CombinePanel from "@/TerraForge/components/CombinePanel";
import { generateHeightmap, erode, upscaleWithDetail } from "@/TerraForge/lib/terrainGen";
import { exportR16, exportPNG8, exportPNGRGBA, parseImageFile, parseR16File } from "@/TerraForge/lib/heightmap";
import { PRESETS, getPresetParams } from "@/TerraForge/lib/presets";
import { computeBiomeSplatmap, DEFAULT_BIOME_PARAMS, computeSlopeMap } from "@/TerraForge/lib/biomes";
import { scatterPoints, rasterizeDotMap, rasterizeDotMapGrayscale, DEFAULT_SCATTER_LAYERS } from "@/TerraForge/lib/scatter";
import { rasterizeRoads, presetRoadTextures } from "@/TerraForge/lib/roads";
import { combineHeightmaps } from "@/TerraForge/lib/combine";
import { applyPresetShape } from "@/TerraForge/lib/shapes";
import { applyBrush, flattenAlongRoad } from "@/TerraForge/lib/brush";
import BrushPanel from "@/TerraForge/components/BrushPanel";
import { isNative } from "@/TerraForge/lib/tauri";
import NodeGraph from "@/TerraForge/nodes/NodeGraph";
import { toast, Toaster } from "sonner";

const DEFAULT_GEN = {
  size: 1024, seed: 1337, scale: 0.0018, octaves: 7, persistence: 0.5,
  ridgeBlend: 0.4, warp: 0.3, exponent: 1.4,
  iterations: 50000, erosion: 0.3, deposition: 0.3, inertia: 0.05,
};
const DEFAULT_UP = {
  targetSize: 4096, detailStrength: 0.12, detailOctaves: 4, detailScale: 0.01,
  seed: 7, preserveRidges: true,
};
const PREVIEW_SIZE = 256;

function Section({ id, title, tag, open = false, children }) {
  return (
    <details className="border border-[var(--line)] open:border-[var(--line-2)] mb-3" open={open} data-testid={`section-${id}`}>
      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer select-none">
        <span className="mono text-[11px] uppercase tracking-[0.14em]">{title}</span>
        {tag && <span className="tag">{tag}</span>}
      </summary>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </details>
  );
}

export default function TerrainStudio() {
  const [tab, setTab] = useState("terrain");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("idle");

  // Generator state
  const [genParams, setGenParams] = useState(DEFAULT_GEN);
  const [genResult, setGenResult] = useState(null); // {data, size}
  const [livePreview, setLivePreview] = useState(true);
  const [previewData, setPreviewData] = useState(null); // {data, size} small res
  const debounceRef = useRef(null);

  // Preset
  const [currentPreset, setCurrentPreset] = useState(null);

  // Upscaler state
  const [upParams, setUpParams] = useState(DEFAULT_UP);
  const [upSource, setUpSource] = useState(null);
  const [upResult, setUpResult] = useState(null);

  // Biome
  const [biomeParams, setBiomeParams] = useState(DEFAULT_BIOME_PARAMS);

  // Scatter
  const [scatterLayers, setScatterLayers] = useState(DEFAULT_SCATTER_LAYERS);
  const [scatterResults, setScatterResults] = useState(null); // { trees: [[x,y]], bushes: [...] }

  // Roads
  const [waypoints, setWaypoints] = useState([]);
  const [roadParams, setRoadParams] = useState({ width: 8, falloff: 4 });
  const [texturePreset, setTexturePreset] = useState("dirt");
  const [customTexture, setCustomTexture] = useState(null); // {name, w, h, data}
  const [roadOverlay, setRoadOverlay] = useState(null); // {data, size}

  // Combine
  const [secondPreset, setSecondPreset] = useState("rolling");
  const [secondSeed, setSecondSeed] = useState(42);
  const [blendMode, setBlendMode] = useState("lerp");
  const [blendAmount, setBlendAmount] = useState(0.5);
  const [combineResult, setCombineResult] = useState(null);

  // Graph
  const [graphResult, setGraphResult] = useState(null);
  const [graphSize, setGraphSize] = useState(1024);

  // Brush
  const [brushActive, setBrushActiveRaw] = useState(false);
  const [brushParams, setBrushParams] = useState({ mode: "raise", radius: 48, strength: 0.15, targetHeight: 0.5 });
  const [editVersion, setEditVersion] = useState(0); // bumped on in-place heightmap edits to force 3D + minimap re-render

  // Wrapper: when activating brush without a synthesized terrain, promote the live preview to an editable buffer
  const setBrushActive = (active) => {
    if (active && !genResult && previewData) {
      setGenResult({ data: new Float32Array(previewData.data), size: previewData.size });
      toast.success("Live preview promoted to editable buffer for brush");
    } else if (active && !genResult && !previewData) {
      toast.error("Synthesize a terrain first to enable the brush.");
      return;
    }
    setBrushActiveRaw(active);
  };

  const [heightScale, setHeightScale] = useState(0.35);
  const [wireframe, setWireframe] = useState(false);
  const [previewMeshSize, setPreviewMeshSize] = useState(256);

  // Effective current heightmap (for viewers/exports)
  const current = useMemo(() => {
    if (tab === "upscaler") return upResult || (upSource ? upSource : null);
    if (tab === "graph") return graphResult;
    return genResult || previewData;
  }, [tab, genResult, previewData, upResult, upSource, graphResult]);

  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  // ─── Live preview (debounced) ───
  // Heightmap content is INVARIANT of preview mesh density: live preview always at PREVIEW_SIZE.
  // The mesh dropdown only controls the 3D viewer's downsample target.
  useEffect(() => {
    if (tab !== "terrain" || !livePreview) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        const data = generateHeightmap({
          size: PREVIEW_SIZE,
          seed: genParams.seed,
          scale: genParams.scale * (genParams.size / PREVIEW_SIZE) * 0.5,
          octaves: Math.min(genParams.octaves, 6),
          persistence: genParams.persistence,
          lacunarity: 2.0,
          ridgeBlend: genParams.ridgeBlend,
          warp: genParams.warp,
          exponent: genParams.exponent,
        });
        if (currentPreset) applyPresetShape(currentPreset, data, PREVIEW_SIZE);
        setPreviewData({ data, size: PREVIEW_SIZE });
      } catch (e) { /* noop */ }
    }, 180);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [genParams.seed, genParams.scale, genParams.octaves, genParams.persistence,
      genParams.ridgeBlend, genParams.warp, genParams.exponent, genParams.size,
      livePreview, tab, currentPreset]);

  const handlePreset = (id) => {
    const p = getPresetParams(id);
    setCurrentPreset(id);
    setGenParams((g) => ({ ...g, ...p.gen, ...p.erosion }));
    setBiomeParams((b) => ({ ...b, ...p.biome }));
    toast.success(`Preset → ${p.name}`);
  };

  const handleGenerate = useCallback(async () => {
    setBusy(true); setProgress(0); setStage("synthesizing");
    await yieldUI();
    try {
      const t0 = performance.now();
      const data = generateHeightmap({
        size: genParams.size, seed: genParams.seed, scale: genParams.scale,
        octaves: genParams.octaves, persistence: genParams.persistence, lacunarity: 2.0,
        ridgeBlend: genParams.ridgeBlend, warp: genParams.warp, exponent: genParams.exponent,
        onProgress: (p) => setProgress(p),
      });
      if (currentPreset) applyPresetShape(currentPreset, data, genParams.size);
      const t1 = ((performance.now() - t0) / 1000).toFixed(2);
      setGenResult({ data, size: genParams.size });
      setProgress(1); setStage("ready");
      setScatterResults(null); setRoadOverlay(null);
      toast.success(`Synthesized ${genParams.size}×${genParams.size} in ${t1}s`);
    } catch (e) { toast.error("Generation failed: " + e.message); }
    finally { setBusy(false); }
  }, [genParams, currentPreset]);

  const handleErode = useCallback(async () => {
    if (!genResult) return;
    setBusy(true); setStage("eroding"); setProgress(0); await yieldUI();
    try {
      const t0 = performance.now();
      const copy = new Float32Array(genResult.data);
      erode(copy, genResult.size, {
        iterations: genParams.iterations, erosion: genParams.erosion,
        deposition: genParams.deposition, inertia: genParams.inertia,
        seed: genParams.seed ^ 0xabcd,
        onProgress: (p) => setProgress(p),
      });
      const t1 = ((performance.now() - t0) / 1000).toFixed(2);
      setGenResult({ data: copy, size: genResult.size });
      setProgress(1); setStage("ready");
      toast.success(`Erosion · ${genParams.iterations.toLocaleString()} particles · ${t1}s`);
    } catch (e) { toast.error("Erosion failed: " + e.message); }
    finally { setBusy(false); }
  }, [genResult, genParams]);

  const handleCombine = useCallback(async () => {
    if (!genResult) { toast.error("Generate a base heightmap first"); return; }
    setBusy(true); setStage("combining"); setProgress(0); await yieldUI();
    try {
      const preset = getPresetParams(secondPreset);
      const second = generateHeightmap({
        size: genResult.size, seed: secondSeed,
        scale: preset.gen.scale, octaves: preset.gen.octaves,
        persistence: preset.gen.persistence, lacunarity: 2.0,
        ridgeBlend: preset.gen.ridgeBlend, warp: preset.gen.warp, exponent: preset.gen.exponent,
        onProgress: (p) => setProgress(p * 0.6),
      });
      applyPresetShape(secondPreset, second, genResult.size);
      setProgress(0.7);
      const combined = combineHeightmaps(genResult.data, second, genResult.size, blendMode, blendAmount);
      setCombineResult({ data: combined, size: genResult.size });
      setProgress(1); setStage("ready");
      toast.success(`Combined · ${blendMode} · ${(blendAmount * 100).toFixed(0)}%`);
    } catch (e) { toast.error("Combine failed: " + e.message); }
    finally { setBusy(false); }
  }, [genResult, secondPreset, secondSeed, blendMode, blendAmount]);

  const useCombinedAsBase = () => {
    if (!combineResult) return;
    setGenResult(combineResult);
    setCombineResult(null);
    setScatterResults(null); setRoadOverlay(null);
    toast.success("Combined result promoted to base");
  };

  // ─── Upscaler ───
  const handleUpload = useCallback(async (file) => {
    setBusy(true); setStage("parsing source");
    try {
      const isR16 = /\.r16$|\.raw$/i.test(file.name);
      const parsed = isR16 ? await parseR16File(file) : await parseImageFile(file);
      setUpSource({ ...parsed, name: file.name });
      setStage("source ready");
      toast.success(`Loaded ${parsed.size}×${parsed.size}`);
    } catch (e) { toast.error("Upload failed: " + e.message); }
    finally { setBusy(false); }
  }, []);

  const handleUpscale = useCallback(async () => {
    if (!upSource) return;
    setBusy(true); setStage(`upscaling → ${upParams.targetSize}`); setProgress(0); await yieldUI();
    try {
      const t0 = performance.now();
      const data = upscaleWithDetail(upSource.data, upSource.size, upParams.targetSize, {
        detailStrength: upParams.detailStrength, detailOctaves: upParams.detailOctaves,
        detailScale: upParams.detailScale, seed: upParams.seed, preserveRidges: upParams.preserveRidges,
        onProgress: (p) => setProgress(p),
      });
      const t1 = ((performance.now() - t0) / 1000).toFixed(2);
      setUpResult({ data, size: upParams.targetSize });
      setProgress(1); setStage("ready");
      toast.success(`Upscaled ${upSource.size}→${upParams.targetSize} in ${t1}s`);
    } catch (e) { toast.error("Upscale failed: " + e.message); }
    finally { setBusy(false); }
  }, [upSource, upParams]);

  // ─── Scatter ───
  const handleScatter = useCallback(async () => {
    if (!current) { toast.error("No heightmap to scatter on"); return; }
    setBusy(true); setStage("scattering"); setProgress(0); await yieldUI();
    try {
      const slope = computeSlopeMap(current.data, current.size);
      const results = {};
      let i = 0;
      const enabled = scatterLayers.filter((l) => l.enabled);
      for (const layer of enabled) {
        const pts = scatterPoints(current.data, slope, current.size, layer);
        results[layer.id] = pts;
        i++;
        setProgress(i / enabled.length);
        await yieldUI();
      }
      // also include disabled (empty arrays)
      for (const layer of scatterLayers) if (!results[layer.id]) results[layer.id] = [];
      setScatterResults(results);
      setProgress(1); setStage("ready");
      toast.success(`Scattered ${Object.values(results).reduce((a, b) => a + b.length, 0).toLocaleString()} points`);
    } catch (e) { toast.error("Scatter failed: " + e.message); }
    finally { setBusy(false); }
  }, [current, scatterLayers]);

  // ─── Roads ───
  const handleUploadTexture = async (file) => {
    try {
      const { data, size } = await parseImageFile(file);
      // we keep raw RGBA via canvas read
      const reader = new FileReader();
      const img = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = reject;
          im.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      setCustomTexture({ name: file.name, w, h, data: rgba });
      setTexturePreset("custom");
      toast.success(`Texture loaded · ${w}×${h}`);
    } catch (e) { toast.error("Texture upload failed: " + e.message); }
  };

  const rasterizeAndShowRoad = useCallback(async () => {
    if (!current) { toast.error("No heightmap"); return; }
    if (waypoints.length < 2) return;
    setBusy(true); setStage("rasterizing road"); await yieldUI();
    try {
      let tintImage = null;
      if (texturePreset === "custom" && customTexture) {
        tintImage = customTexture;
      } else {
        const presets = presetRoadTextures();
        tintImage = presets.find((p) => p.name === texturePreset) || presets[0];
      }
      const targetSize = current.size;
      const overlaySize = Math.min(1024, targetSize);
      const data = rasterizeRoads(waypoints, overlaySize, {
        width: roadParams.width * (overlaySize / 1024),
        falloff: roadParams.falloff * (overlaySize / 1024),
        tintImage,
      });
      setRoadOverlay({ data, size: overlaySize });
      setStage("ready");
      toast.success(`Road rasterized · ${waypoints.length} waypoints`);
    } catch (e) { toast.error("Road raster failed: " + e.message); }
    finally { setBusy(false); }
  }, [current, waypoints, roadParams, texturePreset, customTexture]);

  // export road at full source size
  const exportRoadMask = () => {
    if (!current || waypoints.length < 2) return;
    let tintImage = null;
    if (texturePreset === "custom" && customTexture) tintImage = customTexture;
    else {
      const presets = presetRoadTextures();
      tintImage = presets.find((p) => p.name === texturePreset) || presets[0];
    }
    const data = rasterizeRoads(waypoints, current.size, {
      width: roadParams.width, falloff: roadParams.falloff, tintImage,
    });
    exportPNGRGBA(data, current.size, `road_mask_${current.size}.png`);
    toast.success(`Exported road mask ${current.size}×${current.size}`);
  };

  // minimap click → add/remove waypoint (or brush)
  const onMinimapClick = (nx, ny, shift) => {
    if (brushActive && genResult) {
      const cx = nx * genResult.size;
      const cy = ny * genResult.size;
      applyBrush(genResult.data, genResult.size, cx, cy, brushParams);
      setEditVersion((k) => k + 1);
      return;
    }
    if (shift) {
      if (waypoints.length === 0) return;
      let nearest = 0;
      let bestD = Infinity;
      for (let i = 0; i < waypoints.length; i++) {
        const d = Math.hypot(waypoints[i].x - nx, waypoints[i].y - ny);
        if (d < bestD) { bestD = d; nearest = i; }
      }
      setWaypoints(waypoints.filter((_, i) => i !== nearest));
    } else {
      setWaypoints([...waypoints, { x: nx, y: ny }]);
    }
  };

  // continuous brush stroke while user drags over the minimap
  const onMinimapDrag = (nx, ny) => {
    if (!brushActive || !genResult) return;
    const cx = nx * genResult.size;
    const cy = ny * genResult.size;
    applyBrush(genResult.data, genResult.size, cx, cy, brushParams);
    setEditVersion((k) => k + 1);
  };

  // Road → heightmap flatten action
  const flattenRoadOntoHeightmap = () => {
    if (!genResult || waypoints.length < 2) return;
    flattenAlongRoad(
      genResult.data, genResult.size,
      waypoints, roadParams.width * 0.5, roadParams.falloff, 0.8,
    );
    setEditVersion((k) => k + 1);
    toast.success("Road flattened onto heightmap");
  };

  // ─── Exports ───
  const exportCurrentR16 = () => {
    if (!current) return;
    const tag = tab === "upscaler" ? "upscaled" : "terrain";
    exportR16(current.data, `${tag}_${current.size}.r16`);
    toast.success(`Exported ${tag}_${current.size}.r16`);
  };
  const exportCurrentPNG = () => {
    if (!current) return;
    const tag = tab === "upscaler" ? "upscaled" : "terrain";
    exportPNG8(current.data, current.size, `${tag}_${current.size}.png`);
  };
  const exportSplatmap = () => {
    if (!current) return;
    const { splatmap } = computeBiomeSplatmap(current.data, current.size, biomeParams);
    exportPNGRGBA(splatmap, current.size, `splatmap_${current.size}.png`);
    toast.success(`Splatmap exported ${current.size}×${current.size}`);
  };
  const exportScatterLayer = (layer) => {
    if (!current || !scatterResults?.[layer.id]) return;
    const data = rasterizeDotMapGrayscale(scatterResults[layer.id], current.size);
    exportPNGRGBA(data, current.size, `scatter_${layer.id}_${current.size}.png`);
    toast.success(`${layer.name} dot map exported`);
  };
  const exportScatterCombined = () => {
    if (!current || !scatterResults) return;
    // combined RGB : merge all layers into one preview map with their colors
    const out = new Uint8ClampedArray(current.size * current.size * 4);
    for (let i = 0; i < current.size * current.size; i++) out[i * 4 + 3] = 255;
    for (const layer of scatterLayers) {
      const pts = scatterResults[layer.id];
      if (!pts) continue;
      const r = parseInt(layer.color.slice(1, 3), 16);
      const g = parseInt(layer.color.slice(3, 5), 16);
      const b = parseInt(layer.color.slice(5, 7), 16);
      for (const [px, py] of pts) {
        const i = (py * current.size + px) * 4;
        out[i] = r; out[i + 1] = g; out[i + 2] = b;
      }
    }
    exportPNGRGBA(out, current.size, `scatter_combined_${current.size}.png`);
  };

  const scatterOverlayForViewer = scatterResults
    ? {
        sourceSize: current?.size || 1,
        layers: scatterLayers.filter((l) => scatterResults[l.id]).map((l) => ({
          id: l.id, color: l.color, points: scatterResults[l.id],
        })),
      }
    : null;

  return (
    <div className="topo-bg min-h-screen flex flex-col" data-testid="terrain-studio">
      {/* HEADER */}
      <header className="border-b border-[var(--line)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-[var(--accent)] dot-live" />
            <span className="mono text-[11px] tracking-[0.18em] text-[var(--ink-dim)]">TERRA · FORGE</span>
          </div>
          <span className="tag">v0.2 — presets · biomes · scatter · roads</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={livePreview} onChange={(e) => setLivePreview(e.target.checked)} data-testid="toggle-live" />
            <span className="label-mono">live preview</span>
          </label>
          <span className="num text-[10px] text-[var(--ink-mute)]">
            stage: <span className="text-[var(--ink)]" data-testid="status-stage">{stage}</span>
          </span>
          <span className="num text-[10px] text-[var(--ink-mute)]" data-testid="status-progress">
            {(progress * 100).toFixed(0)}%
          </span>
        </div>
      </header>

      {/* TABS */}
      <div className="border-b border-[var(--line)] px-6 flex items-center">
        <button className={`tab-btn ${tab === "terrain" ? "active" : ""}`} onClick={() => setTab("terrain")} data-testid="tab-terrain">◆ Terrain</button>
        <button className={`tab-btn ${tab === "upscaler" ? "active" : ""}`} onClick={() => setTab("upscaler")} data-testid="tab-upscaler">◆ Upscaler</button>
        <button className={`tab-btn ${tab === "graph" ? "active" : ""}`} onClick={() => setTab("graph")} data-testid="tab-graph">◆ Graph</button>
        <div className="ml-auto flex items-center gap-3 py-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} data-testid="toggle-wireframe" />
            <span className="label-mono">wireframe</span>
          </label>
          <span className="label-mono">mesh</span>
          <select
            className="select-mono"
            style={{ width: 86, padding: "4px 6px" }}
            value={previewMeshSize}
            onChange={(e) => setPreviewMeshSize(parseInt(e.target.value, 10))}
            data-testid="preview-mesh-size"
          >
            <option value={128}>128</option>
            <option value={192}>192</option>
            <option value={256}>256</option>
            <option value={384}>384</option>
            <option value={512}>512</option>
            <option value={768}>768</option>
            <option value={1024}>1024</option>
            <option value={2048}>2048 ⚠</option>
            <option value={4096}>4096 ⚠⚠</option>
            <option value={8192}>8192 ⚠⚠⚠</option>
            <option value={16384}>16384 💀</option>
            <option value={30720}>30720 💀💀</option>
          </select>
          <span className="label-mono">height</span>
          <input type="range" className="slim" min={0.05} max={0.9} step={0.01} value={heightScale} onChange={(e) => setHeightScale(parseFloat(e.target.value))} style={{ width: 100 }} data-testid="height-scale" />
        </div>
      </div>

      {/* MAIN */}
      {tab === "graph" ? (
        <main className="flex-1 grid grid-rows-[minmax(280px,42vh)_1fr] grid-cols-1 xl:grid-cols-[1fr_300px]" style={{ minHeight: 0 }}>
          {/* TOP — 3D preview (spans both columns at xl) */}
          <section className="panel m-3 mb-1 overflow-hidden xl:col-span-2 relative" data-testid="graph-preview">
            <div className="absolute top-2 left-3 z-10 panel px-2 py-1 mono text-[10px] text-[var(--accent)]">
              ● GRAPH OUTPUT {graphResult ? `· ${graphResult.size}×${graphResult.size}` : "· empty"}
            </div>
            {graphResult ? (
              <TerrainViewer3D
                data={graphResult.data}
                size={graphResult.size}
                heightScale={heightScale}
                wireframe={wireframe}
                biomeParams={biomeParams}
                previewSize={previewMeshSize}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-center">
                <div>
                  <div className="num text-[10px] text-[var(--ink-mute)] mb-2">[ empty viewport ]</div>
                  <h3 className="text-xl text-[var(--ink-dim)]">Build a node graph below and hit <em className="text-[var(--accent)] not-italic">Run Graph</em></h3>
                </div>
              </div>
            )}
          </section>

          {/* BOTTOM — Node graph editor */}
          <section className="panel m-3 mt-1 overflow-hidden" data-testid="graph-section">
            <NodeGraph
              size={graphSize}
              onResult={(r) => { setGraphResult(r); }}
              busy={busy} setBusy={setBusy}
              stage={stage} setStage={setStage}
            />
          </section>

          {/* RIGHT — controls + stats */}
          <aside className="hidden xl:flex flex-col gap-3 m-3 mt-1" style={{ maxHeight: "calc(58vh - 24px)" }}>
            <div className="panel p-4 flex-shrink-0">
              <div className="label-mono mb-2">// Graph Output Size</div>
              <select className="select-mono" value={graphSize} onChange={(e) => setGraphSize(parseInt(e.target.value, 10))} data-testid="graph-size">
                <option value={256}>0256  ·  fast</option>
                <option value={512}>0512  ·  preview</option>
                <option value={1024}>1024  ·  1K</option>
                <option value={2048}>2048  ·  2K</option>
                <option value={4096}>4096  ·  4K</option>
                <option value={8192}>8192  ·  8K ⚠</option>
                <option value={16384}>16384 · 16K ⚠⚠</option>
                <option value={30720}>30720 · 30K 💀 RIP RAM</option>
              </select>
              {graphResult && (
                <button
                  className="btn-primary w-full mt-3"
                  onClick={() => { exportR16(graphResult.data, `graph_${graphResult.size}.r16`); toast.success(`Exported graph_${graphResult.size}.r16`); }}
                  data-testid="graph-export-r16"
                >
                  ⤓ Export .r16
                </button>
              )}
            </div>
            <div className="panel p-4 flex-1 overflow-y-auto scrollbar-thin">
              <div className="label-mono mb-3">// Stats</div>
              <div className="flex flex-col gap-2 num text-[11px]">
                <div className="flex justify-between"><span className="text-[var(--ink-mute)]">mode</span><span>graph</span></div>
                <div className="flex justify-between"><span className="text-[var(--ink-mute)]">resolution</span><span>{graphResult ? `${graphResult.size}×${graphResult.size}` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-[var(--ink-mute)]">stage</span><span>{stage}</span></div>
              </div>
            </div>
          </aside>
        </main>
      ) : (
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] xl:grid-cols-[380px_1fr_300px] gap-0">
        {/* LEFT */}
        <aside className="m-3 overflow-y-auto scrollbar-thin pr-1" style={{ maxHeight: "calc(100vh - 140px)" }}>
          {tab === "terrain" ? (
            <>
              <Section id="preset" title="01 · Preset" tag="curated" open>
                <PresetSelector selected={currentPreset} onSelect={handlePreset} />
              </Section>
              <Section id="generator" title="02 · Generator" tag="fbm + ridged" open>
                <GeneratorPanel
                  busy={busy} params={genParams} setParams={setGenParams}
                  hasData={!!genResult}
                  onGenerate={handleGenerate} onErode={handleErode}
                  onExportR16={exportCurrentR16} onExportPNG={exportCurrentPNG}
                />
              </Section>
              <Section id="combine" title="03 · Combine" tag="a ⊕ b">
                <CombinePanel
                  secondPreset={secondPreset} setSecondPreset={setSecondPreset}
                  secondSeed={secondSeed} setSecondSeed={setSecondSeed}
                  blendMode={blendMode} setBlendMode={setBlendMode}
                  blendAmount={blendAmount} setBlendAmount={setBlendAmount}
                  onCombine={handleCombine} busy={busy}
                  hasResult={!!combineResult} onUseAsBase={useCombinedAsBase}
                />
                {combineResult && (
                  <div className="num text-[10px] text-[var(--ink-dim)] mt-2">
                    result ready · {combineResult.size}×{combineResult.size}
                  </div>
                )}
              </Section>
              <Section id="biome" title="04 · Biomes" tag="splat rgba">
                <BiomePanel
                  params={biomeParams} setParams={setBiomeParams}
                  hasData={!!current} onExportSplatmap={exportSplatmap}
                />
              </Section>
              <Section id="vegetation" title="05 · Vegetation" tag="dot map">
                <VegetationPanel
                  layers={scatterLayers} setLayers={setScatterLayers}
                  onScatter={handleScatter}
                  scatterResults={scatterResults}
                  busy={busy}
                  onExportLayer={exportScatterLayer}
                  onExportCombined={exportScatterCombined}
                />
              </Section>
              <Section id="roads" title="06 · Roads" tag="spline">
                <RoadPanel
                  waypoints={waypoints} setWaypoints={setWaypoints}
                  roadParams={roadParams} setRoadParams={setRoadParams}
                  texturePreset={texturePreset} setTexturePreset={setTexturePreset}
                  customTexture={customTexture}
                  onUploadTexture={handleUploadTexture}
                  onClearTexture={() => { setCustomTexture(null); setTexturePreset("dirt"); }}
                  onRasterize={rasterizeAndShowRoad}
                  onExport={exportRoadMask}
                  hasRoad={!!roadOverlay}
                  busy={busy}
                />
                <button
                  className="btn-ghost w-full mt-2"
                  disabled={!genResult || waypoints.length < 2}
                  onClick={flattenRoadOntoHeightmap}
                  data-testid="road-flatten-heightmap"
                >
                  ↧ Flatten road onto heightmap
                </button>
              </Section>
              <Section id="brush" title="07 · Brush" tag="paint">
                <BrushPanel
                  params={brushParams} setParams={setBrushParams}
                  active={brushActive} setActive={setBrushActive}
                />
              </Section>
            </>
          ) : (
            <Section id="upscaler" title="01 · Upscaler" tag="bicubic + fractal" open>
              <UpscalerPanel
                busy={busy} source={upSource} params={upParams} setParams={setUpParams}
                hasData={!!upResult}
                onUpload={handleUpload} onUpscale={handleUpscale}
                onExportR16={exportCurrentR16} onExportPNG={exportCurrentPNG}
              />
            </Section>
          )}
        </aside>

        {/* CENTER VIEWER */}
        <section className="m-3 panel relative overflow-hidden" style={{ minHeight: 480 }}>
          {!current && !busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8" data-testid="empty-viewer">
              <div className="num text-[10px] text-[var(--ink-mute)] mb-3">[ empty viewport ]</div>
              <h2 className="text-3xl md:text-4xl mb-3 max-w-md leading-tight">
                Procedural <em className="text-[var(--accent)] not-italic">heightmaps</em>, native 4K, exported as <span className="num">.r16</span>.
              </h2>
              <p className="text-[var(--ink-dim)] text-sm max-w-md">
                Pick a preset or tweak the noise to start. Live preview is on — adjust sliders and watch the terrain shift in real time.
              </p>
            </div>
          )}
          {current && (
            <TerrainViewer3D
              data={current.data}
              size={current.size}
              heightScale={heightScale}
              wireframe={wireframe}
              biomeParams={biomeParams}
              roadOverlay={roadOverlay}
              scatterOverlay={scatterOverlayForViewer}
              previewSize={previewMeshSize}
              version={editVersion}
            />
          )}
          {busy && (
            <div className="absolute bottom-3 left-3 right-3 panel px-3 py-2 flex items-center gap-3" data-testid="busy-bar">
              <span className="num text-[10px] text-[var(--accent)]">●</span>
              <span className="num text-[11px] flex-1">{stage}</span>
              <div className="flex-1 h-[2px] bg-[var(--line-2)]">
                <div className="h-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="num text-[10px] text-[var(--ink-dim)]">{(progress * 100).toFixed(0)}%</span>
            </div>
          )}
          {previewData && !genResult && livePreview && tab === "terrain" && (
            <div className="absolute top-3 left-3 panel px-2 py-1 mono text-[10px] text-[var(--accent)]">
              ● LIVE PREVIEW · {PREVIEW_SIZE}×{PREVIEW_SIZE}
            </div>
          )}
        </section>

        {/* RIGHT: meta + minimap */}
        <aside className="hidden xl:flex flex-col gap-3 m-3" style={{ maxHeight: "calc(100vh - 140px)" }}>
          <div className="panel p-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="label-mono">// Top-Down</div>
              <span className="num text-[9px] text-[var(--ink-mute)]">click: add · shift: del</span>
            </div>
            <div className="aspect-square bg-[var(--bg-2)] border border-[var(--line)]">
              <MiniMap
                data={current?.data}
                size={current?.size}
                waypoints={waypoints}
                scatterLayers={scatterResults ? scatterLayers.filter((l) => scatterResults[l.id]).map((l) => ({ color: l.color, points: scatterResults[l.id] })) : []}
                roadOverlay={roadOverlay}
                onClick={current ? onMinimapClick : null}
                onDrag={brushActive ? onMinimapDrag : null}
                version={editVersion}
              />
            </div>
          </div>
          <div className="panel p-4 flex-1 overflow-y-auto scrollbar-thin">
            <div className="label-mono mb-3">// Stats</div>
            <div className="flex flex-col gap-2 num text-[11px]">
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">mode</span><span>{tab}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">preset</span><span>{currentPreset || "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">resolution</span><span data-testid="stat-resolution">{current ? `${current.size}×${current.size}` : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">samples</span><span>{current ? current.data.length.toLocaleString() : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">.r16 size</span><span>{current ? (current.data.length * 2 / 1024 / 1024).toFixed(1) + " MB" : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">water level</span><span>{biomeParams.waterLevel.toFixed(3)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">scatter total</span><span>{scatterResults ? Object.values(scatterResults).reduce((a, b) => a + b.length, 0).toLocaleString() : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">waypoints</span><span>{waypoints.length}</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-mute)]">precision</span><span>16-bit LE</span></div>
            </div>
          </div>
        </aside>
      </main>
      )}

      <footer className="border-t border-[var(--line)] px-6 py-3 flex items-center justify-between">
        <span className="num text-[10px] text-[var(--ink-mute)]">terra.forge · client-side · no data leaves your browser</span>
        <span className="num text-[10px] text-[var(--ink-mute)]">.r16 + splatmap + scatter dot maps · Unity / Unreal ready</span>
      </footer>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

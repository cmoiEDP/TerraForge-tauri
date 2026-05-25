import { Handle, Position } from "reactflow";
import { PRESETS } from "@/TerraForge/lib/presets";
import { BLEND_MODES } from "@/TerraForge/lib/combine";

// Compact slider primitive for nodes
function NSlider({ label, value, min, max, step, onChange, testId }) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5 nodrag">
      <div className="flex items-center justify-between">
        <span className="mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">{label}</span>
        <span className="num text-[9px] text-[var(--ink)]">{typeof value === "number" ? (step < 1 ? value.toFixed(3) : value) : value}</span>
      </div>
      <input
        type="range"
        className="slim nodrag"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={testId}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

const headerColors = {
  noise: "#d97644",
  shape: "#c9a76b",
  erode: "#6fb6a4",
  combine: "#9b7fb6",
  mask: "#b65f5f",
  water: "#4aa3d9",
  vegetation: "#7fb05c",
  output: "#5fb87a",
};

function NodeShell({ type, title, children, hasInputs = 0, hasOutput = true, selected }) {
  const handles = [];
  for (let i = 0; i < hasInputs; i++) {
    handles.push(
      <Handle
        key={`in-${i}`}
        type="target"
        position={Position.Left}
        id={`in-${i}`}
        style={{ top: 40 + i * 18, background: "#d97644", width: 10, height: 10, border: "2px solid #0b0d0e" }}
      />
    );
  }
  return (
    <div
      className="panel"
      style={{
        minWidth: 200,
        background: "var(--bg-1)",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--line)",
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--line)", background: "rgba(255,255,255,0.02)" }}
      >
        <span className="mono text-[10px] uppercase tracking-[0.16em]" style={{ color: headerColors[type] || "#fff" }}>
          ▣ {title}
        </span>
        <span className="num text-[9px] text-[var(--ink-mute)]">{type}</span>
      </div>
      <div className="px-3 py-2">{children}</div>
      {handles}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          style={{ top: 40, background: "#5fb87a", width: 10, height: 10, border: "2px solid #0b0d0e" }}
        />
      )}
    </div>
  );
}

const upd = (data, patch) => ({ ...data, params: { ...data.params, ...patch } });

export function NoiseNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="noise" title="Noise" hasInputs={0} selected={selected}>
      <NSlider testId={`node-${id}-seed`} label="Seed" value={p.seed} min={0} max={9999} step={1} onChange={(v) => data.onChange(upd(data, { seed: Math.round(v) }))} />
      <NSlider testId={`node-${id}-scale`} label="Scale" value={p.scale} min={0.0003} max={0.006} step={0.0001} onChange={(v) => data.onChange(upd(data, { scale: v }))} />
      <NSlider testId={`node-${id}-octaves`} label="Octaves" value={p.octaves} min={1} max={10} step={1} onChange={(v) => data.onChange(upd(data, { octaves: Math.round(v) }))} />
      <NSlider testId={`node-${id}-persist`} label="Persist" value={p.persistence} min={0.1} max={0.9} step={0.01} onChange={(v) => data.onChange(upd(data, { persistence: v }))} />
      <NSlider testId={`node-${id}-ridge`} label="Ridge" value={p.ridgeBlend} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { ridgeBlend: v }))} />
      <NSlider testId={`node-${id}-warp`} label="Warp" value={p.warp} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { warp: v }))} />
      <NSlider testId={`node-${id}-exp`} label="Exponent" value={p.exponent} min={0.5} max={3.0} step={0.05} onChange={(v) => data.onChange(upd(data, { exponent: v }))} />
      <label className="flex items-center gap-1.5 mt-1 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.useGPU} onChange={(e) => data.onChange(upd(data, { useGPU: e.target.checked }))} data-testid={`node-${id}-gpu`} />
        <span className="mono text-[9px] uppercase tracking-wider text-[var(--accent)]">WebGPU</span>
      </label>
    </NodeShell>
  );
}

export function ShapeNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="shape" title="Shape" hasInputs={1} selected={selected}>
      <div className="py-1">
        <span className="mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">Preset Shape</span>
        <select
          className="select-mono mt-1 nodrag"
          value={p.presetId}
          onChange={(e) => data.onChange(upd(data, { presetId: e.target.value }))}
          onMouseDown={(e) => e.stopPropagation()}
          data-testid={`node-${id}-preset`}
        >
          {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
        </select>
      </div>
    </NodeShell>
  );
}

export function ErodeNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="erode" title="Erode" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-iter`} label="Iterations" value={p.iterations} min={5000} max={200000} step={1000} onChange={(v) => data.onChange(upd(data, { iterations: Math.round(v) }))} />
      <NSlider testId={`node-${id}-erosion`} label="Erosion" value={p.erosion} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { erosion: v }))} />
      <NSlider testId={`node-${id}-deposit`} label="Deposit" value={p.deposition} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { deposition: v }))} />
      <NSlider testId={`node-${id}-inertia`} label="Inertia" value={p.inertia} min={0} max={0.5} step={0.01} onChange={(v) => data.onChange(upd(data, { inertia: v }))} />
    </NodeShell>
  );
}

export function CombineNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="combine" title="Combine" hasInputs={2} selected={selected}>
      <div className="py-1">
        <span className="mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">Mode</span>
        <select
          className="select-mono mt-1 nodrag"
          value={p.mode}
          onChange={(e) => data.onChange(upd(data, { mode: e.target.value }))}
          onMouseDown={(e) => e.stopPropagation()}
          data-testid={`node-${id}-mode`}
        >
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <NSlider testId={`node-${id}-blend`} label="Blend" value={p.blend} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { blend: v }))} />
    </NodeShell>
  );
}

export function MaskNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="mask" title="Mask" hasInputs={2} selected={selected}>
      <p className="mono text-[9px] text-[var(--ink-mute)] leading-relaxed">in1 × in2 (use second as mask)</p>
      <label className="flex items-center gap-1.5 mt-1 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.invert} onChange={(e) => data.onChange(upd(data, { invert: e.target.checked }))} data-testid={`node-${id}-invert`} />
        <span className="mono text-[9px] uppercase tracking-wider">Invert</span>
      </label>
    </NodeShell>
  );
}

export function OutputNode({ data, selected }) {
  return (
    <NodeShell type="output" title="Output" hasInputs={1} hasOutput={false} selected={selected}>
      <p className="mono text-[9px] text-[var(--accent)] leading-relaxed">★ terminal · final result</p>
    </NodeShell>
  );
}

// ─── Filter nodes ───
export function BlurNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="combine" title="Blur" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-radius`} label="Radius" value={p.radius} min={1} max={12} step={1} onChange={(v) => data.onChange(upd(data, { radius: Math.round(v) }))} />
      <NSlider testId={`node-${id}-passes`} label="Passes" value={p.passes} min={1} max={5} step={1} onChange={(v) => data.onChange(upd(data, { passes: Math.round(v) }))} />
    </NodeShell>
  );
}

export function TerraceNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="shape" title="Terrace" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-steps`} label="Steps" value={p.steps} min={2} max={32} step={1} onChange={(v) => data.onChange(upd(data, { steps: Math.round(v) }))} />
      <NSlider testId={`node-${id}-sharpness`} label="Sharpness" value={p.sharpness} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { sharpness: v }))} />
    </NodeShell>
  );
}

export function CurveNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="combine" title="Curve" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-gamma`} label="Gamma" value={p.gamma} min={0.2} max={3.0} step={0.05} onChange={(v) => data.onChange(upd(data, { gamma: v }))} />
      <NSlider testId={`node-${id}-gain`} label="Gain" value={p.gain} min={0.1} max={2.0} step={0.02} onChange={(v) => data.onChange(upd(data, { gain: v }))} />
      <NSlider testId={`node-${id}-bias`} label="Bias" value={p.bias} min={-0.5} max={0.5} step={0.01} onChange={(v) => data.onChange(upd(data, { bias: v }))} />
    </NodeShell>
  );
}

export function ClipNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="mask" title="Clip" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-min`} label="Min" value={p.min} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { min: v }))} />
      <NSlider testId={`node-${id}-max`} label="Max" value={p.max} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { max: v }))} />
    </NodeShell>
  );
}

export function NormalizeNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="combine" title="Normalize" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-lo`} label="Lo" value={p.lo} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { lo: v }))} />
      <NSlider testId={`node-${id}-hi`} label="Hi" value={p.hi} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { hi: v }))} />
    </NodeShell>
  );
}

export function WarpNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="noise" title="Warp" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-amount`} label="Amount" value={p.amount} min={0} max={0.2} step={0.005} onChange={(v) => data.onChange(upd(data, { amount: v }))} />
      <NSlider testId={`node-${id}-freq`} label="Frequency" value={p.frequency} min={0.001} max={0.05} step={0.001} onChange={(v) => data.onChange(upd(data, { frequency: v }))} />
      <NSlider testId={`node-${id}-warpseed`} label="Seed" value={p.seed} min={0} max={9999} step={1} onChange={(v) => data.onChange(upd(data, { seed: Math.round(v) }))} />
    </NodeShell>
  );
}

// ─── Water simulation nodes ───

export function RiverNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="water" title="River" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-threshold`} label="Flow Thresh" value={p.threshold} min={10} max={500} step={5} onChange={(v) => data.onChange(upd(data, { threshold: Math.round(v) }))} />
      <NSlider testId={`node-${id}-depth`} label="Carve Depth" value={p.depth} min={0} max={0.2} step={0.005} onChange={(v) => data.onChange(upd(data, { depth: v }))} />
      <NSlider testId={`node-${id}-width`} label="Width" value={p.width} min={1} max={6} step={1} onChange={(v) => data.onChange(upd(data, { width: Math.round(v) }))} />
    </NodeShell>
  );
}

export function LakeNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="water" title="Lake" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-fillDepth`} label="Fill Depth" value={p.fillDepth} min={0.005} max={0.15} step={0.005} onChange={(v) => data.onChange(upd(data, { fillDepth: v }))} />
      <NSlider testId={`node-${id}-minArea`} label="Min Area" value={p.minArea} min={4} max={200} step={1} onChange={(v) => data.onChange(upd(data, { minArea: Math.round(v) }))} />
      <NSlider testId={`node-${id}-lkdepth`} label="Carve" value={p.depth} min={0} max={0.1} step={0.005} onChange={(v) => data.onChange(upd(data, { depth: v }))} />
    </NodeShell>
  );
}

export function SeaNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="water" title="Sea" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-level`} label="Sea Level" value={p.level} min={0} max={0.6} step={0.01} onChange={(v) => data.onChange(upd(data, { level: v }))} />
      <label className="flex items-center gap-1.5 mt-1 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.flatten} onChange={(e) => data.onChange(upd(data, { flatten: e.target.checked }))} data-testid={`node-${id}-flatten`} />
        <span className="mono text-[9px] uppercase tracking-wider">Flatten Below</span>
      </label>
    </NodeShell>
  );
}

export function RainNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="water" title="Rain" hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-intensity`} label="Intensity" value={p.intensity} min={0} max={3} step={0.05} onChange={(v) => data.onChange(upd(data, { intensity: v }))} />
      <NSlider testId={`node-${id}-erodew`} label="Erode Weight" value={p.erodeWeight} min={0} max={0.1} step={0.002} onChange={(v) => data.onChange(upd(data, { erodeWeight: v }))} />
    </NodeShell>
  );
}

// ─── Vegetation scatter nodes ───
function VegNode({ data, selected, id, title }) {
  const p = data.params;
  return (
    <NodeShell type="vegetation" title={title} hasInputs={1} selected={selected}>
      <NSlider testId={`node-${id}-density`} label="Density" value={p.density} min={0.05} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { density: v }))} />
      <NSlider testId={`node-${id}-minh`} label="Min Height" value={p.minHeight} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { minHeight: v }))} />
      <NSlider testId={`node-${id}-maxh`} label="Max Height" value={p.maxHeight} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { maxHeight: v }))} />
      <NSlider testId={`node-${id}-maxs`} label="Max Slope" value={p.maxSlope} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { maxSlope: v }))} />
      <NSlider testId={`node-${id}-spacing`} label="Spacing" value={p.minSpacing} min={1} max={32} step={1} onChange={(v) => data.onChange(upd(data, { minSpacing: Math.round(v) }))} />
      <NSlider testId={`node-${id}-dotSize`} label="Dot Size" value={p.dotSize} min={0} max={5} step={1} onChange={(v) => data.onChange(upd(data, { dotSize: Math.round(v) }))} />
    </NodeShell>
  );
}
export const TreesNode  = (props) => <VegNode {...props} title="Trees" />;
export const BushesNode = (props) => <VegNode {...props} title="Bushes" />;
export const RocksNode  = (props) => <VegNode {...props} title="Rocks" />;

// ─── Rule-based GeoTerrain (tectonic + hydrology) ───
export function GeoTerrainNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="noise" title="GeoTerrain" hasInputs={0} selected={selected}>
      <p className="mono text-[9px] text-[var(--ink-dim)] leading-tight mb-1">plates → faults → rivers · scales with size</p>
      <NSlider testId={`node-${id}-geoseed`} label="Seed" value={p.seed} min={0} max={99999} step={1} onChange={(v) => data.onChange(upd(data, { seed: Math.round(v) }))} />
      <NSlider testId={`node-${id}-plates`} label="Plates (0=auto)" value={p.plateCount} min={0} max={120} step={1} onChange={(v) => data.onChange(upd(data, { plateCount: Math.round(v) }))} />
      <NSlider testId={`node-${id}-cbias`} label="Continent Bias" value={p.continentBias} min={0} max={1} step={0.01} onChange={(v) => data.onChange(upd(data, { continentBias: v }))} />
      <NSlider testId={`node-${id}-sharp`} label="Mountain Sharp" value={p.mountainSharpness} min={0.5} max={4} step={0.05} onChange={(v) => data.onChange(upd(data, { mountainSharpness: v }))} />
      <NSlider testId={`node-${id}-damp`} label="Detail Amount" value={p.detailAmplitude} min={0} max={0.5} step={0.01} onChange={(v) => data.onChange(upd(data, { detailAmplitude: v }))} />
      <NSlider testId={`node-${id}-rcarve`} label="River Carve" value={p.riverCarveDepth} min={0} max={0.2} step={0.005} onChange={(v) => data.onChange(upd(data, { riverCarveDepth: v }))} />
      <NSlider testId={`node-${id}-rwidth`} label="River Width" value={p.riverWidth} min={1} max={10} step={1} onChange={(v) => data.onChange(upd(data, { riverWidth: Math.round(v) }))} />
    </NodeShell>
  );
}

// ─── WaterMask (classification: rose=sea, blue=lake, cyan=river) ───
export function WaterMaskNode({ data, selected, id }) {
  const p = data.params;
  return (
    <NodeShell type="water" title="WaterMask" hasInputs={1} selected={selected}>
      <p className="mono text-[9px] text-[var(--ink-dim)] leading-tight mb-1">rose=sea · blue=lake · cyan=river</p>
      <NSlider testId={`node-${id}-wmsea`} label="Sea Level" value={p.seaLevel} min={0} max={0.6} step={0.01} onChange={(v) => data.onChange(upd(data, { seaLevel: v }))} />
      <NSlider testId={`node-${id}-wmlake`} label="Lake Fill" value={p.lakeFill} min={0.005} max={0.15} step={0.005} onChange={(v) => data.onChange(upd(data, { lakeFill: v }))} />
      <NSlider testId={`node-${id}-wmriver`} label="River Thresh" value={p.riverThreshold} min={10} max={500} step={5} onChange={(v) => data.onChange(upd(data, { riverThreshold: Math.round(v) }))} />
      <label className="flex items-center gap-1.5 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.enableSea}   onChange={(e) => data.onChange(upd(data, { enableSea:   e.target.checked }))} data-testid={`node-${id}-en-sea`} />
        <span className="mono text-[9px]">Sea</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.enableLake}  onChange={(e) => data.onChange(upd(data, { enableLake:  e.target.checked }))} data-testid={`node-${id}-en-lake`} />
        <span className="mono text-[9px]">Lake</span>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer nodrag" onMouseDown={(e) => e.stopPropagation()}>
        <input type="checkbox" className="nodrag" checked={p.enableRiver} onChange={(e) => data.onChange(upd(data, { enableRiver: e.target.checked }))} data-testid={`node-${id}-en-river`} />
        <span className="mono text-[9px]">River</span>
      </label>
    </NodeShell>
  );
}

export const NODE_COMPONENTS = {
  noise: NoiseNode,
  shape: ShapeNode,
  erode: ErodeNode,
  combine: CombineNode,
  mask: MaskNode,
  blur: BlurNode,
  terrace: TerraceNode,
  curve: CurveNode,
  clip: ClipNode,
  normalize: NormalizeNode,
  warp: WarpNode,
  river: RiverNode,
  lake: LakeNode,
  sea: SeaNode,
  rain: RainNode,
  geoterrain: GeoTerrainNode,
  watermask: WaterMaskNode,
  trees: TreesNode,
  bushes: BushesNode,
  rocks: RocksNode,
  output: OutputNode,
};

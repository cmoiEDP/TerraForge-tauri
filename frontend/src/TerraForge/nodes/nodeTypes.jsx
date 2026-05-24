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

export const NODE_COMPONENTS = {
  noise: NoiseNode,
  shape: ShapeNode,
  erode: ErodeNode,
  combine: CombineNode,
  mask: MaskNode,
  output: OutputNode,
};

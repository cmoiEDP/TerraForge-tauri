import Slider2 from "@/TerraForge/components/Slider2";

export default function VegetationPanel({ layers, setLayers, onScatter, onExportLayer, onExportCombined, busy, scatterResults }) {
  const updateLayer = (idx, patch) => {
    const next = layers.map((l, i) => (i === idx ? { ...l, ...patch } : l));
    setLayers(next);
  };
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Vegetation Scatter</h2>
          <span className="tag tag-accent">dot maps</span>
        </div>
        <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed mb-3 mono">
          One white dot = one instance. Import these masks into Unity Terrain Tools<br/>
          or use them as scatter masks in your shader for placement.
        </p>
      </div>

      {layers.map((layer, idx) => (
        <details key={layer.id} className="border border-[var(--line)] open:border-[var(--line-2)]" open={layer.enabled}>
          <summary
            className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
            data-testid={`veg-toggle-${layer.id}`}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={layer.enabled}
                onChange={(e) => updateLayer(idx, { enabled: e.target.checked })}
                onClick={(e) => e.stopPropagation()}
                data-testid={`veg-enable-${layer.id}`}
              />
              <span className="inline-block w-2 h-2" style={{ background: layer.color }} />
              <span className="mono text-[11px] uppercase tracking-wider">{layer.name}</span>
            </div>
            <span className="num text-[10px] text-[var(--ink-mute)]">
              {scatterResults?.[layer.id] ? `${scatterResults[layer.id].length.toLocaleString()} pts` : "—"}
            </span>
          </summary>

          <div className="px-3 pb-3 pt-1">
            <Slider2 testId={`veg-${layer.id}-density`} label="Density" value={layer.density} min={0.05} max={1.0} step={0.01} onChange={(v) => updateLayer(idx, { density: v })} />
            <Slider2 testId={`veg-${layer.id}-spacing`} label="Min Spacing (px)" value={layer.minSpacing} min={1} max={20} step={1} onChange={(v) => updateLayer(idx, { minSpacing: Math.round(v) })} />
            <Slider2 testId={`veg-${layer.id}-minh`} label="Min Height" value={layer.minHeight} min={0} max={1} step={0.005} onChange={(v) => updateLayer(idx, { minHeight: v })} />
            <Slider2 testId={`veg-${layer.id}-maxh`} label="Max Height" value={layer.maxHeight} min={0} max={1} step={0.005} onChange={(v) => updateLayer(idx, { maxHeight: v })} />
            <Slider2 testId={`veg-${layer.id}-slope`} label="Max Slope" value={layer.maxSlope} min={0} max={1.5} step={0.01} onChange={(v) => updateLayer(idx, { maxSlope: v })} />
            <Slider2 testId={`veg-${layer.id}-avoidw`} label="Avoid Water Margin" value={layer.avoidWater} min={0} max={0.15} step={0.001} onChange={(v) => updateLayer(idx, { avoidWater: v })} />
            <Slider2 testId={`veg-${layer.id}-jitter`} label="Jitter" value={layer.jitter} min={0} max={1.2} step={0.01} onChange={(v) => updateLayer(idx, { jitter: v })} />
            <Slider2 testId={`veg-${layer.id}-seed`} label="Seed" value={layer.seed} min={0} max={9999} step={1} onChange={(v) => updateLayer(idx, { seed: Math.round(v) })} />
            <button
              className="btn-ghost w-full mt-2"
              disabled={!scatterResults?.[layer.id]}
              onClick={() => onExportLayer(layer)}
              data-testid={`veg-export-${layer.id}`}
            >
              ⤓ Export {layer.name} Dot Map
            </button>
          </div>
        </details>
      ))}

      <div className="flex flex-col gap-2">
        <button className="btn-primary w-full" disabled={busy} onClick={onScatter} data-testid="veg-scatter-btn">
          {busy ? "Scattering…" : "Run Scatter"}
        </button>
        <button className="btn-ghost w-full" disabled={!scatterResults} onClick={onExportCombined} data-testid="veg-export-combined">
          ⤓ Export Combined Color Map
        </button>
      </div>
    </div>
  );
}

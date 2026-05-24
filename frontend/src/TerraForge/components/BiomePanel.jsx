import Slider2 from "@/TerraForge/components/Slider2";

export default function BiomePanel({ params, setParams, onExportSplatmap, hasData }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Biomes &amp; Water</h2>
          <span className="tag">splat RGBA</span>
        </div>
        <Slider2 testId="bio-water" label="Water Level" value={params.waterLevel} min={0} max={0.6} step={0.005} onChange={(v) => setParams({ ...params, waterLevel: v })} />
        <Slider2 testId="bio-sand" label="Sand Width" value={params.sandWidth} min={0} max={0.30} step={0.005} onChange={(v) => setParams({ ...params, sandWidth: v })} />
        <Slider2 testId="bio-grass" label="Grass Max" value={params.grassMax} min={0.2} max={0.95} step={0.01} onChange={(v) => setParams({ ...params, grassMax: v })} />
        <Slider2 testId="bio-rock" label="Rock Max" value={params.rockMax} min={0.4} max={1.0} step={0.01} onChange={(v) => setParams({ ...params, rockMax: v })} />
        <Slider2 testId="bio-slope" label="Slope Bias (rock)" value={params.slopeBias} min={0} max={1.5} step={0.01} onChange={(v) => setParams({ ...params, slopeBias: v })} />
        <Slider2 testId="bio-soft" label="Blend Softness" value={params.blendSoftness} min={0.005} max={0.15} step={0.005} onChange={(v) => setParams({ ...params, blendSoftness: v })} />
      </section>

      <div className="border border-[var(--line)] p-3 mono text-[10px] text-[var(--ink-dim)] leading-relaxed">
        Channels:
        <div className="grid grid-cols-2 gap-y-1 mt-2">
          <span><span className="inline-block w-2 h-2 mr-1.5" style={{ background: "#c9a76b" }} />R · Sand</span>
          <span><span className="inline-block w-2 h-2 mr-1.5" style={{ background: "#5a7c3a" }} />G · Grass</span>
          <span><span className="inline-block w-2 h-2 mr-1.5" style={{ background: "#6b6058" }} />B · Rock</span>
          <span><span className="inline-block w-2 h-2 mr-1.5" style={{ background: "#f0f0f4" }} />A · Snow</span>
        </div>
      </div>

      {hasData && (
        <button className="btn-primary w-full" onClick={onExportSplatmap} data-testid="bio-export-splat">
          ⤓ Export Splatmap (RGBA PNG)
        </button>
      )}
    </div>
  );
}

import Slider2 from "@/TerraForge/components/Slider2";
import { PRESETS } from "@/TerraForge/lib/presets";
import { BLEND_MODES } from "@/TerraForge/lib/combine";

export default function CombinePanel({
  secondPreset, setSecondPreset,
  secondSeed, setSecondSeed,
  blendMode, setBlendMode,
  blendAmount, setBlendAmount,
  onCombine, busy, hasResult,
  onUseAsBase,
}) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Combine</h2>
          <span className="tag tag-accent">a ⊕ b</span>
        </div>
        <p className="text-[10px] text-[var(--ink-dim)] mono leading-relaxed mb-2">
          Generate a second heightmap (different preset / seed) and blend it with the current one.
        </p>
      </section>

      <section>
        <div className="label-mono mb-2">// Second Layer</div>
        <select
          className="select-mono mb-2"
          value={secondPreset}
          onChange={(e) => setSecondPreset(e.target.value)}
          data-testid="combine-second-preset"
        >
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Slider2 testId="combine-second-seed" label="Second Seed" value={secondSeed} min={0} max={9999} step={1} onChange={(v) => setSecondSeed(Math.round(v))} />
      </section>

      <section>
        <div className="label-mono mb-2">// Blend</div>
        <select
          className="select-mono mb-2"
          value={blendMode}
          onChange={(e) => setBlendMode(e.target.value)}
          data-testid="combine-mode"
        >
          {BLEND_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Slider2 testId="combine-amount" label="Blend Amount" value={blendAmount} min={0} max={1} step={0.01} onChange={setBlendAmount} />
      </section>

      <button className="btn-primary w-full" disabled={busy} onClick={onCombine} data-testid="combine-run">
        {busy ? "Combining…" : "Combine →"}
      </button>
      {hasResult && (
        <button className="btn-ghost w-full" onClick={onUseAsBase} data-testid="combine-use-as-base">
          ↺ Use Result as Base
        </button>
      )}
    </div>
  );
}

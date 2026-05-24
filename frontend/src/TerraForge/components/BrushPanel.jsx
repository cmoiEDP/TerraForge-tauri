import Slider2 from "@/TerraForge/components/Slider2";

const MODES = [
  { id: "raise", label: "Raise" },
  { id: "lower", label: "Lower" },
  { id: "flatten", label: "Flatten" },
  { id: "smooth", label: "Smooth" },
];

export default function BrushPanel({ params, setParams, active, setActive }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Brush</h2>
          <span className="tag tag-accent">edit heightmap</span>
        </div>
        <p className="text-[10px] text-[var(--ink-dim)] mono leading-relaxed mb-2">
          Click + drag on the minimap to paint. The 3D preview updates live during the stroke.
        </p>
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            data-testid="brush-active"
          />
          <span className="label-mono">brush mode {active ? "ON" : "OFF"}</span>
        </label>
      </section>

      <section>
        <div className="label-mono mb-2">// Mode</div>
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`text-left px-2.5 py-1.5 border transition-colors ${
                params.mode === m.id
                  ? "border-[var(--accent)] bg-[var(--bg-2)]"
                  : "border-[var(--line)] hover:border-[var(--line-2)]"
              }`}
              onClick={() => setParams({ ...params, mode: m.id })}
              data-testid={`brush-mode-${m.id}`}
            >
              <span className="mono text-[10px] uppercase tracking-wider">{m.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <Slider2 testId="brush-radius" label="Radius (px)" value={params.radius} min={4} max={80} step={1} onChange={(v) => setParams({ ...params, radius: Math.round(v) })} />
        <Slider2 testId="brush-strength" label="Strength" value={params.strength} min={0.005} max={0.5} step={0.005} onChange={(v) => setParams({ ...params, strength: v })} />
        {params.mode === "flatten" && (
          <Slider2 testId="brush-target" label="Target Height" value={params.targetHeight} min={0} max={1} step={0.005} onChange={(v) => setParams({ ...params, targetHeight: v })} />
        )}
      </section>
    </div>
  );
}

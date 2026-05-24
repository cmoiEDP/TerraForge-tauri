import { PRESETS } from "@/TerraForge/lib/presets";

export default function PresetSelector({ selected, onSelect }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="label-mono">// Preset</h2>
        <span className="tag tag-accent">curated</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            data-testid={`preset-${p.id}`}
            className={`text-left px-3 py-2 border transition-colors ${
              selected === p.id
                ? "border-[var(--accent)] bg-[var(--bg-2)]"
                : "border-[var(--line)] hover:border-[var(--line-2)]"
            }`}
          >
            <div className="mono text-[11px] text-[var(--ink)]">{p.name}</div>
            <div className="mono text-[9px] text-[var(--ink-mute)] mt-0.5 uppercase tracking-wider">{p.tag}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

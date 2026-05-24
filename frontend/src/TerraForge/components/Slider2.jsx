export default function Slider2({ label, value, min, max, step, onChange, suffix = "", testId }) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <span className="num text-[11px] text-[var(--ink)]" data-testid={`${testId}-value`}>
          {typeof value === "number" ? value.toFixed(step < 1 ? 3 : 0) : value}{suffix}
        </span>
      </div>
      <input
        type="range"
        className="slim"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={testId}
      />
    </div>
  );
}

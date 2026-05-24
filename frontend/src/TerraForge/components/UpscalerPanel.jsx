import { useRef, useState } from "react";
import Slider2 from "@/TerraForge/components/Slider2";

export default function UpscalerPanel({ source, onUpload, onUpscale, busy, params, setParams, hasData, onExportR16, onExportPNG }) {
  const inputRef = useRef(null);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Source</h2>
          <span className="tag tag-accent">.png · .jpg · .r16</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.tif,.tiff,.r16,.raw,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
          data-testid="up-file-input"
        />
        <button
          className="btn-ghost w-full"
          onClick={() => inputRef.current?.click()}
          data-testid="up-upload-button"
        >
          {source ? `↑ ${source.name} (${source.size}×${source.size})` : "↑ Upload heightmap (any res)"}
        </button>
        {source && (
          <p className="num text-[10px] text-[var(--ink-mute)] mt-2">
            source loaded · {source.size}×{source.size} px · {(source.data.length * 4 / 1024 / 1024).toFixed(1)} MB float32
          </p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Detail Synthesis</h2>
          <span className="tag">bicubic + fractal</span>
        </div>
        <div className="flex flex-col">
          <Slider2 testId="up-detail-strength" label="Detail Strength" value={params.detailStrength} min={0} max={0.5} step={0.005} onChange={(v) => setParams({ ...params, detailStrength: v })} />
          <Slider2 testId="up-detail-octaves" label="Detail Octaves" value={params.detailOctaves} min={1} max={8} step={1} onChange={(v) => setParams({ ...params, detailOctaves: Math.round(v) })} />
          <Slider2 testId="up-detail-scale" label="Detail Frequency" value={params.detailScale} min={0.001} max={0.08} step={0.001} onChange={(v) => setParams({ ...params, detailScale: v })} />
          <Slider2 testId="up-detail-seed" label="Detail Seed" value={params.seed} min={0} max={9999} step={1} onChange={(v) => setParams({ ...params, seed: Math.round(v) })} />

          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={params.preserveRidges}
              onChange={(e) => setParams({ ...params, preserveRidges: e.target.checked })}
              data-testid="up-preserve-ridges"
            />
            <span className="label-mono">Edge-aware (preserve ridges)</span>
          </label>
        </div>
      </section>

      <section>
        <div className="label-mono mb-2">// Target Resolution</div>
        <select
          className="select-mono mb-3"
          value={params.targetSize}
          onChange={(e) => setParams({ ...params, targetSize: parseInt(e.target.value, 10) })}
          data-testid="up-target-select"
        >
          <option value={1024}>1024  ·  1K</option>
          <option value={2048}>2048  ·  2K</option>
          <option value={4096}>4096  ·  4K — TARGET</option>
          <option value={8192}>8192  ·  8K</option>
        </select>

        <button
          className="btn-primary w-full"
          disabled={busy || !source}
          onClick={onUpscale}
          data-testid="up-upscale-button"
        >
          {busy ? "Upscaling…" : "Upscale →  " + params.targetSize + "×" + params.targetSize}
        </button>
      </section>

      {hasData && (
        <section>
          <div className="label-mono mb-2">// Export</div>
          <div className="flex flex-col gap-2">
            <button className="btn-primary w-full" onClick={onExportR16} data-testid="up-export-r16">
              ⤓ Export .r16 (16-bit RAW)
            </button>
            <button className="btn-ghost w-full" onClick={onExportPNG} data-testid="up-export-png">
              ⤓ Export Preview PNG
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

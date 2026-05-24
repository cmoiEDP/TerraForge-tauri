import { useState } from "react";
import Slider2 from "@/TerraForge/components/Slider2";

export default function GeneratorPanel({ onGenerate, onErode, busy, params, setParams, hasData, onExportR16, onExportPNG }) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Noise Synthesis</h2>
          <span className="tag tag-accent">fbm + ridged</span>
        </div>
        <div className="flex flex-col">
          <Slider2 testId="gen-seed" label="Seed" value={params.seed} min={0} max={99999} step={1} onChange={(v) => setParams({ ...params, seed: Math.round(v) })} />
          <Slider2 testId="gen-scale" label="Scale" value={params.scale} min={0.0003} max={0.006} step={0.0001} onChange={(v) => setParams({ ...params, scale: v })} />
          <Slider2 testId="gen-octaves" label="Octaves" value={params.octaves} min={1} max={10} step={1} onChange={(v) => setParams({ ...params, octaves: Math.round(v) })} />
          <Slider2 testId="gen-persistence" label="Persistence" value={params.persistence} min={0.1} max={0.9} step={0.01} onChange={(v) => setParams({ ...params, persistence: v })} />
          <Slider2 testId="gen-ridge" label="Ridge Blend" value={params.ridgeBlend} min={0} max={1} step={0.01} onChange={(v) => setParams({ ...params, ridgeBlend: v })} />
          <Slider2 testId="gen-warp" label="Domain Warp" value={params.warp} min={0} max={1} step={0.01} onChange={(v) => setParams({ ...params, warp: v })} />
          <Slider2 testId="gen-exponent" label="Exponent (relief)" value={params.exponent} min={0.5} max={3.0} step={0.05} onChange={(v) => setParams({ ...params, exponent: v })} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Hydraulic Erosion</h2>
          <span className="tag">particle</span>
        </div>
        <div className="flex flex-col">
          <Slider2 testId="ero-iter" label="Iterations" value={params.iterations} min={5000} max={200000} step={1000} onChange={(v) => setParams({ ...params, iterations: Math.round(v) })} />
          <Slider2 testId="ero-erosion" label="Erosion Rate" value={params.erosion} min={0} max={1} step={0.01} onChange={(v) => setParams({ ...params, erosion: v })} />
          <Slider2 testId="ero-deposit" label="Deposition" value={params.deposition} min={0} max={1} step={0.01} onChange={(v) => setParams({ ...params, deposition: v })} />
          <Slider2 testId="ero-inertia" label="Inertia" value={params.inertia} min={0} max={0.5} step={0.01} onChange={(v) => setParams({ ...params, inertia: v })} />
        </div>
      </section>

      <section>
        <div className="label-mono mb-2">// Output</div>
        <select
          className="select-mono mb-3"
          value={params.size}
          onChange={(e) => setParams({ ...params, size: parseInt(e.target.value, 10) })}
          data-testid="gen-size-select"
        >
          <option value={512}>0512  ·  test</option>
          <option value={1024}>1024  ·  1K</option>
          <option value={2048}>2048  ·  2K</option>
          <option value={4096}>4096  ·  4K — TARGET</option>
        </select>

        <div className="flex flex-col gap-2">
          <button
            className="btn-primary w-full"
            disabled={busy}
            onClick={onGenerate}
            data-testid="gen-button"
          >
            {busy ? "Synthesizing…" : "Synthesize Terrain"}
          </button>
          <button
            className="btn-ghost w-full"
            disabled={busy || !hasData}
            onClick={onErode}
            data-testid="gen-erode-button"
          >
            Apply Erosion
          </button>
        </div>
      </section>

      {hasData && (
        <section>
          <div className="label-mono mb-2">// Export</div>
          <div className="flex flex-col gap-2">
            <button className="btn-primary w-full" onClick={onExportR16} data-testid="gen-export-r16">
              ⤓ Export .r16 (16-bit RAW)
            </button>
            <button className="btn-ghost w-full" onClick={onExportPNG} data-testid="gen-export-png">
              ⤓ Export Preview PNG
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

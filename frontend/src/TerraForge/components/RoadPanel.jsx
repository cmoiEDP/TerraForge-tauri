import { useRef } from "react";
import Slider2 from "@/TerraForge/components/Slider2";

const PRESET_TEXTURES = ["asphalt", "dirt", "gravel", "cobble"];

export default function RoadPanel({
  waypoints, setWaypoints,
  roadParams, setRoadParams,
  texturePreset, setTexturePreset,
  customTexture, onUploadTexture, onClearTexture,
  onRasterize, onExport, hasRoad, busy,
}) {
  const inputRef = useRef(null);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="label-mono">// Roads</h2>
          <span className="tag tag-accent">spline · rgba mask</span>
        </div>
        <p className="text-[10px] text-[var(--ink-dim)] leading-relaxed mb-2 mono">
          Click the top-down minimap on the right to add waypoints.<br/>
          Shift+click to remove the nearest. The road follows a Catmull-Rom spline.
        </p>
        <div className="num text-[10px] text-[var(--ink)]" data-testid="road-waypoint-count">
          waypoints · {waypoints.length}
        </div>
        <button
          className="btn-ghost w-full mt-2"
          onClick={() => setWaypoints([])}
          disabled={waypoints.length === 0}
          data-testid="road-clear-waypoints"
        >
          Clear Waypoints
        </button>
      </section>

      <section>
        <div className="label-mono mb-2">// Geometry</div>
        <Slider2 testId="road-width" label="Width (px)" value={roadParams.width} min={2} max={64} step={1} onChange={(v) => setRoadParams({ ...roadParams, width: Math.round(v) })} />
        <Slider2 testId="road-falloff" label="Falloff (px)" value={roadParams.falloff} min={0} max={40} step={1} onChange={(v) => setRoadParams({ ...roadParams, falloff: Math.round(v) })} />
      </section>

      <section>
        <div className="label-mono mb-2">// Texture</div>
        <select
          className="select-mono mb-2"
          value={texturePreset}
          onChange={(e) => setTexturePreset(e.target.value)}
          data-testid="road-texture-preset"
        >
          {PRESET_TEXTURES.map((t) => <option key={t} value={t}>{t}</option>)}
          <option value="custom">custom · uploaded</option>
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadTexture(f);
          }}
          data-testid="road-texture-upload"
        />
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => inputRef.current?.click()} data-testid="road-texture-upload-btn">
            {customTexture ? `↑ ${customTexture.name}` : "↑ Upload texture"}
          </button>
          {customTexture && (
            <button className="btn-ghost" onClick={onClearTexture} data-testid="road-texture-clear">×</button>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button className="btn-primary w-full" disabled={waypoints.length < 2 || busy} onClick={onRasterize} data-testid="road-rasterize">
          {busy ? "Rasterizing…" : "Rasterize Road"}
        </button>
        {hasRoad && (
          <button className="btn-primary w-full" onClick={onExport} data-testid="road-export">
            ⤓ Export Road Mask (RGBA PNG)
          </button>
        )}
      </div>
    </div>
  );
}

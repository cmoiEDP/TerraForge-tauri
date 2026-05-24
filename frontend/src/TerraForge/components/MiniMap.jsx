import { useEffect, useRef } from "react";

// Interactive top-down view. Can render heightmap, optional road overlay, scatter dot overlay.
// onClick(normX, normY, shift) and onMove(normX, normY).
export default function MiniMap({
  data, size,
  waypoints = [],
  scatterLayers = [],     // [{color, points: [[x,y]]}]
  roadOverlay = null,     // { data, size }
  onClick = null,
  onMove = null,
  onDrag = null,          // continuous drag callback (nx, ny)
  targetPx = 280,
  version = 0,            // bump on in-place heightmap mutations
}) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  // base heightmap drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = targetPx;
    canvas.height = targetPx;
    const ctx = canvas.getContext("2d");
    if (!data) {
      ctx.fillStyle = "#1c2022";
      ctx.fillRect(0, 0, targetPx, targetPx);
      return;
    }
    const img = ctx.createImageData(targetPx, targetPx);
    const ratio = size / targetPx;
    for (let y = 0; y < targetPx; y++) {
      for (let x = 0; x < targetPx; x++) {
        const sx = Math.floor(x * ratio);
        const sy = Math.floor(y * ratio);
        const h = data[sy * size + sx];
        const v = Math.round(h * 255);
        const i = (y * targetPx + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [data, size, targetPx, version]);

  // overlay (waypoints, roads, scatter dots)
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = targetPx;
    canvas.height = targetPx;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, targetPx, targetPx);

    // road overlay
    if (roadOverlay) {
      const tmp = document.createElement("canvas");
      tmp.width = roadOverlay.size;
      tmp.height = roadOverlay.size;
      const tctx = tmp.getContext("2d");
      const img = new ImageData(new Uint8ClampedArray(roadOverlay.data), roadOverlay.size, roadOverlay.size);
      tctx.putImageData(img, 0, 0);
      ctx.drawImage(tmp, 0, 0, targetPx, targetPx);
    }

    // scatter dots (downsampled)
    if (scatterLayers.length && size) {
      const ratio = targetPx / size;
      for (const layer of scatterLayers) {
        if (!layer.points) continue;
        ctx.fillStyle = layer.color;
        for (let i = 0; i < layer.points.length; i++) {
          const [px, py] = layer.points[i];
          ctx.fillRect(Math.floor(px * ratio), Math.floor(py * ratio), 1, 1);
        }
      }
    }

    // waypoints + spline
    if (waypoints.length > 0) {
      ctx.strokeStyle = "#d97644";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const x = w.x * targetPx;
        const y = w.y * targetPx;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // dots
      for (let i = 0; i < waypoints.length; i++) {
        const w = waypoints[i];
        const x = w.x * targetPx;
        const y = w.y * targetPx;
        ctx.fillStyle = "#d97644";
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.strokeStyle = "#0b0d0e";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 3, y - 3, 6, 6);
      }
    }
  }, [waypoints, scatterLayers, roadOverlay, targetPx, size]);

  const handleClick = (e) => {
    if (!onClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    onClick(nx, ny, e.shiftKey);
  };
  const handleMove = (e) => {
    if (onDrag && e.buttons === 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      onDrag((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      return;
    }
    if (!onMove) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onMove((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
  };

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%", cursor: onDrag ? "crosshair" : (onClick ? "crosshair" : "default") }}
      onClick={handleClick}
      onMouseMove={handleMove}
      data-testid="minimap-wrapper"
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block", position: "absolute", inset: 0 }} />
      <canvas ref={overlayRef} style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block", position: "absolute", inset: 0, pointerEvents: "none" }} data-testid="minimap-overlay" />
    </div>
  );
}

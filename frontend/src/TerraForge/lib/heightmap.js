// .r16 export + image upload parsing

// Export Float32 [0..1] heightmap to .r16 (16-bit unsigned little-endian raw)
export function exportR16(data, filename = "heightmap.r16") {
  const buf = new ArrayBuffer(data.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(0, Math.min(1, data[i]));
    view.setUint16(i * 2, Math.round(v * 65535), true);
  }
  const blob = new Blob([buf], { type: "application/octet-stream" });
  triggerDownload(blob, filename);
}

// Export to 16-bit grayscale PNG (uses canvas, downsampled to 8-bit visual preview as PNG)
export function exportPNG8(data, size, filename = "heightmap_preview.png") {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < data.length; i++) {
    const v = Math.round(Math.max(0, Math.min(1, data[i])) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  canvas.toBlob((blob) => triggerDownload(blob, filename), "image/png");
}

// Export an arbitrary RGBA Uint8ClampedArray buffer as PNG
export function exportPNGRGBA(rgbaData, size, filename = "map.png") {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = new ImageData(rgbaData, size, size);
  ctx.putImageData(img, 0, 0);
  canvas.toBlob((blob) => triggerDownload(blob, filename), "image/png");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Read uploaded image file -> Float32Array of luminance [0..1] and detected size
export async function parseImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const size = Math.min(w, h);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const sx = (w - size) / 2;
        const sy = (h - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const out = new Float32Array(size * size);
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < size * size; i++) {
          // Luminance from RGB
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          out[i] = v;
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
        const range = mx - mn || 1;
        for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / range;
        resolve({ data: out, size });
      };
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Parse uploaded .r16 raw heightmap (16-bit unsigned little-endian). Size inferred from sqrt(byteLength/2).
export async function parseR16File(file) {
  const buf = await file.arrayBuffer();
  const samples = buf.byteLength / 2;
  const size = Math.round(Math.sqrt(samples));
  if (size * size !== samples) throw new Error("not square .r16");
  const view = new DataView(buf);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) out[i] = view.getUint16(i * 2, true) / 65535;
  return { data: out, size };
}

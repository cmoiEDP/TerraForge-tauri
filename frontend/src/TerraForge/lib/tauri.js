// Tauri bridge — detects if we are running inside Tauri and routes heavy compute
// to native Rust commands. Falls back to the JS implementation transparently
// when running in a regular browser. Keeps the same API surface as the JS libs.

const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;

async function invoke(cmd, args) {
  if (!isTauri) throw new Error("not running in Tauri");
  // Tauri v2 exposes invoke directly on the global. No npm import needed —
  // this keeps the React frontend buildable as a pure web app.
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

export function isNative() { return isTauri; }

// Heightmap is kept in Rust's memory under a string id. The UI tracks ids; only
// metadata + thumbnails come back over IPC. When the JS preview/3D viewer needs
// the raw data, we round-trip with tf_get_heightmap.
let nextId = 1;
export function newId(prefix = "h") { return `${prefix}-${nextId++}`; }

export async function generateNative(id, params, preset) {
  return invoke("tf_generate", { id, params, preset: preset || null });
}
export async function erodeNative(srcId, dstId, params) {
  return invoke("tf_erode", { id: srcId, dstId, params });
}
export async function upscaleNative(srcId, dstId, params) {
  return invoke("tf_upscale", { id: srcId, dstId, params });
}
export async function combineNative(a, b, dstId, mode, blend) {
  return invoke("tf_combine", { a, b, dstId, mode, blend });
}
export async function brushNative(id, cx, cy, mode, radius, strength, targetHeight) {
  return invoke("tf_brush", { id, params: { cx, cy, mode, radius, strength, targetHeight } });
}
export async function roadRasterNative(id, waypoints, width, falloff) {
  return invoke("tf_road_raster", {
    id, params: { waypoints: waypoints.map((w) => [w.x, w.y]), width, falloff },
  });
}
export async function roadFlattenNative(id, waypoints, width, falloff, strength) {
  return invoke("tf_road_flatten", {
    id, params: { waypoints: waypoints.map((w) => [w.x, w.y]), width, falloff }, strength,
  });
}
export async function biomeSplatmapNative(id, params) {
  return invoke("tf_biome_splatmap", { id, params });
}
export async function scatterNative(id, params) {
  return invoke("tf_scatter", { id, params });
}
export async function getHeightmapNative(id) {
  // Returns [Float32Array, size]
  const [data, size] = await invoke("tf_get_heightmap", { id });
  return [new Float32Array(data), size];
}
export async function putHeightmapNative(id, data, size) {
  return invoke("tf_put_heightmap", { id, data: Array.from(data), size });
}
export async function exportR16Native(id, path) {
  return invoke("tf_export_r16", { id, path });
}
export async function exportObjNative(id, path, heightScale, decimate) {
  return invoke("tf_export_obj", { id, path, heightScale, decimate });
}

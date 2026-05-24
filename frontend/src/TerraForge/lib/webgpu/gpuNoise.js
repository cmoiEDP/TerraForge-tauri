// WebGPU heightmap generation. Falls back gracefully to CPU when unsupported.
// Strategy: value-noise fBm (close enough to simplex visually for terrain).

let cachedDevice = null;
let cachedPipeline = null;

export function isWebGPUAvailable() {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

async function getDevice() {
  if (cachedDevice) return cachedDevice;
  if (!isWebGPUAvailable()) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    cachedDevice = await adapter.requestDevice();
    return cachedDevice;
  } catch (e) {
    console.warn("WebGPU init failed:", e);
    return null;
  }
}

const NOISE_WGSL = /* wgsl */ `
struct Params {
  size: u32,
  seed: u32,
  octaves: u32,
  _pad0: u32,
  scale: f32,
  persistence: f32,
  lacunarity: f32,
  ridge_blend: f32,
  warp: f32,
  exponent: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

fn hash2(p: vec2<f32>, seed: u32) -> f32 {
  let s = f32(seed) * 0.0001;
  let x = sin(dot(p + vec2<f32>(s, s * 1.3), vec2<f32>(127.1, 311.7))) * 43758.5453;
  return fract(x);
}

fn smooth_step3(t: f32) -> f32 {
  return t * t * (3.0 - 2.0 * t);
}

// value noise with smoothed interpolation
fn vnoise(p: vec2<f32>, seed: u32) -> f32 {
  let pi = floor(p);
  let pf = p - pi;
  let a = hash2(pi, seed);
  let b = hash2(pi + vec2<f32>(1.0, 0.0), seed);
  let c = hash2(pi + vec2<f32>(0.0, 1.0), seed);
  let d = hash2(pi + vec2<f32>(1.0, 1.0), seed);
  let u = smooth_step3(pf.x);
  let v = smooth_step3(pf.y);
  let ab = mix(a, b, u);
  let cd = mix(c, d, u);
  return mix(ab, cd, v) * 2.0 - 1.0; // -1..1
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = params.size;
  if (gid.x >= size || gid.y >= size) { return; }
  let x = f32(gid.x);
  let y = f32(gid.y);

  // domain warp
  let wx = vnoise(vec2<f32>(x, y) * params.scale * 0.5, params.seed + 1u) * params.warp * 200.0;
  let wy = vnoise(vec2<f32>(x + 100.0, y + 100.0) * params.scale * 0.5, params.seed + 2u) * params.warp * 200.0;

  var amp: f32 = 1.0;
  var freq: f32 = 1.0;
  var fbm_sum: f32 = 0.0;
  var ridged_sum: f32 = 0.0;
  var norm: f32 = 0.0;

  for (var o: u32 = 0u; o < params.octaves; o = o + 1u) {
    let nx = (x + wx) * params.scale * freq;
    let ny = (y + wy) * params.scale * freq;
    let n = vnoise(vec2<f32>(nx, ny), params.seed);
    fbm_sum = fbm_sum + n * amp;
    ridged_sum = ridged_sum + (1.0 - abs(n)) * amp;
    norm = norm + amp;
    amp = amp * params.persistence;
    freq = freq * params.lacunarity;
  }
  let fbm = fbm_sum / norm;
  let ridged = ridged_sum / norm;
  var h = (fbm * 0.5 + 0.5) * (1.0 - params.ridge_blend) + ridged * params.ridge_blend;
  h = clamp(h, 0.0, 1.0);
  h = pow(h, params.exponent);

  output[gid.y * size + gid.x] = h;
}
`;

async function getPipeline(device) {
  if (cachedPipeline) return cachedPipeline;
  const module = device.createShaderModule({ code: NOISE_WGSL });
  cachedPipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  return cachedPipeline;
}

// Async generation. Returns Float32Array of size*size [0..1] (then normalized on CPU).
export async function generateHeightmapGPU({
  size, seed = 1337, scale = 0.0018, octaves = 7,
  persistence = 0.5, lacunarity = 2.0, ridgeBlend = 0.4,
  warp = 0.3, exponent = 1.4,
}) {
  const device = await getDevice();
  if (!device) return null;
  const pipeline = await getPipeline(device);

  // uniform buffer: 12 x 4 bytes = 48 bytes
  const uniformData = new ArrayBuffer(48);
  const u32 = new Uint32Array(uniformData);
  const f32 = new Float32Array(uniformData);
  u32[0] = size;
  u32[1] = seed >>> 0;
  u32[2] = octaves;
  u32[3] = 0;
  f32[4] = scale;
  f32[5] = persistence;
  f32[6] = lacunarity;
  f32[7] = ridgeBlend;
  f32[8] = warp;
  f32[9] = exponent;
  f32[10] = 0;
  f32[11] = 0;

  const uniformBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  const outBytes = size * size * 4;
  const outputBuffer = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuffer = device.createBuffer({
    size: outBytes,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  const wg = Math.ceil(size / 16);
  pass.dispatchWorkgroups(wg, wg);
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outBytes);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();

  outputBuffer.destroy();
  readBuffer.destroy();
  uniformBuffer.destroy();

  // normalize
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < data.length; i++) { if (data[i] < mn) mn = data[i]; if (data[i] > mx) mx = data[i]; }
  const range = mx - mn || 1;
  for (let i = 0; i < data.length; i++) data[i] = (data[i] - mn) / range;
  return data;
}

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { biomeColorAt, DEFAULT_BIOME_PARAMS } from "@/TerraForge/lib/biomes";

function downsample(data, srcSize, dstSize) {
  if (srcSize === dstSize) return data;
  const out = new Float32Array(dstSize * dstSize);
  const ratio = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.floor(x * ratio);
      const sy = Math.floor(y * ratio);
      out[y * dstSize + x] = data[sy * srcSize + sx];
    }
  }
  return out;
}

function computeSlope(h, size) {
  const slope = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = Math.max(0, x - 1);
      const xr = Math.min(size - 1, x + 1);
      const yu = Math.max(0, y - 1);
      const yd = Math.min(size - 1, y + 1);
      const dx = h[y * size + xr] - h[y * size + xl];
      const dy = h[yd * size + x] - h[yu * size + x];
      slope[y * size + x] = Math.min(1, Math.hypot(dx, dy) * size * 0.05);
    }
  }
  return slope;
}

export default function TerrainViewer3D({
  data, size,
  heightScale = 0.35,
  wireframe = false,
  biomeParams = DEFAULT_BIOME_PARAMS,
  roadOverlay = null,    // { data: Uint8ClampedArray, size }
  scatterOverlay = null, // { layers: [{id, color, points: [[x,y]]}], sourceSize }
  previewSize = 256,
  version = 0,           // bumped on in-place heightmap edits (brush, road flatten) to force re-render
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d0e);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(1.6, 1.1, 1.6);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const dir = new THREE.DirectionalLight(0xfff2dc, 1.4);
    dir.position.set(2, 3, 1);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0x445566, 0.6));
    const back = new THREE.DirectionalLight(0x6fb6a4, 0.4);
    back.position.set(-2, 1, -2);
    scene.add(back);

    let rotX = 0.5;
    let rotY = 0.6;
    let dist = 2.2;
    let isDown = false;
    let lastX = 0, lastY = 0;
    const dom = renderer.domElement;
    dom.style.cursor = "grab";
    const onDown = (e) => { isDown = true; lastX = e.clientX; lastY = e.clientY; dom.style.cursor = "grabbing"; };
    const onUp = () => { isDown = false; dom.style.cursor = "grab"; };
    const onMove = (e) => {
      if (!isDown) return;
      rotY += (e.clientX - lastX) * 0.008;
      rotX += (e.clientY - lastY) * 0.008;
      rotX = Math.max(0.05, Math.min(1.4, rotX));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onWheel = (e) => {
      e.preventDefault();
      dist *= 1 + e.deltaY * 0.0012;
      dist = Math.max(1.0, Math.min(5.0, dist));
    };
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("mousemove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: false });
    const onContext = (e) => e.preventDefault();
    const onAuxClick = (e) => e.preventDefault();
    const onMouseDownAny = (e) => {
      // block middle-click autoscroll (button 1)
      if (e.button === 1 || e.button === 2) e.preventDefault();
    };
    dom.addEventListener("contextmenu", onContext);
    dom.addEventListener("auxclick", onAuxClick);
    dom.addEventListener("mousedown", onMouseDownAny);

    sceneRef.current = { scene, camera, renderer, dom, onDown, onUp, onMove, onWheel, mount };

    let raf;
    const animate = () => {
      const cx = Math.sin(rotY) * Math.cos(rotX) * dist;
      const cy = Math.sin(rotX) * dist;
      const cz = Math.cos(rotY) * Math.cos(rotX) * dist;
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("mousemove", onMove);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("contextmenu", onContext);
      dom.removeEventListener("auxclick", onAuxClick);
      dom.removeEventListener("mousedown", onMouseDownAny);
      if (mount.contains(dom)) mount.removeChild(dom);
      renderer.dispose();
    };
  }, []);

  // build/refresh terrain mesh
  useEffect(() => {
    if (!sceneRef.current || !data) return;
    const { scene } = sceneRef.current;
    const old = scene.getObjectByName("terrain");
    if (old) {
      scene.remove(old);
      old.geometry.dispose();
      old.material.dispose();
      if (old.material.map) old.material.map.dispose();
    }
    const previewSizeClamped = Math.min(previewSize, size);
    const down = downsample(data, size, previewSizeClamped);
    const slope = computeSlope(down, previewSizeClamped);
    const geom = new THREE.PlaneGeometry(2, 2, previewSizeClamped - 1, previewSizeClamped - 1);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const h = down[i];
      const s = slope[i];
      pos.setY(i, h * heightScale);
      const [cr, cg, cb] = biomeColorAt(h, s, biomeParams);
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.computeVertexNormals();

    // Build overlay texture (road + scatter) at previewSize
    let texture = null;
    if (roadOverlay || scatterOverlay) {
      const ovCanvas = document.createElement("canvas");
      ovCanvas.width = previewSizeClamped;
      ovCanvas.height = previewSizeClamped;
      const ctx = ovCanvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.clearRect(0, 0, previewSizeClamped, previewSizeClamped);

      if (roadOverlay) {
        const tmp = document.createElement("canvas");
        tmp.width = roadOverlay.size;
        tmp.height = roadOverlay.size;
        const tctx = tmp.getContext("2d");
        const img = new ImageData(new Uint8ClampedArray(roadOverlay.data), roadOverlay.size, roadOverlay.size);
        tctx.putImageData(img, 0, 0);
        ctx.drawImage(tmp, 0, 0, previewSizeClamped, previewSizeClamped);
      }
      if (scatterOverlay) {
        const srcSize = scatterOverlay.sourceSize;
        const ratio = previewSizeClamped / srcSize;
        // Larger dot radius so vegetation is actually visible on the mesh.
        const dotR = Math.max(1, Math.floor(previewSizeClamped / 160));
        for (const layer of scatterOverlay.layers) {
          if (!layer.points) continue;
          ctx.fillStyle = layer.color;
          for (const [px, py] of layer.points) {
            const cx = Math.floor(px * ratio);
            const cy = Math.floor(py * ratio);
            ctx.fillRect(cx - dotR, cy - dotR, dotR * 2 + 1, dotR * 2 + 1);
          }
        }
      }
      texture = new THREE.CanvasTexture(ovCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
    }

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      wireframe,
      roughness: 0.95,
      metalness: 0.05,
      map: texture,
      fog: false,
    });
    if (texture) {
      // tint underlying vertex colors by texture only where alpha>0
      mat.transparent = false;
      mat.color = new THREE.Color(0xffffff);
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = "terrain";
    scene.add(mesh);
  }, [data, size, heightScale, wireframe, biomeParams, roadOverlay, scatterOverlay, previewSize, version]);

  return (
    <div
      ref={mountRef}
      data-testid="terrain-viewer-3d"
      style={{ width: "100%", height: "100%", minHeight: 0, background: "#0b0d0e" }}
    />
  );
}

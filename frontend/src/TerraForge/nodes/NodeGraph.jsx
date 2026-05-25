import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import { NODE_COMPONENTS } from "@/TerraForge/nodes/nodeTypes";
import { executeGraph, NODE_DEFS, NODE_CATEGORIES } from "@/TerraForge/nodes/executor";
import { isWebGPUAvailable } from "@/TerraForge/lib/webgpu/gpuNoise";
import { toast } from "sonner";

let idSeed = 100;
const newId = (t) => `${t}-${++idSeed}`;

// ─── Pre-wired examples ───
function exampleWaterSim() {
  const ids = ["noise", "shape", "erode", "river", "lake", "sea", "output"].map((t) => ({ t, id: newId(t) }));
  const xStart = 40, xStep = 250, y = 80;
  const nodes = ids.map((x, i) => ({
    id: x.id, type: x.t, position: { x: xStart + i * xStep, y },
    data: { type: x.t, params: { ...NODE_DEFS[x.t].defaults } },
  }));
  const edges = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({
      id: `e${i}`, source: ids[i].id, sourceHandle: "out",
      target: ids[i + 1].id, targetHandle: "in-0",
    });
  }
  return { nodes, edges };
}

function exampleVegetation() {
  // noise -> shape -> erode -> trees (visual markers) -> output
  const ids = ["noise", "shape", "erode", "trees", "output"].map((t) => ({ t, id: newId(t) }));
  const xStart = 40, xStep = 270, y = 60;
  const nodes = ids.map((x, i) => ({
    id: x.id, type: x.t, position: { x: xStart + i * xStep, y },
    data: { type: x.t, params: { ...NODE_DEFS[x.t].defaults } },
  }));
  const edges = [];
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({
      id: `e${i}`, source: ids[i].id, sourceHandle: "out",
      target: ids[i + 1].id, targetHandle: "in-0",
    });
  }
  return { nodes, edges };
}

function exampleEmpty() {
  const outId = newId("output");
  return {
    nodes: [{ id: outId, type: "output", position: { x: 240, y: 100 }, data: { type: "output", params: {} } }],
    edges: [],
  };
}

const EXAMPLES = [
  { id: "default", label: "Basic", build: () => initialGraph() },
  { id: "water",   label: "Water Sim",  build: exampleWaterSim },
  { id: "veg",     label: "Vegetation", build: exampleVegetation },
  { id: "empty",   label: "Empty",      build: exampleEmpty },
];

function initialGraph() {
  const noiseId = newId("noise");
  const shapeId = newId("shape");
  const erodeId = newId("erode");
  const outId = newId("output");
  return {
    nodes: [
      { id: noiseId, type: "noise", position: { x: 40, y: 60 }, data: { type: "noise", params: { ...NODE_DEFS.noise.defaults } } },
      { id: shapeId, type: "shape", position: { x: 330, y: 60 }, data: { type: "shape", params: { ...NODE_DEFS.shape.defaults } } },
      { id: erodeId, type: "erode", position: { x: 580, y: 60 }, data: { type: "erode", params: { ...NODE_DEFS.erode.defaults } } },
      { id: outId, type: "output", position: { x: 840, y: 60 }, data: { type: "output", params: {} } },
    ],
    edges: [
      { id: "e1", source: noiseId, sourceHandle: "out", target: shapeId, targetHandle: "in-0" },
      { id: "e2", source: shapeId, sourceHandle: "out", target: erodeId, targetHandle: "in-0" },
      { id: "e3", source: erodeId, sourceHandle: "out", target: outId, targetHandle: "in-0" },
    ],
  };
}

export default function NodeGraph({ size, onResult, busy, setBusy, stage, setStage }) {
  const initial = useMemo(() => initialGraph(), []);
  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);
  const [gpu] = useState(isWebGPUAvailable());
  const [autoPreview, setAutoPreview] = useState(true);
  const autoRunRef = useRef(null);
  const busyRef = useRef(false);

  const onChangeData = useCallback((nodeId, newData) => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: newData } : n)));
  }, []);

  // Inject onChange into each node's data so they can self-update
  const enrichedNodes = useMemo(() => nodes.map((n) => ({
    ...n,
    data: { ...n.data, onChange: (newData) => onChangeData(n.id, newData) },
  })), [nodes, onChangeData]);

  const nodeTypes = useMemo(() => NODE_COMPONENTS, []);

  const onNodesChange = useCallback((changes) => setNodes((ns) => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes) => setEdges((es) => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((params) => setEdges((es) => addEdge({ ...params, animated: false }, es)), []);

  const addNode = (type) => {
    const id = newId(type);
    setNodes((ns) => ([
      ...ns,
      {
        id, type,
        position: { x: 120 + Math.random() * 60, y: 200 + Math.random() * 60 },
        data: { type, params: { ...NODE_DEFS[type].defaults } },
      },
    ]));
  };

  const runGraph = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setStage("executing graph");
    try {
      const t0 = performance.now();
      const result = await executeGraph(nodes, edges, size, (p, node) => {
        setStage(node ? `${node.data.type}` : "ready");
      });
      const t1 = ((performance.now() - t0) / 1000).toFixed(2);
      onResult({ data: result, size });
      setStage("ready");
      toast.success(`Graph executed in ${t1}s · ${size}×${size}` + (gpu ? " · GPU" : " · CPU"));
    } catch (e) {
      toast.error("Graph error: " + e.message);
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  // ─── Auto-preview : debounced re-run on any graph change ───
  // Watches nodes (incl. their data.params) and edges, fires runGraph with 700ms debounce.
  // Skipped when busy or autoPreview is off.
  const graphSignature = useMemo(
    () => JSON.stringify({
      n: nodes.map((n) => ({ id: n.id, t: n.data.type, p: n.data.params })),
      e: edges.map((e) => ({ s: e.source, t: e.target, h: e.targetHandle })),
    }),
    [nodes, edges]
  );
  useEffect(() => {
    if (!autoPreview) return;
    if (autoRunRef.current) clearTimeout(autoRunRef.current);
    autoRunRef.current = setTimeout(() => {
      if (busyRef.current) {
        // re-arm after current run finishes
        autoRunRef.current = setTimeout(() => { if (!busyRef.current) runGraph(); }, 200);
        return;
      }
      runGraph();
    }, 700);
    return () => autoRunRef.current && clearTimeout(autoRunRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphSignature, size, autoPreview]);

  return (
    <div className="flex h-full" data-testid="node-graph">
      {/* node palette — hierarchical, collapsible */}
      <aside className="w-[230px] p-3 border-r border-[var(--line)] flex flex-col gap-2 overflow-y-auto scrollbar-thin">
        <div className="label-mono mb-2">// Add Node</div>
        {NODE_CATEGORIES.filter((c) => c.id !== "output").map((cat) => (
          <details key={cat.id} open className="border-b border-[var(--line)] pb-2 mb-1" data-testid={`palette-cat-${cat.id}`}>
            <summary className="cursor-pointer select-none mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)] py-1">
              ▸ {cat.label}
            </summary>
            {cat.nodes && (
              <div className="flex flex-col gap-1 mt-1">
                {cat.nodes.map((t) => NODE_DEFS[t] && (
                  <button
                    key={t}
                    className="btn-ghost text-left text-[11px]"
                    onClick={() => addNode(t)}
                    data-testid={`add-node-${t}`}
                  >
                    + {NODE_DEFS[t].label}
                  </button>
                ))}
              </div>
            )}
            {cat.subcategories && (
              <div className="flex flex-col gap-1 mt-1 pl-2">
                {cat.subcategories.map((sub) => (
                  <details key={sub.id} open className="border-l border-[var(--line)] pl-2" data-testid={`palette-subcat-${sub.id}`}>
                    <summary className="cursor-pointer select-none mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)] py-0.5">
                      › {sub.label}
                    </summary>
                    <div className="flex flex-col gap-1 mt-1">
                      {sub.nodes.map((t) => NODE_DEFS[t] && (
                        <button
                          key={t}
                          className="btn-ghost text-left text-[11px]"
                          onClick={() => addNode(t)}
                          data-testid={`add-node-${t}`}
                        >
                          + {NODE_DEFS[t].label}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </details>
        ))}
        <div className="label-mono mb-1 mt-2">// Compute</div>
        <div className="mono text-[10px] text-[var(--ink-dim)] mb-2">
          <div className="flex justify-between"><span>WebGPU</span><span style={{ color: gpu ? "var(--accent-2)" : "var(--ink-mute)" }}>{gpu ? "available" : "fallback CPU"}</span></div>
          <div className="flex justify-between"><span>graph size</span><span>{nodes.length} nodes · {edges.length} edges</span></div>
        </div>
        <button className="btn-primary w-full" disabled={busy} onClick={runGraph} data-testid="graph-run">
          {busy ? "Running…" : "▶ Run Graph"}
        </button>
        <label className="flex items-center gap-2 mt-1 cursor-pointer mono text-[10px]" data-testid="graph-auto-preview-wrap">
          <input
            type="checkbox"
            checked={autoPreview}
            onChange={(e) => setAutoPreview(e.target.checked)}
            data-testid="graph-auto-preview"
          />
          <span style={{ color: autoPreview ? "var(--accent)" : "var(--ink-mute)" }}>
            ● AUTO-PREVIEW
          </span>
        </label>
        <button
          className="btn-ghost w-full"
          onClick={() => {
            const fresh = initialGraph();
            setNodes(fresh.nodes);
            setEdges(fresh.edges);
          }}
          data-testid="graph-reset"
        >
          ↺ Reset
        </button>

        <div className="border-t border-[var(--line)] my-3" />
        <div className="label-mono mb-1">// Examples</div>
        <div className="grid grid-cols-2 gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              className="btn-ghost text-[10px]"
              onClick={() => {
                const g = ex.build();
                setNodes(g.nodes);
                setEdges(g.edges);
                toast.success(`Loaded "${ex.label}" graph`);
              }}
              data-testid={`example-${ex.id}`}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--line)] my-3" />
        <p className="mono text-[9px] text-[var(--ink-mute)] leading-relaxed">
          drag from a green port (output) to an orange port (input) to connect.<br/>
          select edge + Backspace to delete.
        </p>
      </aside>

      {/* canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={enrichedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background color="#2a2f33" gap={20} size={1} />
          <Controls style={{ background: "var(--bg-1)", border: "1px solid var(--line)" }} />
          <MiniMap
            nodeColor="#d97644"
            maskColor="rgba(11,13,14,0.85)"
            style={{ background: "var(--bg-1)", border: "1px solid var(--line)" }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

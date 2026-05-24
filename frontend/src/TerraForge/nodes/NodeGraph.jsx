import { useState, useCallback, useMemo, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import { NODE_COMPONENTS } from "@/TerraForge/nodes/nodeTypes";
import { executeGraph, NODE_DEFS } from "@/TerraForge/nodes/executor";
import { isWebGPUAvailable } from "@/TerraForge/lib/webgpu/gpuNoise";
import { toast } from "sonner";

let idSeed = 100;
const newId = (t) => `${t}-${++idSeed}`;

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
    }
  };

  return (
    <div className="flex h-full" data-testid="node-graph">
      {/* node palette */}
      <aside className="w-[220px] p-3 border-r border-[var(--line)] flex flex-col gap-2 overflow-y-auto scrollbar-thin">
        <div className="label-mono mb-2">// Add Node</div>
        {Object.entries(NODE_DEFS).filter(([t]) => t !== "output").map(([t, def]) => (
          <button
            key={t}
            className="btn-ghost text-left"
            onClick={() => addNode(t)}
            data-testid={`add-node-${t}`}
          >
            + {def.label}
          </button>
        ))}
        <div className="border-t border-[var(--line)] my-3" />
        <div className="label-mono mb-1">// Compute</div>
        <div className="mono text-[10px] text-[var(--ink-dim)] mb-2">
          <div className="flex justify-between"><span>WebGPU</span><span style={{ color: gpu ? "var(--accent-2)" : "var(--ink-mute)" }}>{gpu ? "available" : "fallback CPU"}</span></div>
          <div className="flex justify-between"><span>graph size</span><span>{nodes.length} nodes · {edges.length} edges</span></div>
        </div>
        <button className="btn-primary w-full" disabled={busy} onClick={runGraph} data-testid="graph-run">
          {busy ? "Running…" : "▶ Run Graph"}
        </button>
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

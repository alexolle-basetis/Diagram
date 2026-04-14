import { useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { ScreenNode } from "./ScreenNode";
import { ApiEdge } from "./ApiEdge";
import { DetailPanel } from "./DetailPanel";
import { SearchDialog } from "./SearchDialog";
import { useDiagramStore } from "../store/useDiagramStore";
import { buildFlowElements } from "../utils/layoutEngine";

const nodeTypes: NodeTypes = { screenNode: ScreenNode };
const edgeTypes: EdgeTypes = { apiEdge: ApiEdge };

export function DiagramCanvas() {
  const diagram = useDiagramStore((s) => s.diagram);
  const nodePositions = useDiagramStore((s) => s.nodePositions);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const selection = useDiagramStore((s) => s.selection);
  const updateNodePosition = useDiagramStore((s) => s.updateNodePosition);
  const deleteScreen = useDiagramStore((s) => s.deleteScreen);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(diagram, nodePositions),
    [diagram, nodePositions]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const isInitialMount = useRef(true);
  const diagramRef = useRef(diagram);

  // Sync when diagram data changes
  useEffect(() => {
    diagramRef.current = diagram;
    const { nodes: newNodes, edges: newEdges } = buildFlowElements(diagram, nodePositions);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [diagram, nodePositions, setNodes, setEdges]);

  // Fit view only on first load
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
    }
  }, [fitView]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = useDiagramStore.getState().selection;
        if (sel.kind === "screen") {
          e.preventDefault();
          deleteScreen(sel.screenId);
        } else if (sel.kind === "edge") {
          e.preventDefault();
          deleteAction(sel.sourceScreenId, sel.actionId);
        }
      }
      if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, deleteScreen, deleteAction, clearSelection]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      setSelection({ kind: "screen", screenId: node.id });
    },
    [setSelection]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string; source: string; target: string; data?: Record<string, unknown> }) => {
      const actionId = (edge.data?.actionId as string) ?? "";
      setSelection({
        kind: "edge",
        actionId,
        sourceScreenId: edge.source,
        targetScreenId: edge.target,
      });
    },
    [setSelection]
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Persist positions on drag
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      updateNodePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [updateNodePosition]
  );


  return (
    <div className="relative h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}

        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ animated: false }}
        deleteKeyCode={null}
        selectionKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
        <Controls
          className="!bg-slate-800 !border-slate-700 !rounded-lg !shadow-lg [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-400 [&>button:hover]:!bg-slate-700"
        />
        <MiniMap
          className="!bg-slate-900 !border-slate-700 !rounded-lg"
          nodeColor="#7c3aed"
          maskColor="rgba(0, 0, 0, 0.6)"
        />
      </ReactFlow>

      {selection.kind !== "none" && <DetailPanel />}
      <SearchDialog />
    </div>
  );
}

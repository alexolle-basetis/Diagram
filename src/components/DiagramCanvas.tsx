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
  ConnectionMode,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type NodeMouseHandler,
  type OnConnect,
  type OnConnectEnd,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LogOut, ChevronRight } from "lucide-react";

import { ScreenNode } from "./ScreenNode";
import { ApiEdge } from "./ApiEdge";
import { DetailPanel } from "./DetailPanel";
import { SearchDialog } from "./SearchDialog";
import { VariablesPanel } from "./VariablesPanel";
import { PlaybackOverlay } from "./PlaybackOverlay";
import { useDiagramStore } from "../store/useDiagramStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
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
  const addAction = useDiagramStore((s) => s.addAction);
  const updateAction = useDiagramStore((s) => s.updateAction);
  const deleteScreen = useDiagramStore((s) => s.deleteScreen);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const playback = useDiagramStore((s) => s.playback);
  const stopPlayback = useDiagramStore((s) => s.stopPlayback);
  const stepBackPlayback = useDiagramStore((s) => s.stepBackPlayback);
  const theme = usePreferencesStore((s) => s.theme);
  const edgeConnectMode = usePreferencesStore((s) => s.edgeConnectMode);
  const isLight = theme === "light";

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildFlowElements(diagram, nodePositions),
    [diagram, nodePositions]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const isInitialMount = useRef(true);

  // Sync when diagram data changes
  useEffect(() => {
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

  // NOTE: Playback auto-recentering is handled INSIDE PlaybackOverlay on
  // user action (next click → short pan, no zoom change). We deliberately
  // do NOT animate on every playback.nodeId change here, which previously
  // caused a jarring zoom-in each step.

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
        if (useDiagramStore.getState().playback.active) {
          stopPlayback();
          requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
        } else {
          clearSelection();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, deleteScreen, deleteAction, clearSelection, stopPlayback, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      // Ignore selection clicks during playback
      if (useDiagramStore.getState().playback.active) return;
      setSelection({ kind: "screen", screenId: node.id });
    },
    [setSelection]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string; source: string; target: string; data?: Record<string, unknown> }) => {
      if (useDiagramStore.getState().playback.active) return;
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

  // Multi-selection: when React Flow reports >1 selected nodes (Shift+click or
  // marquee), promote the store selection to "multi-screen" mode so the
  // DetailPanel can offer bulk-edit. Single selection stays as-is to keep the
  // existing per-node UX.
  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (useDiagramStore.getState().playback.active) return;
      if (selectedNodes.length <= 1) return; // single / none handled by onNodeClick / onPaneClick
      setSelection({
        kind: "multi-screen",
        screenIds: selectedNodes.map((n) => n.id),
      });
    },
    [setSelection]
  );

  // Persist positions on drag
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      updateNodePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [updateNodePosition]
  );

  // Handle new connections via drag-to-connect
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      const sourceHandle = connection.sourceHandle ?? "";
      const isNewHandle = sourceHandle.startsWith("__new");

      // Prevent self-connections when creating a new action
      if (connection.source === connection.target && isNewHandle) return;

      if (isNewHandle) {
        const actionId = addAction(connection.source, connection.target);
        setSelection({
          kind: "edge",
          actionId,
          sourceScreenId: connection.source,
          targetScreenId: connection.target,
        });
      } else if (sourceHandle) {
        updateAction(connection.source, sourceHandle, {
          targetScreen: connection.target,
        });
        setSelection({
          kind: "edge",
          actionId: sourceHandle,
          sourceScreenId: connection.source,
          targetScreenId: connection.target,
        });
      }
    },
    [addAction, updateAction, setSelection]
  );

  // Intuitive drop: if the user ends a connection NOT on a handle but over a node,
  // create the connection to that node anyway.
  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid) return; // onConnect already handled it
      const sourceId = state.fromNode?.id;
      const toNode = state.toNode;
      if (!sourceId || !toNode) return;
      if (sourceId === toNode.id) return;

      const sourceHandle = state.fromHandle?.id ?? "";
      const isNewHandle = sourceHandle.startsWith("__new") || !sourceHandle;

      if (isNewHandle) {
        const actionId = addAction(sourceId, toNode.id);
        setSelection({
          kind: "edge",
          actionId,
          sourceScreenId: sourceId,
          targetScreenId: toNode.id,
        });
      } else {
        updateAction(sourceId, sourceHandle, { targetScreen: toNode.id });
        setSelection({
          kind: "edge",
          actionId: sourceHandle,
          sourceScreenId: sourceId,
          targetScreenId: toNode.id,
        });
      }
    },
    [addAction, updateAction, setSelection]
  );

  const handleStepBack = useCallback(
    (nodeId: string) => {
      stepBackPlayback(nodeId);
    },
    [stepBackPlayback]
  );

  const handleExitPlayback = useCallback(() => {
    stopPlayback();
    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
  }, [stopPlayback, fitView]);

  // Resolve trail labels for the breadcrumb
  const trailItems = playback.trail
    .map((entry) => ({ id: entry.nodeId, title: diagram.screens.find((s) => s.id === entry.nodeId)?.title ?? entry.nodeId }));

  return (
    <div className="canvas-root relative h-full w-full bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onSelectionChange={onSelectionChange}
        multiSelectionKeyCode={["Shift", "Meta", "Control"]}
        connectionMode={edgeConnectMode === "free" ? ConnectionMode.Loose : ConnectionMode.Strict}

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
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isLight ? "#cbd5e1" : "#334155"} />
        <Controls
          className={isLight
            ? "!bg-white !border-slate-300 !rounded-lg !shadow-md [&>button]:!bg-white [&>button]:!border-slate-300 [&>button]:!text-slate-500 [&>button:hover]:!bg-slate-100"
            : "!bg-slate-800 !border-slate-700 !rounded-lg !shadow-lg [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-400 [&>button:hover]:!bg-slate-700"
          }
        />
        <MiniMap
          className={isLight
            ? "!bg-white !border-slate-300 !rounded-lg"
            : "!bg-slate-900 !border-slate-700 !rounded-lg"
          }
          nodeColor={isLight ? "#8b5cf6" : "#7c3aed"}
          maskColor={isLight ? "rgba(241, 245, 249, 0.7)" : "rgba(0, 0, 0, 0.6)"}
        />
      </ReactFlow>

      {/* Playback chrome: exit button + breadcrumb */}
      {playback.active && (
        <>
          <button
            onClick={handleExitPlayback}
            className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-violet-500/40 text-violet-300 text-xs font-medium shadow-lg hover:bg-slate-800 hover:border-violet-400 transition-colors backdrop-blur"
          >
            <LogOut className="w-3.5 h-3.5" /> Salir del playback (Esc)
          </button>

          {trailItems.length > 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 max-w-[70vw] px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 backdrop-blur shadow-lg overflow-x-auto">
              {trailItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex items-center gap-1 shrink-0">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                  <button
                    onClick={() => handleStepBack(item.id)}
                    className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                      idx === trailItems.length - 1
                        ? "text-violet-300 font-semibold"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    {item.title}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selection.kind !== "none" && !playback.active && <DetailPanel />}
      {playback.active && <VariablesPanel />}
      {playback.active && playback.nodeId && <PlaybackOverlay nodeId={playback.nodeId} />}
      <SearchDialog />
    </div>
  );
}

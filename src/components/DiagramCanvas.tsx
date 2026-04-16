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
  type OnReconnect,
  type Edge,
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
  const showEdges = usePreferencesStore((s) => s.showEdges);
  const isLight = theme === "light";
  const isPlaybackActive = playback.active;

  // Collect trail edge IDs so we can highlight them during playback.
  const trailEdgeIds = useMemo(() => {
    if (!isPlaybackActive) return new Set<string>();
    const ids = new Set<string>();
    for (let i = 0; i < playback.trail.length - 1; i++) {
      const fromId = playback.trail[i].nodeId;
      const toId = playback.trail[i + 1].nodeId;
      // Find the action that connects fromId → toId
      const screen = diagram.screens.find((s) => s.id === fromId);
      if (screen) {
        const action = screen.actions.find((a) => a.targetScreen === toId);
        if (action) ids.add(`edge-${action.id}`);
        // Also check error paths
        const errAction = screen.actions.find((a) => a.errorTargetScreen === toId);
        if (errAction) ids.add(`edge-err-${errAction.id}`);
      }
    }
    return ids;
  }, [isPlaybackActive, playback.trail, diagram.screens]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const built = buildFlowElements(diagram, nodePositions, edgeConnectMode);
    let edgeList = showEdges ? built.edges : [];
    // During playback, mark trail edges
    if (isPlaybackActive && trailEdgeIds.size > 0) {
      edgeList = edgeList.map((e) =>
        trailEdgeIds.has(e.id)
          ? { ...e, data: { ...e.data, isOnTrail: true } }
          : e
      );
    }
    return { nodes: built.nodes, edges: edgeList };
  }, [diagram, nodePositions, edgeConnectMode, showEdges, isPlaybackActive, trailEdgeIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { fitView } = useReactFlow();
  const isInitialMount = useRef(true);

  // Sync when diagram data changes
  useEffect(() => {
    const built = buildFlowElements(diagram, nodePositions, edgeConnectMode);
    let edgeList = showEdges ? built.edges : [];
    if (isPlaybackActive && trailEdgeIds.size > 0) {
      edgeList = edgeList.map((e) =>
        trailEdgeIds.has(e.id)
          ? { ...e, data: { ...e.data, isOnTrail: true } }
          : e
      );
    }
    setNodes(built.nodes);
    setEdges(edgeList);
  }, [diagram, nodePositions, edgeConnectMode, showEdges, isPlaybackActive, trailEdgeIds, setNodes, setEdges]);

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

      // During playback, only Escape is active
      if (useDiagramStore.getState().playback.active) {
        if (e.key === "Escape") {
          stopPlayback();
          requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }));
        }
        return;
      }

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
  }, [undo, redo, deleteScreen, deleteAction, clearSelection, stopPlayback, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
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
    if (useDiagramStore.getState().playback.active) return;
    clearSelection();
  }, [clearSelection]);

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      if (useDiagramStore.getState().playback.active) return;
      if (selectedNodes.length <= 1) return;
      setSelection({
        kind: "multi-screen",
        screenIds: selectedNodes.map((n) => n.id),
      });
    },
    [setSelection]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      updateNodePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [updateNodePosition]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const actionId = addAction(connection.source, connection.target);
      setSelection({
        kind: "edge",
        actionId,
        sourceScreenId: connection.source,
        targetScreenId: connection.target,
      });
    },
    [addAction, setSelection]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid) return;
      const sourceId = state.fromNode?.id;
      const toNode = state.toNode;
      if (!sourceId || !toNode || sourceId === toNode.id) return;
      const actionId = addAction(sourceId, toNode.id);
      setSelection({
        kind: "edge",
        actionId,
        sourceScreenId: sourceId,
        targetScreenId: toNode.id,
      });
    },
    [addAction, setSelection]
  );

  const onReconnect: OnReconnect = useCallback(
    (oldEdge: Edge, newConnection) => {
      if (!newConnection.source || !newConnection.target) return;
      const actionId = (oldEdge.data as { actionId?: string } | undefined)?.actionId;
      const isErrorPath = (oldEdge.data as { isErrorPath?: boolean } | undefined)?.isErrorPath;
      if (!actionId) return;
      const sourceId = oldEdge.source;
      if (newConnection.source !== sourceId) return;
      if (isErrorPath) {
        updateAction(sourceId, actionId, { errorTargetScreen: newConnection.target });
      } else {
        updateAction(sourceId, actionId, { targetScreen: newConnection.target });
      }
    },
    [updateAction]
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
        onNodesChange={isPlaybackActive ? undefined : onNodesChange}
        onEdgesChange={isPlaybackActive ? undefined : onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={isPlaybackActive ? undefined : onNodeDragStop}
        onConnect={isPlaybackActive ? undefined : onConnect}
        onConnectEnd={isPlaybackActive ? undefined : onConnectEnd}
        onReconnect={isPlaybackActive ? undefined : onReconnect}
        onSelectionChange={isPlaybackActive ? undefined : onSelectionChange}
        multiSelectionKeyCode={isPlaybackActive ? null : ["Shift", "Meta", "Control"]}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={!isPlaybackActive}
        nodesConnectable={!isPlaybackActive}
        elementsSelectable={!isPlaybackActive}

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
      {isPlaybackActive && (
        <>
          <button
            onClick={handleExitPlayback}
            className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-violet-500/40 text-violet-300 text-xs font-medium shadow-lg hover:bg-slate-800 hover:border-violet-400 transition-colors backdrop-blur"
          >
            <LogOut className="w-3.5 h-3.5" /> Salir (Esc)
          </button>

          {trailItems.length > 1 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 max-w-[60vw] px-3 py-1.5 rounded-lg bg-slate-900/90 border border-violet-500/20 backdrop-blur shadow-lg overflow-x-auto">
              {trailItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex items-center gap-1 shrink-0">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                  <button
                    onClick={() => handleStepBack(item.id)}
                    className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${
                      idx === trailItems.length - 1
                        ? "text-violet-300 font-semibold bg-violet-500/10"
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

      {selection.kind !== "none" && !isPlaybackActive && <DetailPanel />}
      {isPlaybackActive && <VariablesPanel />}
      {isPlaybackActive && playback.nodeId && <PlaybackOverlay nodeId={playback.nodeId} />}
      <SearchDialog />

      {/* Version badge */}
      <div
        className={`absolute bottom-2 left-2 z-10 text-[10px] px-1.5 py-0.5 rounded select-none pointer-events-none ${
          isLight ? "text-slate-400/60" : "text-slate-600/60"
        }`}
      >
        v{__APP_VERSION__}
        <span className="ml-1 opacity-60">({__BUILD_HASH__})</span>
      </div>
    </div>
  );
}

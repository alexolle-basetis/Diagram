import { useMemo, useEffect, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useDiagramStore } from "../store/useDiagramStore";
import { ArrowRight, Lock, Undo2 } from "lucide-react";
import { unmetConditions, formatCondition } from "../utils/variables";

const OVERLAY_WIDTH = 300;
/** Approx max overlay height — used to decide placement. Real clamp below. */
const OVERLAY_MAX_HEIGHT = 340;
const MARGIN = 12;

/**
 * Floating action picker that appears ANCHORED to the active playback node.
 *
 * Positioned in **screen-space** (fixed) so it ignores React Flow's zoom
 * (always readable). It auto-picks the side with most room:
 *   right → left → bottom → top, clamped to the viewport.
 *
 * Reactive to pan/zoom via `useViewport`: when the user moves the canvas
 * the overlay follows the node in real time.
 */
export function PlaybackOverlay({ nodeId }: { nodeId: string }) {
  const screen = useDiagramStore((s) => s.getScreen(nodeId));
  const getScreen = useDiagramStore((s) => s.getScreen);
  const variables = useDiagramStore((s) => s.playback.variables);
  const trail = useDiagramStore((s) => s.playback.trail);
  const advancePlayback = useDiagramStore((s) => s.advancePlayback);
  const stepBackPlayback = useDiagramStore((s) => s.stepBackPlayback);
  const { setCenter, getNode, getViewport } = useReactFlow();
  // Subscribe to viewport transform so the overlay re-renders when the user
  // pans or zooms. Keeps the overlay anchored to the active node.
  const viewport = useViewport();

  // Re-render on window resize for placement clamping.
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Compute the node's bounding box in screen coordinates from the current
  // viewport transform + node flow-coords. Doing it here keeps us reactive.
  const placement = useMemo(() => {
    const node = getNode(nodeId);
    if (!node) return null;
    const { x: vx, y: vy, zoom } = viewport;
    const nodeW = (node.width ?? 280) * zoom;
    const nodeH = (node.measured?.height ?? node.height ?? 160) * zoom;
    const nodeLeft = node.position.x * zoom + vx;
    const nodeTop = node.position.y * zoom + vy;
    const nodeRight = nodeLeft + nodeW;
    const nodeBottom = nodeTop + nodeH;
    const nodeCenterY = nodeTop + nodeH / 2;
    const nodeCenterX = nodeLeft + nodeW / 2;

    // Space available on each side.
    const spaceRight = vp.w - nodeRight - MARGIN;
    const spaceLeft = nodeLeft - MARGIN;
    const spaceBelow = vp.h - nodeBottom - MARGIN;
    const spaceAbove = nodeTop - MARGIN;

    // Preference order: right → left → bottom → top
    let side: "right" | "left" | "below" | "above" = "below";
    if (spaceRight >= OVERLAY_WIDTH) side = "right";
    else if (spaceLeft >= OVERLAY_WIDTH) side = "left";
    else if (spaceBelow >= 180) side = "below";
    else if (spaceAbove >= 180) side = "above";
    else {
      // Fallback: pick whichever side has more room
      const m = Math.max(spaceRight, spaceLeft, spaceBelow, spaceAbove);
      side = m === spaceRight ? "right" : m === spaceLeft ? "left" : m === spaceBelow ? "below" : "above";
    }

    // Cap the overlay height to the available vertical room (with a floor).
    const maxH = Math.max(
      200,
      Math.min(
        OVERLAY_MAX_HEIGHT,
        side === "below" ? spaceBelow - MARGIN :
        side === "above" ? spaceAbove - MARGIN :
        vp.h - 2 * MARGIN
      )
    );

    let left = 0;
    let top = 0;
    if (side === "right") {
      left = nodeRight + MARGIN;
      top = nodeCenterY - maxH / 2;
    } else if (side === "left") {
      left = nodeLeft - MARGIN - OVERLAY_WIDTH;
      top = nodeCenterY - maxH / 2;
    } else if (side === "below") {
      left = nodeCenterX - OVERLAY_WIDTH / 2;
      top = nodeBottom + MARGIN;
    } else {
      left = nodeCenterX - OVERLAY_WIDTH / 2;
      top = nodeTop - MARGIN - maxH;
    }

    // Clamp to viewport.
    left = Math.max(MARGIN, Math.min(vp.w - OVERLAY_WIDTH - MARGIN, left));
    top = Math.max(MARGIN, Math.min(vp.h - maxH - MARGIN, top));

    return { left, top, maxH, side };
  }, [getNode, nodeId, viewport, vp]);

  // Can we go back? Only if trail has more than 1 entry.
  const canGoBack = trail.length > 1;
  const previousEntry = canGoBack ? trail[trail.length - 2] : null;

  if (!screen || !placement) return null;

  const panToNode = (targetScreenId: string) => {
    const targetNode = getNode(targetScreenId);
    if (targetNode) {
      const x = targetNode.position.x + (targetNode.width ?? 280) / 2;
      const y = targetNode.position.y + (targetNode.measured?.height ?? targetNode.height ?? 160) / 2;
      const { zoom } = getViewport();
      setCenter(x, y, { duration: 250, zoom });
    }
  };

  const handleChoose = (targetScreenId: string, actionId: string) => {
    panToNode(targetScreenId);
    // Small defer so the pan starts before the overlay re-renders on the next node.
    setTimeout(() => advancePlayback(targetScreenId, actionId), 30);
  };

  const handleBack = () => {
    if (!previousEntry) return;
    panToNode(previousEntry.nodeId);
    setTimeout(() => stepBackPlayback(previousEntry.nodeId), 30);
  };

  return (
    <div
      className="nodrag fixed z-40 bg-slate-900/95 backdrop-blur border border-violet-500/30 rounded-xl shadow-2xl shadow-violet-500/10 flex flex-col overflow-hidden"
      style={{
        left: placement.left,
        top: placement.top,
        width: OVERLAY_WIDTH,
        maxHeight: placement.maxH,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/60 bg-slate-800/40 shrink-0">
        <span className="text-[11px] font-semibold text-violet-300 truncate flex-1">
          {screen.title}
        </span>
        <span className="text-[9px] text-slate-500 uppercase tracking-wider shrink-0">
          {screen.actions.length} {screen.actions.length === 1 ? "acción" : "acciones"}
        </span>
      </div>

      {/* Action list */}
      <div className="p-1.5 space-y-1 overflow-y-auto flex-1">
        {screen.actions.map((action) => {
          const targetTitle = getScreen(action.targetScreen)?.title ?? "?";
          const unmet = unmetConditions(action, variables);
          const blocked = unmet.length > 0;

          return (
            <button
              key={action.id}
              onClick={() => !blocked && handleChoose(action.targetScreen, action.id)}
              disabled={blocked}
              title={blocked ? "Requiere: " + unmet.map(formatCondition).join(", ") : undefined}
              className={`group w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all ${
                blocked
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:bg-violet-600/20 hover:border-violet-500/40"
              }`}
            >
              {blocked
                ? <Lock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                : <ArrowRight className="w-3.5 h-3.5 shrink-0 text-violet-400 group-hover:translate-x-0.5 transition-transform" />
              }
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-medium truncate ${blocked ? "text-slate-500" : "text-slate-100"}`}>
                  {action.label}
                </div>
                {action.note && (
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{action.note}</div>
                )}
              </div>
              {!blocked && (
                <span className="text-[10px] text-slate-500 truncate max-w-[80px] shrink-0">
                  {targetTitle}
                </span>
              )}
            </button>
          );
        })}

        {/* No actions: show back or info */}
        {screen.actions.length === 0 && (
          <div className="text-center py-3">
            <p className="text-[11px] text-slate-500 mb-2">Sin acciones salientes</p>
          </div>
        )}
      </div>

      {/* Back button — always visible if we can go back */}
      {canGoBack && (
        <div className="border-t border-slate-700/60 px-1.5 py-1.5 shrink-0">
          <button
            onClick={handleBack}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-slate-800 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400">
              Volver a {getScreen(previousEntry!.nodeId)?.title ?? "anterior"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

import { useMemo, useEffect, useState } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import { useDiagramStore } from "../store/useDiagramStore";
import { ArrowRight, Globe, MessageSquare, AlertCircle, LogOut, Lock, Sparkles } from "lucide-react";
import { unmetConditions, formatCondition, formatEffect } from "../utils/variables";

const OVERLAY_WIDTH = 340;
/** Approx max overlay height — used to decide placement. Real clamp below. */
const OVERLAY_MAX_HEIGHT = 360;
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
  const getApiCall = useDiagramStore((s) => s.getApiCall);
  const getScreen = useDiagramStore((s) => s.getScreen);
  const variables = useDiagramStore((s) => s.playback.variables);
  const advancePlayback = useDiagramStore((s) => s.advancePlayback);
  const stopPlayback = useDiagramStore((s) => s.stopPlayback);
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

    // Preference order: right → left → below → above
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

  if (!screen || !placement) return null;

  const handleChoose = (targetScreenId: string, actionId: string) => {
    const targetNode = getNode(targetScreenId);
    if (targetNode) {
      const x = targetNode.position.x + (targetNode.width ?? 280) / 2;
      const y = targetNode.position.y + (targetNode.measured?.height ?? targetNode.height ?? 160) / 2;
      // Pan only — keep current zoom — short duration so it feels snappy.
      const { zoom } = getViewport();
      setCenter(x, y, { duration: 250, zoom });
    }
    // Small defer so the pan starts before the overlay re-renders on the next node.
    setTimeout(() => advancePlayback(targetScreenId, actionId), 30);
  };

  return (
    <div
      className="nodrag fixed z-40 bg-slate-900/95 backdrop-blur border border-violet-500/40 rounded-xl shadow-2xl shadow-violet-500/10 flex flex-col overflow-hidden"
      style={{
        left: placement.left,
        top: placement.top,
        width: OVERLAY_WIDTH,
        maxHeight: placement.maxH,
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/60 bg-slate-800/40 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300 truncate">
          ¿Qué hacer en {screen.title}?
        </span>
        <button
          onClick={stopPlayback}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-100 transition-colors shrink-0"
          title="Salir del playback (Esc)"
        >
          <LogOut className="w-3 h-3" /> Salir
        </button>
      </div>

      {screen.actions.length === 0 ? (
        <div className="text-xs text-slate-500 italic px-3 py-4 text-center">
          Este nodo no tiene acciones salientes. Pulsa Esc para salir.
        </div>
      ) : (
        <div className="p-2 space-y-1.5 overflow-y-auto">
          {screen.actions.map((action) => {
            const api = getApiCall(action.id);
            const targetTitle = getScreen(action.targetScreen)?.title ?? "?";
            const unmet = unmetConditions(action, variables);
            const blocked = unmet.length > 0;
            const blockedTitle = blocked
              ? "Bloqueada · Requiere: " + unmet.map(formatCondition).join(" · ")
              : undefined;

            return (
              <div key={action.id} className="space-y-1">
                <button
                  onClick={() => !blocked && handleChoose(action.targetScreen, action.id)}
                  disabled={blocked}
                  title={blockedTitle}
                  className={`group w-full flex items-start gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                    blocked
                      ? "bg-slate-800/40 border-slate-700/40 opacity-60 cursor-not-allowed"
                      : "bg-slate-800 hover:bg-violet-600/20 border-slate-700 hover:border-violet-500/60"
                  }`}
                >
                  {blocked
                    ? <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" />
                    : <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400 group-hover:translate-x-0.5 transition-transform" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium truncate ${blocked ? "text-slate-400" : "text-slate-100"}`}>
                      {action.label}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">→ {targetTitle}</div>

                    {blocked && (
                      <div className="mt-1 space-y-0.5">
                        {unmet.map((c, i) => (
                          <div key={i} className="flex items-center gap-1 text-[10px] text-violet-300/80">
                            <Lock className="w-2.5 h-2.5" />
                            <span className="font-mono truncate">{formatCondition(c)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!blocked && action.effects && action.effects.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-fuchsia-300/80">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span className="font-mono truncate">{action.effects.map(formatEffect).join(" · ")}</span>
                      </div>
                    )}

                    {api && !blocked && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] font-mono text-amber-300/90">
                        <Globe className="w-2.5 h-2.5" />
                        <span className="font-semibold">{api.method}</span>
                        <span className="truncate text-amber-400/70">{api.endpoint}</span>
                      </div>
                    )}
                    {action.note && !blocked && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-sky-300/80">
                        <MessageSquare className="w-2.5 h-2.5" />
                        <span className="truncate italic">{action.note}</span>
                      </div>
                    )}
                  </div>
                </button>

                {action.errorTargetScreen && !blocked && (
                  <button
                    onClick={() => handleChoose(action.errorTargetScreen!, action.id)}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded-lg bg-red-900/15 hover:bg-red-900/30 border border-red-500/30 transition-colors text-left"
                  >
                    <AlertCircle className="w-3 h-3 shrink-0 text-red-400" />
                    <span className="text-[10px] text-red-300 truncate">
                      Error → {getScreen(action.errorTargetScreen)?.title ?? "?"}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

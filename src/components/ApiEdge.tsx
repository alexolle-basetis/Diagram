import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { ArrowRight, Globe, AlertCircle, MessageSquare, Lock, Sparkles } from "lucide-react";
import type { ApiEdgeData } from "../utils/layoutEngine";
import { usePreferencesStore } from "../store/usePreferencesStore";
import { useDiagramStore } from "../store/useDiagramStore";

type ApiEdgeType = Edge<ApiEdgeData, "apiEdge">;

function useEdgePath(params: {
  sourceX: number; sourceY: number;
  targetX: number; targetY: number;
  sourcePosition: EdgeProps["sourcePosition"];
  targetPosition: EdgeProps["targetPosition"];
}): [string, number, number, number, number] {
  const edgeStyle = usePreferencesStore((s) => s.edgeStyle);
  switch (edgeStyle) {
    case "straight":
      return getStraightPath(params);
    case "step":
      return getSmoothStepPath({ ...params, borderRadius: 0 });
    case "smoothstep":
      return getSmoothStepPath(params);
    case "bezier":
    default:
      return getBezierPath(params);
  }
}

export function ApiEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ApiEdgeType>) {
  const [edgePath, labelX, labelY] = useEdgePath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const theme = usePreferencesStore((s) => s.theme);
  const showEdgeLabels = usePreferencesStore((s) => s.showEdgeLabels);
  const isLight = theme === "light";

  const playbackActive = useDiagramStore((s) => s.playback.active);
  const hoveredActionId = useDiagramStore((s) => s.hoveredActionId);
  const isHovered = hoveredActionId !== null && data?.actionId === hoveredActionId;
  const isOnTrail = !!(data as ApiEdgeData & { isOnTrail?: boolean })?.isOnTrail;
  const isHighlighted = !!selected || isHovered;

  const hasApi = data?.hasApi ?? false;
  const hasNote = !!data?.note;
  const hasConditions = data?.hasConditions ?? false;
  const hasEffects = data?.hasEffects ?? false;
  const isError = data?.isErrorPath ?? false;

  // During playback: trail edges glow violet, others nearly invisible
  const playbackDimmed = playbackActive && !isOnTrail;

  const strokeColor = isOnTrail
    ? "#8b5cf6"
    : isHighlighted
      ? "#8b5cf6"
      : playbackDimmed
        ? (isLight ? "#e2e8f0" : "#1e293b")
        : isError
          ? "#ef4444"
          : hasConditions
            ? "#a78bfa"
            : hasApi
              ? "#f59e0b"
              : hasNote
                ? "#38bdf8"
                : isLight ? "#94a3b8" : "#475569";

  const baseWidth = isOnTrail ? 2.5 : isHighlighted ? 3 : playbackDimmed ? 1 : hasApi ? 2 : hasConditions ? 2 : hasNote ? 1.5 : 1.5;

  // Hide labels during playback for cleanliness (except trail edges)
  const hasLabel = showEdgeLabels && !playbackDimmed && (hasApi || hasNote || hasConditions || hasEffects);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: baseWidth,
          strokeDasharray: isError ? "8 4" : isOnTrail ? undefined : (hasApi || hasNote || hasConditions) ? undefined : "6 3",
          filter: isOnTrail ? "drop-shadow(0 0 6px rgba(139, 92, 246, 0.4))" : isHovered && !selected ? "drop-shadow(0 0 4px #8b5cf6)" : undefined,
          opacity: playbackDimmed ? 0.15 : 1,
          transition: "stroke 0.15s, stroke-width 0.15s, filter 0.15s, opacity 0.15s",
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex flex-col gap-0.5"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            data-edge-id={id}
          >
            {/* Condition badge (rendered above) — visual indicator that the edge is gated */}
            {hasConditions && (
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${
                  isLight
                    ? "bg-violet-50 text-violet-700 border-violet-300"
                    : "bg-violet-900/70 text-violet-200 border-violet-500/40"
                }`}
                title={`Condición: ${data?.conditionSummary ?? ""}`}
              >
                <Lock className="w-2.5 h-2.5" />
                <span className="font-mono truncate max-w-[160px]">{data?.conditionSummary}</span>
              </div>
            )}

            {/* Main label (API or note) */}
            {(hasApi || hasNote) && (
              <button
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold
                  cursor-pointer border transition-all max-w-[200px]
                  ${selected
                    ? "bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-500/30"
                    : isError
                      ? isLight
                        ? "bg-red-50 text-red-600 border-red-300 hover:bg-red-100"
                        : "bg-red-900/80 text-red-300 border-red-500/40 hover:bg-red-800/80"
                      : hasApi
                        ? isLight
                          ? "bg-white text-amber-700 border-amber-400 hover:bg-amber-50 hover:border-amber-500 font-mono shadow-sm"
                          : "bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700 hover:border-amber-400 font-mono"
                        : isLight
                          ? "bg-white text-sky-700 border-sky-300 hover:bg-sky-50 hover:border-sky-400 shadow-sm"
                          : "bg-slate-800 text-sky-300 border-sky-500/30 hover:bg-slate-700 hover:border-sky-400"
                  }
                `}
              >
                {hasApi ? (
                  <>
                    {isError ? <AlertCircle className="w-3 h-3 shrink-0" /> : <Globe className="w-3 h-3 shrink-0" />}
                    <span>{data?.method}</span>
                    <ArrowRight className="w-3 h-3 opacity-60 shrink-0" />
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-3 h-3 shrink-0" />
                    <span className="truncate font-normal">{data?.note}</span>
                  </>
                )}
              </button>
            )}

            {/* Effect badge (rendered below) */}
            {hasEffects && (
              <div
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${
                  isLight
                    ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300"
                    : "bg-fuchsia-900/70 text-fuchsia-200 border-fuchsia-500/40"
                }`}
                title={`Efectos: ${data?.effectSummary ?? ""}`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span className="font-mono truncate max-w-[160px]">{data?.effectSummary}</span>
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

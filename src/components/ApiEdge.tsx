import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { ArrowRight, Globe, AlertCircle, MessageSquare } from "lucide-react";
import type { ApiEdgeData } from "../utils/layoutEngine";
import { usePreferencesStore } from "../store/usePreferencesStore";

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
  const isLight = theme === "light";

  const hasApi = data?.hasApi ?? false;
  const hasNote = !!data?.note;
  const isError = data?.isErrorPath ?? false;
  const hasLabel = hasApi || hasNote;

  const strokeColor = selected
    ? "#8b5cf6"
    : isError
      ? "#ef4444"
      : hasApi
        ? "#f59e0b"
        : hasNote
          ? "#38bdf8"
          : isLight ? "#94a3b8" : "#475569";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : hasApi ? 2 : hasNote ? 1.5 : 1.5,
          strokeDasharray: isError ? "8 4" : (hasApi || hasNote) ? undefined : "6 3",
        }}
      />
      {hasLabel && (
        <EdgeLabelRenderer>
          <button
            className={`
              nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold
              cursor-pointer border transition-all max-w-[180px]
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
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            data-edge-id={id}
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
        </EdgeLabelRenderer>
      )}
    </>
  );
}

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { ArrowRight, Globe, AlertCircle } from "lucide-react";
import type { ApiEdgeData } from "../utils/layoutEngine";

type ApiEdgeType = Edge<ApiEdgeData, "apiEdge">;

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
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const hasApi = data?.hasApi ?? false;
  const isError = data?.isErrorPath ?? false;

  const strokeColor = selected
    ? "#8b5cf6"
    : isError
      ? "#ef4444"
      : hasApi
        ? "#f59e0b"
        : "#475569";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : hasApi ? 2 : 1.5,
          strokeDasharray: isError ? "8 4" : hasApi ? undefined : "6 3",
        }}
      />
      {hasApi && (
        <EdgeLabelRenderer>
          <button
            className={`
              nodrag nopan absolute flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-semibold
              cursor-pointer border transition-all
              ${selected
                ? "bg-violet-600 text-white border-violet-400 shadow-lg shadow-violet-500/30"
                : isError
                  ? "bg-red-900/80 text-red-300 border-red-500/40 hover:bg-red-800/80"
                  : "bg-slate-800 text-amber-300 border-amber-500/40 hover:bg-slate-700 hover:border-amber-400"
              }
            `}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            data-edge-id={id}
          >
            {isError ? (
              <AlertCircle className="w-3 h-3" />
            ) : (
              <Globe className="w-3 h-3" />
            )}
            <span>{data?.method}</span>
            <ArrowRight className="w-3 h-3 opacity-60" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

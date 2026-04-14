import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Zap, MessageSquare, Plus } from "lucide-react";
import type { ScreenNodeData } from "../utils/layoutEngine";
import { STATUS_COLORS, SCREEN_COLORS, SCREEN_ICONS } from "../utils/layoutEngine";
import { useDiagramStore } from "../store/useDiagramStore";

type ScreenNodeType = Node<ScreenNodeData, "screenNode">;

export function ScreenNode({ data, selected }: NodeProps<ScreenNodeType>) {
  const filterTag = useDiagramStore((s) => s.filterTag);
  const statusStyle = STATUS_COLORS[data.status];
  const colorStyle = SCREEN_COLORS[data.color];
  const IconComponent = SCREEN_ICONS[data.icon]?.icon ?? SCREEN_ICONS.monitor.icon;

  const dimmed = filterTag ? !data.tags.includes(filterTag) : false;

  return (
    <div
      className={`
        w-[280px] rounded-lg border shadow-lg transition-all
        ${selected ? "border-violet-500 shadow-violet-500/25 ring-1 ring-violet-500/30" : colorStyle.border}
        ${dimmed ? "opacity-25" : "opacity-100"}
        bg-slate-900
      `}
    >
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-violet-500 !border-slate-800 !border-2"
      />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60 rounded-t-lg ${colorStyle.header}`}>
        <IconComponent className={`w-4 h-4 shrink-0 ${colorStyle.accent}`} />
        <span className="font-semibold text-sm text-slate-100 truncate flex-1">{data.title}</span>
        <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusStyle.badge}`}>
          {statusStyle.text}
        </span>
      </div>

      {/* Description */}
      <p className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700/40">
        {data.description || <span className="italic text-slate-600">Sin descripción</span>}
      </p>

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-slate-700/40">
          {data.tags.map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="py-1">
        {data.actions.map((action) => (
          <div
            key={action.id}
            className="relative flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
          >
            <Zap
              className={`w-3 h-3 shrink-0 ${action.hasApi ? "text-amber-400" : "text-slate-500"}`}
            />
            <span className="truncate">{action.label}</span>
            {action.hasNote && (
              <MessageSquare className="w-3 h-3 shrink-0 text-sky-400/70" />
            )}
            {action.hasApi && (
              <span className="ml-auto text-[10px] font-mono font-medium text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">
                API
              </span>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={action.id}
              className="!w-2.5 !h-2.5 !bg-emerald-500 !border-slate-800 !border-2 !right-[-5px]"
            />
          </div>
        ))}

        {/* New connection handle */}
        <div className="relative flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 cursor-pointer transition-colors">
          <Plus className="w-3 h-3 shrink-0" />
          <span className="italic">Arrastra para conectar</span>
          <Handle
            type="source"
            position={Position.Right}
            id="__new__"
            className="!w-2.5 !h-2.5 !bg-violet-500 !border-slate-800 !border-2 !right-[-5px]"
          />
        </div>
      </div>
    </div>
  );
}

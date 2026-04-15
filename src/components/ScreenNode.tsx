import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Zap, MessageSquare, Plus, Play, ImageIcon, ListTodo, Lock, Sparkles } from "lucide-react";
import type { ScreenNodeData } from "../utils/layoutEngine";
import { STATUS_COLORS, SCREEN_COLORS, SCREEN_ICONS } from "../utils/layoutEngine";
import { useDiagramStore } from "../store/useDiagramStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import type { NodeKind } from "../types/diagram";

type ScreenNodeType = Node<ScreenNodeData, "screenNode">;

// ── Shape configs ────────────────────────────────────────────────────
// Each kind defines extra classes for the outer shell + clip-path for the
// shape. Handles remain on the left (target) and right (sources) for edge
// consistency across all kinds.
const KIND_SHELL: Record<NodeKind, { outer: string; innerPad?: string; tag?: string }> = {
  "screen": {
    outer: "rounded-lg",
  },
  "database": {
    // Cylinder achieved by rounding corners heavily vertical-wise + a fake lid line.
    outer: "rounded-[28px/50%] before:content-[''] before:absolute before:top-[8px] before:left-[6px] before:right-[6px] before:h-[14px] before:border-b before:border-current before:opacity-20 before:rounded-b-full",
    innerPad: "pt-3",
    tag: "DB",
  },
  "external-api": {
    // Hexagon via clip-path
    outer: "[clip-path:polygon(16px_0%,calc(100%-16px)_0%,100%_50%,calc(100%-16px)_100%,16px_100%,0%_50%)]",
    innerPad: "px-4",
    tag: "EXT API",
  },
  "service": {
    // Rectangle with chevron-left edge
    outer: "[clip-path:polygon(14px_0%,100%_0%,100%_100%,14px_100%,0%_50%)] rounded-r-lg",
    innerPad: "pl-4",
    tag: "SRV",
  },
  "queue": {
    // Simple rect but with a side band (overlaid via ::after)
    outer: "rounded-lg relative after:content-[''] after:absolute after:top-2 after:bottom-2 after:right-2 after:w-1 after:rounded-full after:bg-current after:opacity-20",
    tag: "QUEUE",
  },
  "user": {
    // Pill shape
    outer: "rounded-full",
    innerPad: "px-5",
    tag: "USER",
  },
};

export function ScreenNode({ data, selected, id }: NodeProps<ScreenNodeType>) {
  const filterTag = useDiagramStore((s) => s.filterTag);
  const playback = useDiagramStore((s) => s.playback);
  const startPlayback = useDiagramStore((s) => s.startPlayback);
  const updateScreen = useDiagramStore((s) => s.updateScreen);
  const setHoveredActionId = useDiagramStore((s) => s.setHoveredActionId);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const edgeConnectMode = usePreferencesStore((s) => s.edgeConnectMode);
  const statusStyle = STATUS_COLORS[data.status];
  const colorStyle = SCREEN_COLORS[data.color];
  const IconComponent = SCREEN_ICONS[data.icon]?.icon ?? SCREEN_ICONS.monitor.icon;

  const kind = data.kind ?? "screen";
  const shell = KIND_SHELL[kind];
  const isPill = kind === "user";
  const isCylinder = kind === "database";
  const hasImage = !!data.imageUrl;
  const screenshotMode = data.viewMode === "screenshot" && hasImage;

  // Dimming: tag filter OR playback (non-active nodes)
  const dimmedByTag = filterTag ? !data.tags.includes(filterTag) : false;
  const dimmedByPlayback = playback.active && playback.nodeId !== id;
  const dimmed = dimmedByTag || dimmedByPlayback;
  const isPlaybackActive = playback.active && playback.nodeId === id;

  const toggleViewMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = data.viewMode === "screenshot" ? "actions" : "screenshot";
    updateScreen(id, { viewMode: next });
  };

  const onPlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    startPlayback(id);
  };

  return (
    <div
      className={`
        screen-node w-[280px] border shadow-lg transition-all relative
        ${shell.outer}
        ${selected ? "border-violet-500 shadow-violet-500/25 ring-1 ring-violet-500/30" : colorStyle.border}
        ${isPlaybackActive ? "ring-2 ring-violet-400 shadow-violet-500/40" : ""}
        ${dimmed ? "opacity-25" : "opacity-100"}
        bg-slate-900
      `}
      style={isPill ? { minHeight: 72 } : undefined}
    >
      {/* Type tag badge (top-left) */}
      {shell.tag && (
        <span className={`absolute top-1 left-2 text-[9px] font-mono font-semibold ${colorStyle.accent} opacity-70 z-10`}>
          {shell.tag}
        </span>
      )}

      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-violet-500 !border-slate-800 !border-2"
      />

      {/* Free-mode extra source handles on other 3 sides */}
      {edgeConnectMode === "free" && (
        <>
          <Handle
            type="source"
            position={Position.Top}
            id="__new_top__"
            className="!w-2.5 !h-2.5 !bg-violet-500/60 hover:!bg-violet-400 !border-slate-800 !border-2"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="__new_bottom__"
            className="!w-2.5 !h-2.5 !bg-violet-500/60 hover:!bg-violet-400 !border-slate-800 !border-2"
          />
          <Handle
            type="source"
            position={Position.Left}
            id="__new_left__"
            style={{ top: "75%" }}
            className="!w-2.5 !h-2.5 !bg-violet-500/60 hover:!bg-violet-400 !border-slate-800 !border-2"
          />
        </>
      )}

      {/* USER kind: compact pill layout */}
      {isPill ? (
        <div className={`flex items-center gap-3 py-3 ${shell.innerPad ?? "px-4"}`}>
          <IconComponent className={`w-6 h-6 shrink-0 ${colorStyle.accent}`} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-100 truncate">{data.title}</div>
            {data.description && (
              <div className="text-[11px] text-slate-400 truncate">{data.description}</div>
            )}
          </div>
          <Handle
            type="source"
            position={Position.Right}
            id="__new__"
            className="!w-2.5 !h-2.5 !bg-violet-500 !border-slate-800 !border-2 !right-[-5px]"
          />
        </div>
      ) : (
        <div className={isCylinder ? "pt-4" : ""}>
          {/* Header */}
          <div className={`screen-node-header flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60 ${colorStyle.header} ${kind === "screen" ? "rounded-t-lg" : ""} ${shell.innerPad ?? ""}`}>
            <IconComponent className={`w-4 h-4 shrink-0 ${colorStyle.accent}`} />
            <span className="font-semibold text-sm text-slate-100 truncate flex-1">{data.title}</span>
            {hasImage && (
              <button
                onClick={toggleViewMode}
                title={screenshotMode ? "Ver acciones" : "Ver captura"}
                className="text-slate-400 hover:text-slate-100 transition-colors nodrag"
              >
                {screenshotMode
                  ? <ListTodo className="w-3.5 h-3.5" />
                  : <ImageIcon className="w-3.5 h-3.5" />}
              </button>
            )}
            <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusStyle.badge}`}>
              {statusStyle.text}
            </span>
          </div>

          {screenshotMode ? (
            <>
              {/* Screenshot mode: image at full width */}
              <img
                src={data.imageUrl}
                alt={data.title}
                className={`w-full max-h-[220px] object-contain bg-slate-800/40 ${shell.innerPad ?? ""}`}
              />
              {/* Action pills (compact row) */}
              {data.actions.length > 0 && (
                <div className={`flex flex-wrap gap-1 px-3 py-2 border-t border-slate-700/40 ${shell.innerPad ?? ""}`}>
                  {data.actions.map((action, idx) => (
                    <div key={action.id} className="relative flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-300 border border-slate-700/50">
                      <span className="text-slate-500">{idx + 1}.</span>
                      <span className="truncate max-w-[120px]">{action.label}</span>
                      {action.hasApi && <span className="text-amber-400 font-mono">·API</span>}
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={action.id}
                        className="!w-2 !h-2 !bg-emerald-500/80 !border-slate-800 !border-2 !right-[-4px] !top-1/2"
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Description — prominent: more padding, larger leading, soft accent border */}
              {data.description ? (
                <p className={`screen-node-desc px-3 py-2.5 text-[12.5px] leading-snug text-slate-200 border-b border-slate-700/40 whitespace-pre-line ${shell.innerPad ?? ""}`}>
                  {data.description}
                </p>
              ) : (
                <p className={`screen-node-desc px-3 py-1.5 text-[11px] italic text-slate-600 border-b border-slate-700/40 ${shell.innerPad ?? ""}`}>
                  Sin descripción
                </p>
              )}

              {/* Tags */}
              {data.tags.length > 0 && (
                <div className={`flex flex-wrap gap-1 px-3 py-1.5 border-b border-slate-700/40 ${shell.innerPad ?? ""}`}>
                  {data.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions list */}
              <div className="py-1">
                {data.actions.map((action) => (
                  <div
                    key={action.id}
                    onMouseEnter={() => setHoveredActionId(action.id)}
                    onMouseLeave={() => setHoveredActionId(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({
                        kind: "edge",
                        actionId: action.id,
                        sourceScreenId: id,
                        targetScreenId: "",
                      });
                    }}
                    className={`screen-node-action relative px-3 py-1.5 text-xs text-slate-300 hover:bg-violet-500/10 cursor-pointer ${shell.innerPad ?? ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap className={`w-3 h-3 shrink-0 ${action.hasApi ? "text-amber-400" : "text-slate-500"}`} />
                      <span className="truncate flex-1">{action.label}</span>
                      {action.hasConditions && <Lock className="w-3 h-3 shrink-0 text-violet-400/80" />}
                      {action.hasEffects && <Sparkles className="w-3 h-3 shrink-0 text-fuchsia-400/80" />}
                      {action.hasApi && (
                        <span className="text-[10px] font-mono font-medium text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          API
                        </span>
                      )}
                    </div>
                    {action.note && (
                      <div className="mt-0.5 ml-5 flex items-start gap-1 text-[11px] text-sky-300/80 italic leading-snug">
                        <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-sky-400/60" />
                        <span className="line-clamp-2">{action.note}</span>
                      </div>
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
                <div className={`screen-node-new relative flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 cursor-pointer transition-colors ${shell.innerPad ?? ""}`}>
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
            </>
          )}
        </div>
      )}

      {/* Playback button (bottom-right) */}
      {!playback.active && (
        <button
          onClick={onPlayClick}
          className="nodrag absolute bottom-1 right-1 p-1 rounded-full bg-violet-500/60 text-white hover:bg-violet-400 hover:scale-110 transition-all z-10 shadow-lg"
          title="Iniciar playback desde aquí"
        >
          <Play className="w-3 h-3 fill-current" />
        </button>
      )}

    </div>
  );
}

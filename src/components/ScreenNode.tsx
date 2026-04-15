import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Zap, MessageSquare, Play, ImageIcon, ListTodo, Lock, Sparkles } from "lucide-react";
import type { ScreenNodeData } from "../utils/layoutEngine";
import { STATUS_COLORS, SCREEN_COLORS, SCREEN_ICONS } from "../utils/layoutEngine";
import { useDiagramStore } from "../store/useDiagramStore";
import { usePreferencesStore } from "../store/usePreferencesStore";
import type { NodeKind } from "../types/diagram";

type ScreenNodeType = Node<ScreenNodeData, "screenNode">;

// ── Shape configs ────────────────────────────────────────────────────
// Each kind defines extra classes for the outer shell + clip-path for the
// shape. Handles live on the 4 sides of the card regardless of shape — the
// layout engine picks which side each edge attaches to based on geometry
// (in "flow" mode only left/right, in "free" mode all 4).
const KIND_SHELL: Record<NodeKind, { outer: string; innerPad?: string; tag?: string }> = {
  "screen": {
    outer: "rounded-lg",
  },
  "database": {
    outer: "rounded-[28px/50%] before:content-[''] before:absolute before:top-[8px] before:left-[6px] before:right-[6px] before:h-[14px] before:border-b before:border-current before:opacity-20 before:rounded-b-full",
    innerPad: "pt-3",
    tag: "DB",
  },
  "external-api": {
    outer: "[clip-path:polygon(16px_0%,calc(100%-16px)_0%,100%_50%,calc(100%-16px)_100%,16px_100%,0%_50%)]",
    innerPad: "px-4",
    tag: "EXT API",
  },
  "service": {
    outer: "[clip-path:polygon(14px_0%,100%_0%,100%_100%,14px_100%,0%_50%)] rounded-r-lg",
    innerPad: "pl-4",
    tag: "SRV",
  },
  "queue": {
    outer: "rounded-lg relative after:content-[''] after:absolute after:top-2 after:bottom-2 after:right-2 after:w-1 after:rounded-full after:bg-current after:opacity-20",
    tag: "QUEUE",
  },
  "user": {
    outer: "rounded-full",
    innerPad: "px-5",
    tag: "USER",
  },
};

const SIDES = ["top", "right", "bottom", "left"] as const;
const SIDE_POSITION = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
} as const;

export function ScreenNode({ data, selected, id }: NodeProps<ScreenNodeType>) {
  const filterTag = useDiagramStore((s) => s.filterTag);
  const playback = useDiagramStore((s) => s.playback);
  const startPlayback = useDiagramStore((s) => s.startPlayback);
  const updateScreen = useDiagramStore((s) => s.updateScreen);
  const setHoveredActionId = useDiagramStore((s) => s.setHoveredActionId);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const edgeConnectMode = usePreferencesStore((s) => s.edgeConnectMode);
  const cardDensity = usePreferencesStore((s) => s.cardDensity);
  const statusStyle = STATUS_COLORS[data.status];
  const colorStyle = SCREEN_COLORS[data.color];
  const IconComponent = SCREEN_ICONS[data.icon]?.icon ?? SCREEN_ICONS.monitor.icon;

  const kind = data.kind ?? "screen";
  const shell = KIND_SHELL[kind];
  const isPill = kind === "user";
  const isCylinder = kind === "database";
  const hasImage = !!data.imageUrl;
  const screenshotMode = data.viewMode === "screenshot" && hasImage;

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

  // In flow mode, only left/right handles are interactive. In free mode, all 4.
  // Non-active sides keep handles present but tiny + low opacity so the layout
  // engine can still route edges there if needed.
  const activeSides: readonly ("top" | "right" | "bottom" | "left")[] =
    edgeConnectMode === "free" ? SIDES : (["left", "right"] as const);

  const showActions = cardDensity === "full" && !screenshotMode;
  const showDescription = cardDensity !== "minimal" && !screenshotMode;
  const showTags = cardDensity === "full" && !screenshotMode;

  return (
    <div
      className={`
        screen-node w-[280px] border shadow-lg transition-all relative group/node
        ${shell.outer}
        ${selected ? "border-violet-500 shadow-violet-500/25 ring-1 ring-violet-500/30" : colorStyle.border}
        ${isPlaybackActive ? "ring-2 ring-violet-400 shadow-violet-500/40" : ""}
        ${dimmed ? "opacity-25" : "opacity-100"}
        bg-slate-900
      `}
      style={isPill ? { minHeight: 72 } : undefined}
    >
      {shell.tag && (
        <span className={`absolute top-1 left-2 text-[9px] font-mono font-semibold ${colorStyle.accent} opacity-70 z-10`}>
          {shell.tag}
        </span>
      )}

      {/* Side handles — both source and target on each side. Layout engine picks
          the handle pair per edge based on relative position. Active sides are
          slightly larger and violet; inactive sides stay present but subtle so
          user-dragged / custom-routed edges keep working. */}
      {SIDES.map((side) => {
        const isActive = activeSides.includes(side);
        const base = "!border-slate-800 !border-2 transition-all";
        const activeCls = isActive
          ? "!w-3 !h-3 !bg-violet-500/70 hover:!bg-violet-400"
          : "!w-2 !h-2 !bg-slate-600/50 opacity-40 group-hover/node:opacity-100";
        return (
          <div key={side}>
            <Handle
              id={`tgt-${side}`}
              type="target"
              position={SIDE_POSITION[side]}
              className={`${base} ${activeCls}`}
            />
            <Handle
              id={`src-${side}`}
              type="source"
              position={SIDE_POSITION[side]}
              className={`${base} ${activeCls}`}
            />
          </div>
        );
      })}

      {isPill ? (
        <div className={`flex items-center gap-3 py-3 ${shell.innerPad ?? "px-4"}`}>
          <IconComponent className={`w-6 h-6 shrink-0 ${colorStyle.accent}`} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-100 truncate">{data.title}</div>
            {showDescription && data.description && (
              <div className="text-[11px] text-slate-400 truncate">{data.description}</div>
            )}
          </div>
        </div>
      ) : (
        <div className={isCylinder ? "pt-4" : ""}>
          <div className={`screen-node-header flex items-center gap-2 px-3 py-2.5 border-b border-slate-700/60 ${colorStyle.header} ${kind === "screen" ? "rounded-t-lg" : ""} ${shell.innerPad ?? ""}`}>
            <IconComponent className={`w-4 h-4 shrink-0 ${colorStyle.accent}`} />
            <span className="font-semibold text-sm text-slate-100 truncate flex-1">{data.title}</span>
            {hasImage && cardDensity !== "minimal" && (
              <button
                onClick={toggleViewMode}
                title={screenshotMode ? "Ver acciones" : "Ver captura"}
                className="text-slate-400 hover:text-slate-100 transition-colors nodrag"
              >
                {screenshotMode ? <ListTodo className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
              </button>
            )}
            {cardDensity !== "minimal" && (
              <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusStyle.badge}`}>
                {statusStyle.text}
              </span>
            )}
          </div>

          {screenshotMode ? (
            <>
              <img
                src={data.imageUrl}
                alt={data.title}
                className={`w-full max-h-[220px] object-contain bg-slate-800/40 ${shell.innerPad ?? ""}`}
              />
              {data.actions.length > 0 && cardDensity === "full" && (
                <div className={`flex flex-wrap gap-1 px-3 py-2 border-t border-slate-700/40 ${shell.innerPad ?? ""}`}>
                  {data.actions.map((action, idx) => (
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
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-300 border border-slate-700/50 hover:bg-violet-500/10 cursor-pointer"
                    >
                      <span className="text-slate-500">{idx + 1}.</span>
                      <span className="truncate max-w-[120px]">{action.label}</span>
                      {action.hasApi && <span className="text-amber-400 font-mono">·API</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {showDescription && (
                data.description ? (
                  <p className={`screen-node-desc px-3 py-2.5 text-[12.5px] leading-snug text-slate-200 border-b border-slate-700/40 whitespace-pre-line ${shell.innerPad ?? ""}`}>
                    {data.description}
                  </p>
                ) : cardDensity === "full" ? (
                  <p className={`screen-node-desc px-3 py-1.5 text-[11px] italic text-slate-600 border-b border-slate-700/40 ${shell.innerPad ?? ""}`}>
                    Sin descripción
                  </p>
                ) : null
              )}

              {showTags && data.tags.length > 0 && (
                <div className={`flex flex-wrap gap-1 px-3 py-1.5 border-b border-slate-700/40 ${shell.innerPad ?? ""}`}>
                  {data.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {showActions && (
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
                    </div>
                  ))}
                </div>
              )}

              {/* Actions count badge (compact/minimal density) */}
              {!showActions && !screenshotMode && data.actions.length > 0 && cardDensity === "compact" && (
                <div className="flex items-center gap-1 px-3 py-1.5 border-t border-slate-700/40">
                  <Zap className="w-3 h-3 text-slate-500" />
                  <span className="text-[11px] text-slate-400">
                    {data.actions.length} {data.actions.length === 1 ? "acción" : "acciones"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

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

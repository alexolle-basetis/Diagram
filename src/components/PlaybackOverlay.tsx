import { useReactFlow } from "@xyflow/react";
import { useDiagramStore } from "../store/useDiagramStore";
import { ArrowRight, Globe, MessageSquare, AlertCircle, LogOut, Lock, Sparkles } from "lucide-react";
import { unmetConditions, formatCondition, formatEffect } from "../utils/variables";

/**
 * Panel de acciones que aparece bajo el nodo activo durante el modo playback.
 * - Renderiza los `actions` como botones grandes.
 * - Acciones cuyas condiciones no se cumplen aparecen atenuadas y deshabilitadas
 *   con un tooltip listando las condiciones no satisfechas.
 * - Al elegir una acción, se aplican sus efectos (en el store) y se anima la
 *   cámara hacia el destino.
 */
export function PlaybackOverlay({ nodeId }: { nodeId: string }) {
  const screen = useDiagramStore((s) => s.getScreen(nodeId));
  const getApiCall = useDiagramStore((s) => s.getApiCall);
  const getScreen = useDiagramStore((s) => s.getScreen);
  const variables = useDiagramStore((s) => s.playback.variables);
  const advancePlayback = useDiagramStore((s) => s.advancePlayback);
  const stopPlayback = useDiagramStore((s) => s.stopPlayback);
  const { setCenter, getNode } = useReactFlow();

  if (!screen) return null;

  const handleChoose = (targetScreenId: string, actionId: string) => {
    const targetNode = getNode(targetScreenId);
    if (targetNode) {
      const x = targetNode.position.x + (targetNode.width ?? 280) / 2;
      const y = targetNode.position.y + (targetNode.height ?? 160) / 2;
      setCenter(x, y, { duration: 600, zoom: 1.1 });
    }
    setTimeout(() => advancePlayback(targetScreenId, actionId), 100);
  };

  return (
    <div className="nodrag absolute left-1/2 -translate-x-1/2 top-full mt-3 z-20 w-[340px] bg-slate-900/95 backdrop-blur border border-violet-500/40 rounded-xl shadow-2xl shadow-violet-500/20 p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          ¿Qué hacer en {screen.title}?
        </span>
        <button
          onClick={stopPlayback}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-100 transition-colors"
          title="Salir del playback (Esc)"
        >
          <LogOut className="w-3 h-3" /> Salir
        </button>
      </div>

      {screen.actions.length === 0 ? (
        <div className="text-xs text-slate-500 italic px-2 py-3 text-center">
          Este nodo no tiene acciones salientes. Pulsa Esc para salir.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
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

                    {/* Conditions preview (when blocked, show what's missing) */}
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

                    {/* Effects preview */}
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

                {/* Error path as secondary option */}
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

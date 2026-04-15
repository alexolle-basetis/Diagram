import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Variable as VariableIcon } from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import { collectVariables } from "../utils/variables";
import { ValueInput } from "./DetailPanel";

/**
 * Floating panel visible during playback. Lists all variables declared in the
 * diagram with their current values; each value is editable so the user can
 * simulate external side-effects on the fly. Also offers a button to reset all
 * variables to their defaults.
 *
 * Mounted by DiagramCanvas conditionally on `playback.active`.
 */
export function VariablesPanel() {
  const diagram = useDiagramStore((s) => s.diagram);
  const variables = useDiagramStore((s) => s.playback.variables);
  const setPlaybackVariable = useDiagramStore((s) => s.setPlaybackVariable);
  const resetPlaybackVariables = useDiagramStore((s) => s.resetPlaybackVariables);
  const [collapsed, setCollapsed] = useState(false);

  const defs = useMemo(() => collectVariables(diagram), [diagram]);

  if (defs.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-40 w-[280px] bg-slate-900/95 backdrop-blur border border-violet-500/30 rounded-xl shadow-2xl shadow-violet-500/10">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-700/60 rounded-t-xl">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 flex items-center gap-1.5 hover:opacity-80 transition-opacity"
        >
          <VariableIcon className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
            Estado ({defs.length})
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={resetPlaybackVariables}
            className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
            title="Restaurar valores por defecto"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
            title={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-1.5 max-h-[40vh] overflow-y-auto">
          {defs.map((def) => {
            const current = variables[def.name];
            const isModified = current !== def.defaultValue;
            return (
              <div key={def.name} className="flex items-center gap-1.5 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`text-[11px] font-mono truncate ${isModified ? "text-fuchsia-300" : "text-slate-300"}`}>
                      {def.name}
                    </span>
                    <span className="text-[9px] text-slate-600">{def.type}</span>
                    {isModified && (
                      <span className="text-[9px] text-fuchsia-400" title="Modificado respecto al default">●</span>
                    )}
                  </div>
                  {def.description && (
                    <div className="text-[9px] text-slate-500 truncate">{def.description}</div>
                  )}
                </div>
                <div className="w-[100px] shrink-0">
                  <ValueInput
                    def={def}
                    value={current}
                    onChange={(v) => setPlaybackVariable(def.name, v)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback } from "react";
import { Play, AlertTriangle, FileJson, AlertCircle } from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";

export function JsonEditor() {
  const jsonText = useDiagramStore((s) => s.jsonText);
  const parseError = useDiagramStore((s) => s.parseError);
  const validationErrors = useDiagramStore((s) => s.validationErrors);
  const setJsonText = useDiagramStore((s) => s.setJsonText);
  const applyJson = useDiagramStore((s) => s.applyJson);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        applyJson();
      }
      // Tab support in textarea
      if (e.key === "Tab") {
        e.preventDefault();
        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newValue = jsonText.substring(0, start) + "  " + jsonText.substring(end);
        setJsonText(newValue);
        requestAnimationFrame(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        });
      }
    },
    [applyJson, jsonText, setJsonText]
  );

  const errors = validationErrors.filter((e) => e.type === "error");
  const warnings = validationErrors.filter((e) => e.type === "warning");

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            JSON
          </span>
        </div>
        <button
          onClick={applyJson}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors"
        >
          <Play className="w-3 h-3" />
          Aplicar
          <kbd className="ml-1 text-[10px] opacity-70">⌘↵</kbd>
        </button>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-xs shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span className="font-mono">{parseError}</span>
        </div>
      )}

      {/* Validation errors */}
      {(errors.length > 0 || warnings.length > 0) && (
        <div className="max-h-28 overflow-y-auto border-b border-slate-700/50 shrink-0">
          {errors.map((e, i) => (
            <div key={`e-${i}`} className="flex items-start gap-2 px-3 py-1 text-[11px] text-red-400">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{e.message}</span>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div key={`w-${i}`} className="flex items-start gap-2 px-3 py-1 text-[11px] text-amber-400">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="flex-1 w-full resize-none bg-slate-950 text-slate-300 font-mono text-xs leading-relaxed p-3 outline-none placeholder:text-slate-600"
        placeholder="Pega tu JSON aquí..."
      />
    </div>
  );
}

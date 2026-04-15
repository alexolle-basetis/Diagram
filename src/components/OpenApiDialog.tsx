import { useState, useRef } from "react";
import { X, Upload, Link as LinkIcon, Loader2, FileJson, Trash2, BookOpen } from "lucide-react";
import { loadFromUrl, loadFromFile, extractEndpoints } from "../lib/openApiService";
import type { OpenApiRef } from "../types/diagram";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Current loaded ref (may be null). */
  value: OpenApiRef | null | undefined;
  /** Called with a new ref, or null to remove. */
  onChange: (ref: OpenApiRef | null) => void;
  /** Optional title override (e.g. "OpenAPI de este nodo"). */
  title?: string;
}

/**
 * Modal to load an OpenAPI 3 spec either from a URL or an uploaded file.
 * Used for both the diagram-global spec and per-node specs on external-api cards.
 */
export function OpenApiDialog({ open, onClose, value, onChange, title }: Props) {
  const [tab, setTab] = useState<"url" | "file">("url");
  const [url, setUrl] = useState(value?.url ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const endpoints = extractEndpoints(value);

  const handleLoadUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const ref = await loadFromUrl(url.trim());
      onChange(ref);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const ref = await loadFromFile(file);
      onChange(ref);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const handleRemove = () => {
    onChange(null);
    setUrl("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-slate-100">{title ?? "OpenAPI Spec"}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {value ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <FileJson className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {value.title ?? "Spec sin título"}
                  </div>
                  {value.version && (
                    <div className="text-[10px] text-slate-400">Versión {value.version}</div>
                  )}
                  <div className="text-[10px] text-slate-500 truncate">
                    {value.source === "url" ? value.url : value.fileName}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1">
                    {endpoints.length} endpoint{endpoints.length === 1 ? "" : "s"} disponibles
                  </div>
                </div>
                <button
                  onClick={handleRemove}
                  className="text-slate-400 hover:text-red-400 transition-colors"
                  title="Quitar spec"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Carga una especificación OpenAPI 3 para autocompletar endpoints en las llamadas API.
              Soporta JSON y YAML.
            </p>
          )}

          <div className="flex gap-1 border-b border-slate-700">
            {(["url", "file"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  tab === t
                    ? "text-violet-400 border-violet-500"
                    : "text-slate-500 border-transparent hover:text-slate-300"
                }`}
              >
                {t === "url" ? <LinkIcon className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                {t === "url" ? "Desde URL" : "Desde archivo"}
              </button>
            ))}
          </div>

          {tab === "url" && (
            <div className="space-y-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://ejemplo.com/openapi.json"
                className="input-field text-xs font-mono"
                onKeyDown={(e) => { if (e.key === "Enter") handleLoadUrl(); }}
              />
              <button
                onClick={handleLoadUrl}
                disabled={loading || !url.trim()}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-violet-600 text-white rounded-md hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
                Cargar spec
              </button>
            </div>
          )}

          {tab === "file" && (
            <div className="space-y-2">
              <button
                onClick={() => fileInput.current?.click()}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-slate-700 rounded-lg text-sm text-slate-400 hover:border-violet-500 hover:text-violet-400 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Selecciona archivo .json / .yaml / .yml
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md p-2">
              {error}
            </div>
          )}

          {value && endpoints.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Endpoints detectados ({endpoints.length})
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-0.5 text-[11px]">
                {endpoints.slice(0, 50).map((ep, i) => (
                  <div key={i} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-slate-800/60 font-mono">
                    <span className={`font-bold shrink-0 ${
                      ep.method === "GET" ? "text-emerald-400" :
                      ep.method === "POST" ? "text-blue-400" :
                      ep.method === "DELETE" ? "text-red-400" : "text-amber-400"
                    }`}>{ep.method}</span>
                    <span className="text-slate-300 truncate">{ep.path}</span>
                    {ep.summary && <span className="text-slate-500 truncate ml-auto text-[10px] font-sans">{ep.summary}</span>}
                  </div>
                ))}
                {endpoints.length > 50 && (
                  <div className="text-center text-[10px] text-slate-500 py-1">
                    … y {endpoints.length - 50} más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

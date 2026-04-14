import { useState, useRef, useCallback, useEffect } from "react";
import {
  X, Monitor, Globe, ArrowRight, Plus, Trash2, Copy, Check,
  AlertCircle, Upload, ImageIcon,
} from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import { generateCurl } from "../utils/exportUtils";
import { compressImage } from "../utils/imageUtils";
import type { ScreenStatus, ScreenColor } from "../types/diagram";
import { STATUS_COLORS, SCREEN_COLORS } from "../utils/layoutEngine";

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;
const STORAGE_KEY_WIDTH = "detail-panel-width";

function loadWidth(): number {
  const v = localStorage.getItem(STORAGE_KEY_WIDTH);
  return v ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(v))) : 420;
}

export function DetailPanel() {
  const selection = useDiagramStore((s) => s.selection);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const [width, setWidth] = useState(loadWidth);

  // Persist width
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_WIDTH, String(width));
  }, [width]);

  // Drag resize
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = width;

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width]
  );

  if (selection.kind === "none") return null;

  return (
    <div
      className="absolute top-0 right-0 h-full bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex overflow-hidden"
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleDragStart}
        className="w-1.5 h-full cursor-col-resize shrink-0 hover:bg-violet-500/30 active:bg-violet-500/50 transition-colors"
      />

      {/* Panel content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {selection.kind === "screen" ? (
              <Monitor className="w-4 h-4 text-violet-400 shrink-0" />
            ) : (
              <Globe className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="text-sm font-semibold text-slate-100 truncate">
              {selection.kind === "screen" ? "Pantalla" : "Conexión"}
            </span>
          </div>
          <button
            onClick={clearSelection}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selection.kind === "screen" && <ScreenEditor screenId={selection.screenId} />}
          {selection.kind === "edge" && (
            <EdgeEditor
              actionId={selection.actionId}
              sourceScreenId={selection.sourceScreenId}
              targetScreenId={selection.targetScreenId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Screen Editor ────────────────────────────────────────────────────
function ScreenEditor({ screenId }: { screenId: string }) {
  const screen = useDiagramStore((s) => s.getScreen(screenId));
  const updateScreen = useDiagramStore((s) => s.updateScreen);
  const deleteScreen = useDiagramStore((s) => s.deleteScreen);
  const addAction = useDiagramStore((s) => s.addAction);
  const updateAction = useDiagramStore((s) => s.updateAction);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const diagram = useDiagramStore((s) => s.diagram);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const getApiCall = useDiagramStore((s) => s.getApiCall);
  const setApiCall = useDiagramStore((s) => s.setApiCall);

  if (!screen) return <p className="text-sm text-slate-500">Pantalla no encontrada</p>;

  const screenOptions = diagram.screens.filter((s) => s.id !== screenId);

  return (
    <>
      {/* Title */}
      <Field label="Título">
        <input
          value={screen.title}
          onChange={(e) => updateScreen(screenId, { title: e.target.value })}
          className="input-field"
        />
      </Field>

      {/* Description */}
      <Field label="Descripción">
        <textarea
          value={screen.description}
          onChange={(e) => updateScreen(screenId, { description: e.target.value })}
          rows={2}
          className="input-field resize-none"
        />
      </Field>

      {/* Status */}
      <Field label="Estado">
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(STATUS_COLORS) as ScreenStatus[]).map((status) => {
            const style = STATUS_COLORS[status];
            const active = screen.status === status || (!screen.status && status === "pending");
            return (
              <button
                key={status}
                onClick={() => updateScreen(screenId, { status })}
                className={`
                  text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all
                  ${active ? `${style.badge} border-current` : "text-slate-500 bg-slate-800 border-slate-700 hover:border-slate-500"}
                `}
              >
                {style.text}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Tags */}
      <Field label="Tags">
        <TagEditor
          tags={screen.tags ?? []}
          onChange={(tags) => updateScreen(screenId, { tags })}
        />
      </Field>

      {/* Docs */}
      <Field label="Documentación">
        <textarea
          value={screen.docs ?? ""}
          onChange={(e) => updateScreen(screenId, { docs: e.target.value })}
          rows={4}
          className="input-field resize-y font-mono text-xs"
          placeholder="Markdown o notas técnicas..."
        />
      </Field>

      {/* Color */}
      <Field label="Color">
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(SCREEN_COLORS) as ScreenColor[]).map((c) => {
            const active = (screen.color ?? "slate") === c;
            return (
              <button
                key={c}
                onClick={() => updateScreen(screenId, { color: c })}
                className={`w-7 h-7 rounded-md border-2 transition-all ${SCREEN_COLORS[c].header} ${
                  active ? "border-white scale-110" : "border-transparent hover:border-slate-500"
                }`}
                title={c}
              />
            );
          })}
        </div>
      </Field>

      {/* Image */}
      <Field label="Imagen">
        <ImageUploader
          imageUrl={screen.imageUrl}
          onChange={(url) => updateScreen(screenId, { imageUrl: url || undefined })}
        />
      </Field>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Acciones ({screen.actions.length})
          </h3>
          <button
            onClick={() => addAction(screenId)}
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Plus className="w-3 h-3" /> Añadir
          </button>
        </div>
        <div className="space-y-2">
          {screen.actions.map((action) => {
            const hasApi = !!getApiCall(action.id);
            return (
              <div key={action.id} className="bg-slate-800 rounded-lg border border-slate-700/50 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={action.label}
                    onChange={(e) => updateAction(screenId, action.id, { label: e.target.value })}
                    className="input-field flex-1 !py-1 text-xs"
                    placeholder="Nombre de la acción"
                  />
                  <button
                    onClick={() => deleteAction(screenId, action.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    title="Eliminar acción"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 shrink-0">Destino:</span>
                  <select
                    value={action.targetScreen}
                    onChange={(e) => updateAction(screenId, action.id, { targetScreen: e.target.value })}
                    className="input-field flex-1 !py-1 text-xs"
                  >
                    <option value={screenId}>{screen.title} (self)</option>
                    {screenOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 shrink-0 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-red-400" /> Error:
                  </span>
                  <select
                    value={action.errorTargetScreen ?? ""}
                    onChange={(e) => updateAction(screenId, action.id, { errorTargetScreen: e.target.value || undefined })}
                    className="input-field flex-1 !py-1 text-xs"
                  >
                    <option value="">Sin flujo de error</option>
                    {diagram.screens.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>

                {/* Note */}
                <input
                  value={action.note ?? ""}
                  onChange={(e) => updateAction(screenId, action.id, { note: e.target.value || undefined })}
                  className="input-field !py-1 text-xs text-sky-300"
                  placeholder="Nota o comentario sobre la transición..."
                />

                {!hasApi ? (
                  <button
                    onClick={() => setApiCall({ actionId: action.id, method: "GET", endpoint: "/api/v1/" })}
                    className="flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors"
                  >
                    <Globe className="w-3 h-3" /> Añadir API Call
                  </button>
                ) : (
                  <button
                    onClick={() => setSelection({ kind: "edge", actionId: action.id, sourceScreenId: screenId, targetScreenId: action.targetScreen })}
                    className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <Globe className="w-3 h-3" /> Ver/Editar API Call
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => { if (confirm("¿Eliminar esta pantalla y todas sus conexiones?")) deleteScreen(screenId); }}
        className="flex items-center justify-center gap-2 w-full py-2 mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Eliminar pantalla
      </button>
    </>
  );
}

// ── Edge / API Editor ────────────────────────────────────────────────
function EdgeEditor({
  actionId,
  sourceScreenId,
  targetScreenId,
}: {
  actionId: string;
  sourceScreenId: string;
  targetScreenId: string;
}) {
  const sourceScreen = useDiagramStore((s) => s.getScreen(sourceScreenId));
  const targetScreen = useDiagramStore((s) => s.getScreen(targetScreenId));
  const apiCall = useDiagramStore((s) => s.getApiCall(actionId));
  const updateApiCall = useDiagramStore((s) => s.updateApiCall);
  const setApiCall = useDiagramStore((s) => s.setApiCall);
  const deleteApiCall = useDiagramStore((s) => s.deleteApiCall);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const updateAction = useDiagramStore((s) => s.updateAction);
  const action = sourceScreen?.actions.find((a) => a.id === actionId);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [activeTab, setActiveTab] = useState<"response" | "error" | "headers">("response");

  if (!sourceScreen || !action) return <p className="text-sm text-slate-500">Conexión no encontrada</p>;

  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  const handleCopyCurl = () => {
    if (!apiCall) return;
    navigator.clipboard.writeText(generateCurl(apiCall));
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 rounded-lg p-3 border border-slate-700/50">
        <span className="text-violet-400 font-medium">{sourceScreen.title}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
        <span className="text-slate-500 italic truncate">{action.label}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
        <span className="text-violet-400 font-medium">{targetScreen?.title ?? "?"}</span>
      </div>

      {/* Note */}
      <Field label="Nota / Comentario">
        <textarea
          value={action.note ?? ""}
          onChange={(e) => updateAction(sourceScreenId, actionId, { note: e.target.value || undefined })}
          rows={2}
          className="input-field resize-y text-xs text-sky-300"
          placeholder="Explica la transición, condiciones, notas técnicas..."
        />
      </Field>

      {!apiCall ? (
        <button
          onClick={() => setApiCall({ actionId, method: "GET", endpoint: "/api/v1/" })}
          className="flex items-center justify-center gap-2 w-full py-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
        >
          <Globe className="w-4 h-4" /> Añadir API Call a esta conexión
        </button>
      ) : (
        <>
          <Field label="Endpoint">
            <div className="flex gap-2">
              <select
                value={apiCall.method}
                onChange={(e) => updateApiCall(actionId, { method: e.target.value })}
                className="input-field w-24 !py-1.5 text-xs font-mono font-bold"
              >
                {methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                value={apiCall.endpoint}
                onChange={(e) => updateApiCall(actionId, { endpoint: e.target.value })}
                className="input-field flex-1 !py-1.5 font-mono text-xs text-amber-200"
                placeholder="/api/v1/..."
              />
            </div>
          </Field>

          <Field label="Status Code">
            <input
              type="number"
              value={apiCall.statusCode ?? ""}
              onChange={(e) => updateApiCall(actionId, { statusCode: e.target.value ? Number(e.target.value) : undefined })}
              className="input-field w-24 !py-1.5 text-xs font-mono"
              placeholder="200"
            />
          </Field>

          <Field label={<><ArrowRight className="w-3 h-3 inline mr-1" />Request Body</>}>
            <textarea
              value={apiCall.requestBody ?? ""}
              onChange={(e) => updateApiCall(actionId, { requestBody: e.target.value || undefined })}
              rows={4}
              className="input-field resize-y font-mono text-xs text-emerald-300"
              placeholder='{ "key": "value" }'
            />
          </Field>

          <div>
            <div className="flex gap-1 mb-2">
              {(["response", "error", "headers"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeTab === tab ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {tab === "response" ? "Response OK" : tab === "error" ? "Error" : "Headers"}
                </button>
              ))}
            </div>

            {activeTab === "response" && (
              <textarea
                value={apiCall.responsePayload ?? ""}
                onChange={(e) => updateApiCall(actionId, { responsePayload: e.target.value || undefined })}
                rows={5}
                className="input-field resize-y font-mono text-xs text-sky-300 w-full"
                placeholder='{ "data": "..." }'
              />
            )}
            {activeTab === "error" && (
              <textarea
                value={apiCall.errorPayload ?? ""}
                onChange={(e) => updateApiCall(actionId, { errorPayload: e.target.value || undefined })}
                rows={5}
                className="input-field resize-y font-mono text-xs text-red-300 w-full"
                placeholder='{ "error": "..." }'
              />
            )}
            {activeTab === "headers" && (
              <HeadersEditor
                headers={apiCall.headers ?? {}}
                onChange={(headers) => updateApiCall(actionId, { headers: Object.keys(headers).length > 0 ? headers : undefined })}
              />
            )}
          </div>

          <button
            onClick={handleCopyCurl}
            className="flex items-center gap-2 w-full py-2 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
          >
            {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCurl ? "¡Copiado!" : "Copiar como cURL"}
          </button>

          <button
            onClick={() => deleteApiCall(actionId)}
            className="flex items-center justify-center gap-2 w-full py-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Quitar API Call
          </button>
        </>
      )}

      <button
        onClick={() => { if (confirm("¿Eliminar esta conexión?")) deleteAction(sourceScreenId, actionId); }}
        className="flex items-center justify-center gap-2 w-full py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Eliminar conexión
      </button>
    </>
  );
}

// ── Image Uploader ───────────────────────────────────────────────────
function ImageUploader({
  imageUrl,
  onChange,
}: {
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const dataUrl = await compressImage(file);
      onChange(dataUrl);
    } catch {
      console.error("Failed to compress image");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={imageUrl?.startsWith("data:") ? "(imagen embebida)" : imageUrl ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="input-field flex-1 text-xs"
          placeholder="https://... o sube una imagen"
          readOnly={imageUrl?.startsWith("data:")}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md text-slate-300 hover:bg-slate-700 transition-colors shrink-0"
        >
          <Upload className="w-3 h-3" />
          {loading ? "..." : "Subir"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview */}
      {imageUrl && (
        <div className="relative group">
          <img
            src={imageUrl}
            alt="Preview"
            className="w-full rounded-lg border border-slate-700 max-h-60 object-contain bg-slate-800"
          />
          <button
            onClick={() => onChange(undefined)}
            className="absolute top-2 right-2 p-1 bg-slate-900/80 rounded-md text-slate-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {imageUrl.startsWith("data:") && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-slate-900/80 rounded text-[10px] text-slate-400">
              <ImageIcon className="w-3 h-3" /> Embebida
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reusable sub-components ──────────────────────────────────────────
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{label}</h3>
      {children}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInput("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">
          {tag}
          <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-red-300 transition-colors">
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        className="bg-transparent text-xs text-slate-300 outline-none w-16 placeholder:text-slate-600"
        placeholder="+ tag"
      />
    </div>
  );
}

function HeadersEditor({ headers, onChange }: { headers: Record<string, string>; onChange: (h: Record<string, string>) => void }) {
  const entries = Object.entries(headers);

  const updateKey = (oldKey: string, newKey: string) => {
    const value = headers[oldKey];
    const h = { ...headers };
    delete h[oldKey];
    if (newKey) h[newKey] = value;
    onChange(h);
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={key} onChange={(e) => updateKey(key, e.target.value)} className="input-field flex-1 !py-1 text-xs font-mono" placeholder="Header-Name" />
          <input value={value} onChange={(e) => onChange({ ...headers, [key]: e.target.value })} className="input-field flex-1 !py-1 text-xs font-mono" placeholder="value" />
          <button onClick={() => { const h = { ...headers }; delete h[key]; onChange(h); }} className="p-1 text-slate-500 hover:text-red-400">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange({ ...headers, "": "" })} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
        <Plus className="w-3 h-3" /> Añadir header
      </button>
    </div>
  );
}

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  X, Monitor, Globe, ArrowRight, Plus, Trash2, Copy, Check,
  AlertCircle, Upload, ImageIcon, Pencil, Eye, ChevronDown, ChevronRight,
  BookOpen, Lock, Sparkles, Variable as VariableIcon, CopyCheck,
  Info, Palette, Zap as ZapIcon,
} from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import { generateCurl } from "../utils/exportUtils";
import { compressImage } from "../utils/imageUtils";
import { extractEndpoints, resolveSpecForAction, sampleResponseFor } from "../lib/openApiService";
import { Markdown } from "./Markdown";
import { OpenApiDialog } from "./OpenApiDialog";
import type { ScreenStatus, ScreenColor, ScreenIcon, NodeKind, VarDef, VarType, VarValue, Condition, Effect, CondOp } from "../types/diagram";
import { collectVariables } from "../utils/variables";
import { STATUS_COLORS, SCREEN_COLORS, SCREEN_ICONS, KIND_DEFAULTS } from "../utils/layoutEngine";

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
  const deleteScreen = useDiagramStore((s) => s.deleteScreen);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const diagram = useDiagramStore((s) => s.diagram);
  const [width, setWidth] = useState(loadWidth);

  const handleDelete = () => {
    if (selection.kind === "screen") {
      if (confirm("¿Eliminar esta pantalla y todas sus conexiones?")) {
        deleteScreen(selection.screenId);
      }
    } else if (selection.kind === "multi-screen") {
      if (confirm(`¿Eliminar las ${selection.screenIds.length} pantallas seleccionadas y todas sus conexiones?`)) {
        for (const id of selection.screenIds) deleteScreen(id);
        clearSelection();
      }
    } else if (selection.kind === "edge") {
      // Resolve source from the actionId in case sourceScreenId was a placeholder
      const source = selection.sourceScreenId
        || diagram.screens.find((s) => s.actions.some((a) => a.id === selection.actionId))?.id;
      if (!source) return;
      if (confirm("¿Eliminar esta conexión?")) {
        deleteAction(source, selection.actionId);
      }
    }
  };

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
      className="detail-panel absolute top-0 right-0 h-full bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex overflow-hidden"
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
            {selection.kind === "screen" && <Monitor className="w-4 h-4 text-violet-400 shrink-0" />}
            {selection.kind === "multi-screen" && <CopyCheck className="w-4 h-4 text-violet-400 shrink-0" />}
            {selection.kind === "edge" && <Globe className="w-4 h-4 text-amber-400 shrink-0" />}
            <span className="text-sm font-semibold text-slate-100 truncate">
              {selection.kind === "screen" && "Pantalla"}
              {selection.kind === "multi-screen" && `${selection.screenIds.length} pantallas seleccionadas`}
              {selection.kind === "edge" && "Conexión"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              className="p-1 rounded hover:bg-red-500/15 text-slate-400 hover:text-red-400 transition-colors"
              title={
                selection.kind === "edge" ? "Eliminar conexión" :
                selection.kind === "multi-screen" ? "Eliminar las seleccionadas" :
                "Eliminar pantalla"
              }
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={clearSelection}
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selection.kind === "screen" && <ScreenEditor screenId={selection.screenId} />}
          {selection.kind === "multi-screen" && (
            <MultiScreenEditor screenIds={selection.screenIds} />
          )}
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
  const addAction = useDiagramStore((s) => s.addAction);
  const updateAction = useDiagramStore((s) => s.updateAction);
  const deleteAction = useDiagramStore((s) => s.deleteAction);
  const diagram = useDiagramStore((s) => s.diagram);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const getApiCall = useDiagramStore((s) => s.getApiCall);
  const setApiCall = useDiagramStore((s) => s.setApiCall);
  const setScreenOpenApi = useDiagramStore((s) => s.setScreenOpenApi);
  const [openApiDialogOpen, setOpenApiDialogOpen] = useState(false);
  const [screenTab, setScreenTab] = useState<"info" | "style" | "behavior" | "actions">("info");

  if (!screen) return <p className="text-sm text-slate-500">Pantalla no encontrada</p>;

  const screenOptions = diagram.screens.filter((s) => s.id !== screenId);
  const currentKind = screen.kind ?? "screen";

  const handleKindChange = (kind: NodeKind) => {
    const defaults = KIND_DEFAULTS[kind];
    // If the user hadn't customized icon/color, apply sensible defaults for the new kind.
    const patch: Parameters<typeof updateScreen>[1] = { kind };
    if (!screen.icon) patch.icon = defaults.icon;
    if (!screen.color) patch.color = defaults.color;
    updateScreen(screenId, patch);
  };

  return (
    <>
      {/* Title — always visible (no tab) for quick edit */}
      <input
        value={screen.title}
        onChange={(e) => updateScreen(screenId, { title: e.target.value })}
        className="input-field !py-1.5 text-sm font-semibold text-slate-100"
        placeholder="Título"
      />

      <TabBar
        active={screenTab}
        onChange={setScreenTab}
        tabs={[
          { id: "info",       label: "Info",     icon: Info },
          { id: "style",      label: "Estética", icon: Palette },
          { id: "behavior",   label: "Variables", icon: VariableIcon, badge: screen.variables?.length },
          { id: "actions",    label: "Acciones", icon: ZapIcon, badge: screen.actions.length },
        ]}
      />

      {screenTab === "info" && (
        <>
          <MarkdownField
            label="Descripción"
            value={screen.description}
            onChange={(v) => updateScreen(screenId, { description: v })}
            placeholder="Descripción de la pantalla..."
            rows={2}
          />
          <Field label="Estado">
            <div className="flex gap-1.5 flex-wrap">
              {(Object.keys(STATUS_COLORS) as ScreenStatus[]).map((status) => {
                const style = STATUS_COLORS[status];
                const active = screen.status === status || (!screen.status && status === "pending");
                return (
                  <button
                    key={status}
                    onClick={() => updateScreen(screenId, { status })}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
                      active ? `${style.badge} border-current` : "text-slate-500 bg-slate-800 border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    {style.text}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Tags">
            <TagEditor tags={screen.tags ?? []} onChange={(tags) => updateScreen(screenId, { tags })} />
          </Field>
          <MarkdownField
            label="Documentación"
            value={screen.docs ?? ""}
            onChange={(v) => updateScreen(screenId, { docs: v })}
            placeholder="Soporta **Markdown**: títulos, listas, código..."
            rows={14}
            minHeight={300}
          />
        </>
      )}

      {screenTab === "style" && (
        <>
          <Field label="Tipo de nodo">
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(KIND_DEFAULTS) as NodeKind[]).map((k) => {
                const def = KIND_DEFAULTS[k];
                const Ic = SCREEN_ICONS[def.icon].icon;
                const active = currentKind === k;
                return (
                  <button
                    key={k}
                    onClick={() => handleKindChange(k)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-all text-[10px] ${
                      active
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                    }`}
                    title={def.label}
                  >
                    <Ic className="w-4 h-4" />
                    <span className="truncate w-full px-1 text-center">{def.label}</span>
                  </button>
                );
              })}
            </div>
          </Field>
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
          <Field label="Icono">
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(SCREEN_ICONS) as ScreenIcon[]).map((key) => {
                const { icon: Ic, label } = SCREEN_ICONS[key];
                const active = (screen.icon ?? "monitor") === key;
                return (
                  <button
                    key={key}
                    onClick={() => updateScreen(screenId, { icon: key })}
                    className={`p-1.5 rounded-md border transition-all ${
                      active
                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                        : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                    }`}
                    title={label}
                  >
                    <Ic className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Imagen">
            <ImageUploader
              imageUrl={screen.imageUrl}
              onChange={(url) => updateScreen(screenId, { imageUrl: url || undefined })}
            />
          </Field>
        </>
      )}

      {screenTab === "behavior" && (
        <>
          {currentKind === "external-api" && (
            <Field label="OpenAPI de este nodo">
              <button
                onClick={() => setOpenApiDialogOpen(true)}
                className={`flex items-center gap-2 w-full py-2 px-3 text-xs rounded-md border transition-colors ${
                  screen.openApi
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                {screen.openApi
                  ? <span className="truncate flex-1 text-left">{screen.openApi.title ?? "Spec cargada"}</span>
                  : <span>Cargar OpenAPI para este nodo</span>
                }
              </button>
              {openApiDialogOpen && (
                <OpenApiDialog
                  open={openApiDialogOpen}
                  onClose={() => setOpenApiDialogOpen(false)}
                  value={screen.openApi}
                  onChange={(ref) => setScreenOpenApi(screenId, ref)}
                  title={`OpenAPI de "${screen.title}"`}
                />
              )}
            </Field>
          )}
          <VariablesEditor
            variables={screen.variables ?? []}
            onChange={(vars) => updateScreen(screenId, { variables: vars.length > 0 ? vars : undefined })}
          />
        </>
      )}

      {screenTab === "actions" && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {screen.actions.length === 0 ? "Sin acciones" : `${screen.actions.length} accion${screen.actions.length === 1 ? "" : "es"}`}
            </h3>
            <button
              onClick={() => addAction(screenId)}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> Añadir
            </button>
          </div>
          <div className="space-y-2">
            {screen.actions.map((action) => (
              <CollapsibleAction
                key={action.id}
                action={action}
                screenId={screenId}
                screenTitle={screen.title}
                screenOptions={screenOptions}
                allScreens={diagram.screens}
                hasApi={!!getApiCall(action.id)}
                onUpdate={(patch) => updateAction(screenId, action.id, patch)}
                onDelete={() => deleteAction(screenId, action.id)}
                onAddApi={() => setApiCall({ actionId: action.id, method: "GET", endpoint: "/api/v1/" })}
                onViewApi={() => setSelection({ kind: "edge", actionId: action.id, sourceScreenId: screenId, targetScreenId: action.targetScreen })}
              />
            ))}
          </div>
        </div>
      )}
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
  const diagram = useDiagramStore((s) => s.diagram);
  // The action selected from a screen-card row may not include targetScreenId — resolve from the action itself.
  const actionForTarget = sourceScreen?.actions.find((a) => a.id === actionId);
  const resolvedTargetId = targetScreenId || actionForTarget?.targetScreen || "";
  const targetScreen = useDiagramStore((s) => s.getScreen(resolvedTargetId));
  const apiCall = useDiagramStore((s) => s.getApiCall(actionId));
  const updateApiCall = useDiagramStore((s) => s.updateApiCall);
  const setApiCall = useDiagramStore((s) => s.setApiCall);
  const deleteApiCall = useDiagramStore((s) => s.deleteApiCall);
  const updateAction = useDiagramStore((s) => s.updateAction);
  const action = sourceScreen?.actions.find((a) => a.id === actionId);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [activeTab, setActiveTab] = useState<"response" | "error" | "headers">("response");
  const [edgeTab, setEdgeTab] = useState<"general" | "api">("general");

  // Resolve the OpenAPI spec that applies to this action (per-node wins over global)
  const resolvedSpec = useMemo(
    () => resolveSpecForAction(diagram, sourceScreen, targetScreen),
    [diagram, sourceScreen, targetScreen]
  );
  const endpoints = useMemo(() => extractEndpoints(resolvedSpec), [resolvedSpec]);
  const datalistId = `endpoints-${actionId}`;

  // When user types/selects an endpoint that matches the spec, also sync method.
  const handleEndpointChange = (newEndpoint: string) => {
    if (!apiCall) return;
    const match = endpoints.find((e) => e.path === newEndpoint);
    if (match) {
      // Auto-fill method and, if available, a sample response.
      const sample = sampleResponseFor(resolvedSpec, match.method, match.path, apiCall.statusCode ?? 200);
      updateApiCall(actionId, {
        endpoint: newEndpoint,
        method: match.method,
        ...(sample && !apiCall.responsePayload ? { responsePayload: sample } : {}),
      });
    } else {
      updateApiCall(actionId, { endpoint: newEndpoint });
    }
  };

  if (!sourceScreen || !action) return <p className="text-sm text-slate-500">Conexión no encontrada</p>;

  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  const handleCopyCurl = () => {
    if (!apiCall) return;
    navigator.clipboard.writeText(generateCurl(apiCall));
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const conditionsCount = action.conditions?.length ?? 0;
  const effectsCount = action.effects?.length ?? 0;
  const behaviorBadge = conditionsCount + effectsCount;

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 rounded-lg p-3 border border-slate-700/50">
        <span className="text-violet-400 font-medium">{sourceScreen.title}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
        <span className="text-slate-500 italic truncate">{action.label}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
        <span className="text-violet-400 font-medium">{targetScreen?.title ?? "?"}</span>
      </div>

      <TabBar
        active={edgeTab}
        onChange={setEdgeTab}
        tabs={[
          { id: "general", label: "General",       icon: Info,     badge: behaviorBadge || undefined },
          { id: "api",     label: apiCall ? "API Call" : "+ API",   icon: Globe,    badge: apiCall ? 1 : undefined },
        ]}
      />

      {edgeTab === "general" && (
        <>
          <MarkdownField
            label="Nota / Comentario"
            value={action.note ?? ""}
            onChange={(v) => updateAction(sourceScreenId, actionId, { note: v || undefined })}
            placeholder="Soporta **Markdown**: explica la transición..."
            rows={3}
          />
          <ConditionsEditor
            conditions={action.conditions ?? []}
            onChange={(c) => updateAction(sourceScreenId, actionId, { conditions: c.length > 0 ? c : undefined })}
            availableVars={collectVariables(diagram)}
          />
          <EffectsEditor
            effects={action.effects ?? []}
            onChange={(e) => updateAction(sourceScreenId, actionId, { effects: e.length > 0 ? e : undefined })}
            availableVars={collectVariables(diagram)}
          />
        </>
      )}

      {edgeTab === "api" && (!apiCall ? (
        <button
          onClick={() => setApiCall({ actionId, method: "GET", endpoint: "/api/v1/" })}
          className="flex items-center justify-center gap-2 w-full py-3 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors"
        >
          <Globe className="w-4 h-4" /> Añadir API Call a esta conexión
        </button>
      ) : (
        <>
          <Field label={endpoints.length > 0
            ? <span className="flex items-center gap-1">Endpoint <span className="text-[9px] text-emerald-400 font-mono normal-case">· {endpoints.length} sugerencias OpenAPI</span></span>
            : "Endpoint"
          }>
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
                onChange={(e) => handleEndpointChange(e.target.value)}
                list={endpoints.length > 0 ? datalistId : undefined}
                className="input-field flex-1 !py-1.5 font-mono text-xs text-amber-200"
                placeholder="/api/v1/..."
              />
              {endpoints.length > 0 && (
                <datalist id={datalistId}>
                  {endpoints.map((ep, i) => (
                    <option key={i} value={ep.path}>
                      {ep.method} {ep.summary ?? ep.operationId ?? ""}
                    </option>
                  ))}
                </datalist>
              )}
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
      ))}
    </>
  );
}

// ── Multi-Screen Editor (bulk edit) ──────────────────────────────────
function MultiScreenEditor({ screenIds }: { screenIds: string[] }) {
  // IMPORTANT: derive the filtered list with useMemo OUTSIDE of the Zustand
  // selector. Returning a new array from the selector breaks getSnapshot
  // caching and triggers an infinite-loop warning + crash.
  const allScreens = useDiagramStore((s) => s.diagram.screens);
  const updateScreen = useDiagramStore((s) => s.updateScreen);
  const screenIdSet = useMemo(() => new Set(screenIds), [screenIds]);
  const screens = useMemo(
    () => allScreens.filter((sc) => screenIdSet.has(sc.id)),
    [allScreens, screenIdSet]
  );

  if (screens.length === 0) {
    return <p className="text-sm text-slate-500">No hay pantallas seleccionadas.</p>;
  }

  // Compute "common value" for each field, or undefined if mixed
  const commonValue = <K extends keyof import("../types/diagram").Screen>(key: K) => {
    const first = screens[0][key];
    return screens.every((s) => s[key] === first) ? first : undefined;
  };

  const commonKind = (commonValue("kind") ?? "screen") as NodeKind;
  const commonStatus = commonValue("status") as ScreenStatus | undefined;
  const commonColor = commonValue("color") as ScreenColor | undefined;
  const commonIcon = commonValue("icon") as ScreenIcon | undefined;

  const applyToAll = <K extends keyof import("../types/diagram").Screen>(key: K, value: import("../types/diagram").Screen[K]) => {
    for (const s of screens) {
      updateScreen(s.id, { [key]: value } as Partial<import("../types/diagram").Screen>);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
        <div className="text-xs text-violet-300 font-semibold mb-1">Edición múltiple</div>
        <div className="text-[11px] text-slate-400">
          Los cambios se aplican a las {screens.length} pantallas seleccionadas. Mantén Shift y haz clic en otra pantalla para añadirla / quitarla.
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {screens.map((s) => (
            <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Tipo de nodo */}
      <Field label={<>Tipo de nodo {commonValue("kind") === undefined && <span className="text-amber-400 normal-case font-normal">· mezcla</span>}</>}>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(KIND_DEFAULTS) as NodeKind[]).map((k) => {
            const def = KIND_DEFAULTS[k];
            const Ic = SCREEN_ICONS[def.icon].icon;
            const active = commonKind === k && commonValue("kind") !== undefined;
            return (
              <button
                key={k}
                onClick={() => applyToAll("kind", k)}
                className={`flex flex-col items-center gap-1 py-2 rounded-md border transition-all text-[10px] ${
                  active
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                }`}
                title={def.label}
              >
                <Ic className="w-4 h-4" />
                <span className="truncate w-full px-1 text-center">{def.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      {/* Estado */}
      <Field label={<>Estado {commonStatus === undefined && <span className="text-amber-400 normal-case font-normal">· mezcla</span>}</>}>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(STATUS_COLORS) as ScreenStatus[]).map((status) => {
            const style = STATUS_COLORS[status];
            const active = commonStatus === status;
            return (
              <button
                key={status}
                onClick={() => applyToAll("status", status)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all ${
                  active ? `${style.badge} border-current` : "text-slate-500 bg-slate-800 border-slate-700 hover:border-slate-500"
                }`}
              >
                {style.text}
              </button>
            );
          })}
        </div>
      </Field>

      {/* Color */}
      <Field label={<>Color {commonColor === undefined && <span className="text-amber-400 normal-case font-normal">· mezcla</span>}</>}>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(SCREEN_COLORS) as ScreenColor[]).map((c) => {
            const active = commonColor === c;
            return (
              <button
                key={c}
                onClick={() => applyToAll("color", c)}
                className={`w-7 h-7 rounded-md border-2 transition-all ${SCREEN_COLORS[c].header} ${
                  active ? "border-white scale-110" : "border-transparent hover:border-slate-500"
                }`}
                title={c}
              />
            );
          })}
        </div>
      </Field>

      {/* Icono */}
      <Field label={<>Icono {commonIcon === undefined && <span className="text-amber-400 normal-case font-normal">· mezcla</span>}</>}>
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(SCREEN_ICONS) as ScreenIcon[]).map((key) => {
            const { icon: Ic, label } = SCREEN_ICONS[key];
            const active = commonIcon === key;
            return (
              <button
                key={key}
                onClick={() => applyToAll("icon", key)}
                className={`p-1.5 rounded-md border transition-all ${
                  active
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                }`}
                title={label}
              >
                <Ic className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      </Field>
    </div>
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

// ── Collapsible action card ───────────────────────────────────────────
function CollapsibleAction({
  action,
  screenId,
  screenTitle,
  screenOptions,
  allScreens,
  hasApi,
  onUpdate,
  onDelete,
  onAddApi,
  onViewApi,
}: {
  action: import("../types/diagram").Action;
  screenId: string;
  screenTitle: string;
  screenOptions: import("../types/diagram").Screen[];
  allScreens: import("../types/diagram").Screen[];
  hasApi: boolean;
  onUpdate: (patch: Partial<import("../types/diagram").Action>) => void;
  onDelete: () => void;
  onAddApi: () => void;
  onViewApi: () => void;
}) {
  const [open, setOpen] = useState(false);
  const targetName = allScreens.find((s) => s.id === action.targetScreen)?.title ?? action.targetScreen;

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700/50 overflow-hidden">
      {/* Header — always visible */}
      <div
        className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />}
        <span className="text-xs text-slate-200 truncate flex-1">{action.label || "Sin nombre"}</span>
        <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{targetName}</span>
        {hasApi && <span className="text-[9px] font-mono text-amber-400/80 bg-amber-400/10 px-1 py-0.5 rounded">API</span>}
        {action.note && <span className="text-[9px] text-sky-400/60">💬</span>}
      </div>

      {/* Expanded content */}
      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-slate-700/40 pt-2">
          <div className="flex items-center gap-2">
            <input
              value={action.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="input-field flex-1 !py-1 text-xs"
              placeholder="Nombre de la acción"
              onClick={(e) => e.stopPropagation()}
            />
            <button onClick={onDelete} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Eliminar">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 shrink-0">Destino:</span>
            <select
              value={action.targetScreen}
              onChange={(e) => onUpdate({ targetScreen: e.target.value })}
              className="input-field flex-1 !py-1 text-xs"
            >
              <option value={screenId}>{screenTitle} (self)</option>
              {screenOptions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 shrink-0 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 text-red-400" /> Error:
            </span>
            <select
              value={action.errorTargetScreen ?? ""}
              onChange={(e) => onUpdate({ errorTargetScreen: e.target.value || undefined })}
              className="input-field flex-1 !py-1 text-xs"
            >
              <option value="">Sin flujo de error</option>
              {allScreens.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>

          <input
            value={action.note ?? ""}
            onChange={(e) => onUpdate({ note: e.target.value || undefined })}
            className="input-field !py-1 text-xs text-sky-300"
            placeholder="Nota o comentario..."
          />

          {!hasApi ? (
            <button onClick={onAddApi} className="flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors">
              <Globe className="w-3 h-3" /> Añadir API Call
            </button>
          ) : (
            <button onClick={onViewApi} className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors">
              <Globe className="w-3 h-3" /> Ver/Editar API Call
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Markdown field with edit/preview toggle ──────────────────────────
function MarkdownField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  minHeight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Optional minimum height in px for both edit (textarea) and preview modes. */
  minHeight?: number;
}) {
  const [editing, setEditing] = useState(!value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</h3>
        {value && (
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {editing ? <Eye className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editing ? "Preview" : "Editar"}
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          style={minHeight ? { minHeight } : undefined}
          className="input-field resize-y font-mono text-xs w-full"
          placeholder={placeholder}
          onBlur={() => { if (value) setEditing(false); }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={minHeight ? { minHeight } : undefined}
          className="bg-slate-800 rounded-md p-3 border border-slate-700 cursor-text hover:border-slate-600 transition-colors min-h-[40px]"
        >
          <Markdown>{value}</Markdown>
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

interface TabSpec<T extends string> {
  id: T;
  label: string;
  icon: typeof Info;
  badge?: number;
}

function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-0.5 border-b border-slate-700 -mx-4 px-4 sticky top-0 bg-slate-900 z-10">
      {tabs.map((t) => {
        const Ic = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? "text-violet-300 border-violet-500"
                : "text-slate-500 border-transparent hover:text-slate-300"
            }`}
          >
            <Ic className="w-3.5 h-3.5" />
            <span>{t.label}</span>
            {typeof t.badge === "number" && t.badge > 0 && (
              <span className={`text-[9px] px-1 rounded ${isActive ? "bg-violet-500/20 text-violet-300" : "bg-slate-800 text-slate-500"}`}>
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
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

// ── Variable definitions editor (ScreenEditor) ───────────────────────
function VariablesEditor({
  variables,
  onChange,
}: {
  variables: VarDef[];
  onChange: (v: VarDef[]) => void;
}) {
  const addVar = () => {
    const baseName = "var_" + (variables.length + 1);
    onChange([...variables, { name: baseName, type: "enum", values: ["valor1", "valor2"], defaultValue: "valor1" }]);
  };

  const updateVar = (idx: number, patch: Partial<VarDef>) => {
    onChange(variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const removeVar = (idx: number) => {
    onChange(variables.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <VariableIcon className="w-3 h-3" /> Variables ({variables.length})
        </h3>
        <button
          onClick={addVar}
          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Añadir
        </button>
      </div>

      {variables.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">
          Declara variables aquí (p.ej. <code>estado_luz</code>) y úsalas como condiciones o efectos en las acciones.
        </p>
      ) : (
        <div className="space-y-2">
          {variables.map((v, i) => (
            <VariableRow
              key={i}
              def={v}
              onChange={(patch) => updateVar(i, patch)}
              onDelete={() => removeVar(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableRow({
  def,
  onChange,
  onDelete,
}: {
  def: VarDef;
  onChange: (patch: Partial<VarDef>) => void;
  onDelete: () => void;
}) {
  const handleTypeChange = (type: VarType) => {
    // Reset default to a sensible value for the new type.
    let defaultValue: VarValue = "";
    let values: string[] | undefined;
    if (type === "enum") {
      values = def.values && def.values.length > 0 ? def.values : ["valor1", "valor2"];
      defaultValue = values[0];
    } else if (type === "boolean") {
      defaultValue = false;
    } else if (type === "number") {
      defaultValue = 0;
    } else {
      defaultValue = "";
    }
    onChange({ type, values, defaultValue });
  };

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-800/50 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={def.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "_") })}
          className="input-field flex-1 !py-1 text-xs font-mono text-violet-300"
          placeholder="nombre_variable"
        />
        <select
          value={def.type}
          onChange={(e) => handleTypeChange(e.target.value as VarType)}
          className="input-field !py-1 text-xs w-24"
        >
          <option value="enum">Enum</option>
          <option value="boolean">Boolean</option>
          <option value="number">Número</option>
          <option value="text">Texto</option>
        </select>
        <button onClick={onDelete} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Eliminar variable">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {def.type === "enum" && (
        <div>
          <div className="text-[10px] text-slate-500 mb-1">Valores permitidos (separados por coma)</div>
          <input
            value={(def.values ?? []).join(", ")}
            onChange={(e) => {
              const values = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              const newDefault = values.includes(String(def.defaultValue)) ? def.defaultValue : (values[0] ?? "");
              onChange({ values, defaultValue: newDefault });
            }}
            className="input-field !py-1 text-xs font-mono"
            placeholder="encendida, apagada"
          />
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-500 shrink-0">Default:</span>
        {def.type === "enum" && (
          <select
            value={String(def.defaultValue)}
            onChange={(e) => onChange({ defaultValue: e.target.value })}
            className="input-field flex-1 !py-1 text-xs font-mono"
          >
            {(def.values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {def.type === "boolean" && (
          <select
            value={String(def.defaultValue)}
            onChange={(e) => onChange({ defaultValue: e.target.value === "true" })}
            className="input-field flex-1 !py-1 text-xs font-mono"
          >
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        )}
        {def.type === "number" && (
          <input
            type="number"
            value={Number(def.defaultValue)}
            onChange={(e) => onChange({ defaultValue: Number(e.target.value) })}
            className="input-field flex-1 !py-1 text-xs font-mono"
          />
        )}
        {def.type === "text" && (
          <input
            value={String(def.defaultValue)}
            onChange={(e) => onChange({ defaultValue: e.target.value })}
            className="input-field flex-1 !py-1 text-xs font-mono"
            placeholder="valor por defecto"
          />
        )}
      </div>
    </div>
  );
}

// ── Conditions editor (EdgeEditor) ───────────────────────────────────
export function ConditionsEditor({
  conditions,
  onChange,
  availableVars,
}: {
  conditions: Condition[];
  onChange: (c: Condition[]) => void;
  availableVars: VarDef[];
}) {
  const addCond = () => {
    const v = availableVars[0];
    if (!v) return;
    const op: CondOp = v.type === "boolean" ? "truthy" : "eq";
    const value: VarValue = v.type === "boolean" ? true : v.defaultValue;
    onChange([...conditions, { variable: v.name, op, value }]);
  };

  const updateCond = (idx: number, patch: Partial<Condition>) => {
    onChange(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const removeCond = (idx: number) => {
    onChange(conditions.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-400/80">
          <Lock className="w-3 h-3" /> Condiciones ({conditions.length})
        </h3>
        <button
          onClick={addCond}
          disabled={availableVars.length === 0}
          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={availableVars.length === 0 ? "Declara variables en alguna pantalla primero" : "Añadir condición"}
        >
          <Plus className="w-3 h-3" /> Añadir
        </button>
      </div>

      {availableVars.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">Sin variables declaradas en el diagrama.</p>
      ) : conditions.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">Sin condiciones — la acción siempre está disponible.</p>
      ) : (
        <div className="space-y-1.5">
          {conditions.map((c, i) => (
            <ConditionRow
              key={i}
              cond={c}
              vars={availableVars}
              onChange={(patch) => updateCond(i, patch)}
              onDelete={() => removeCond(i)}
            />
          ))}
          {conditions.length > 1 && (
            <p className="text-[10px] text-slate-500 italic">Todas las condiciones deben cumplirse (AND).</p>
          )}
        </div>
      )}
    </div>
  );
}

function ConditionRow({
  cond,
  vars,
  onChange,
  onDelete,
}: {
  cond: Condition;
  vars: VarDef[];
  onChange: (patch: Partial<Condition>) => void;
  onDelete: () => void;
}) {
  const def = vars.find((v) => v.name === cond.variable) ?? vars[0];
  const ops: CondOp[] = def?.type === "boolean"
    ? ["truthy", "falsy", "eq", "neq"]
    : def?.type === "number"
      ? ["eq", "neq", "gt", "gte", "lt", "lte"]
      : ["eq", "neq"];

  const opLabel: Record<CondOp, string> = {
    eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤", truthy: "es true", falsy: "es false",
  };

  const needsValue = cond.op !== "truthy" && cond.op !== "falsy";

  return (
    <div className="flex items-center gap-1 rounded-md bg-violet-500/5 border border-violet-500/20 px-1.5 py-1">
      <select
        value={cond.variable}
        onChange={(e) => {
          const newVar = vars.find((v) => v.name === e.target.value);
          if (!newVar) return;
          onChange({
            variable: e.target.value,
            op: newVar.type === "boolean" ? "truthy" : "eq",
            value: newVar.defaultValue,
          });
        }}
        className="input-field !py-0.5 text-[11px] font-mono text-violet-300 max-w-[110px]"
      >
        {vars.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
      </select>
      <select
        value={cond.op}
        onChange={(e) => onChange({ op: e.target.value as CondOp })}
        className="input-field !py-0.5 text-[11px] w-20"
      >
        {ops.map((o) => <option key={o} value={o}>{opLabel[o]}</option>)}
      </select>
      {needsValue && def && (
        <ValueInput
          def={def}
          value={cond.value}
          onChange={(value) => onChange({ value })}
        />
      )}
      <button onClick={onDelete} className="p-0.5 text-slate-500 hover:text-red-400 transition-colors">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Effects editor (EdgeEditor) ──────────────────────────────────────
export function EffectsEditor({
  effects,
  onChange,
  availableVars,
}: {
  effects: Effect[];
  onChange: (e: Effect[]) => void;
  availableVars: VarDef[];
}) {
  const addEffect = () => {
    const v = availableVars[0];
    if (!v) return;
    onChange([...effects, { variable: v.name, op: "set", value: v.defaultValue }]);
  };

  const updateEffect = (idx: number, patch: Partial<Effect>) => {
    onChange(effects.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const removeEffect = (idx: number) => {
    onChange(effects.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fuchsia-400/80">
          <Sparkles className="w-3 h-3" /> Efectos ({effects.length})
        </h3>
        <button
          onClick={addEffect}
          disabled={availableVars.length === 0}
          className="flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" /> Añadir
        </button>
      </div>

      {availableVars.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">Sin variables declaradas en el diagrama.</p>
      ) : effects.length === 0 ? (
        <p className="text-[11px] text-slate-600 italic">Sin efectos — la acción no modifica variables.</p>
      ) : (
        <div className="space-y-1.5">
          {effects.map((e, i) => (
            <EffectRow
              key={i}
              eff={e}
              vars={availableVars}
              onChange={(patch) => updateEffect(i, patch)}
              onDelete={() => removeEffect(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EffectRow({
  eff,
  vars,
  onChange,
  onDelete,
}: {
  eff: Effect;
  vars: VarDef[];
  onChange: (patch: Partial<Effect>) => void;
  onDelete: () => void;
}) {
  const def = vars.find((v) => v.name === eff.variable) ?? vars[0];
  const isToggleable = def?.type === "boolean";

  return (
    <div className="flex items-center gap-1 rounded-md bg-fuchsia-500/5 border border-fuchsia-500/20 px-1.5 py-1">
      <select
        value={eff.variable}
        onChange={(e) => {
          const newVar = vars.find((v) => v.name === e.target.value);
          if (!newVar) return;
          onChange({ variable: e.target.value, op: "set", value: newVar.defaultValue });
        }}
        className="input-field !py-0.5 text-[11px] font-mono text-fuchsia-300 max-w-[110px]"
      >
        {vars.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
      </select>
      <select
        value={eff.op ?? "set"}
        onChange={(e) => onChange({ op: e.target.value as Effect["op"] })}
        className="input-field !py-0.5 text-[11px] w-16"
      >
        <option value="set">←</option>
        {isToggleable && <option value="toggle">⇄</option>}
      </select>
      {(eff.op ?? "set") === "set" && def && (
        <ValueInput
          def={def}
          value={eff.value}
          onChange={(value) => onChange({ value })}
        />
      )}
      <button onClick={onDelete} className="p-0.5 text-slate-500 hover:text-red-400 transition-colors">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Reusable typed input for a variable value ────────────────────────
export function ValueInput({
  def,
  value,
  onChange,
  className = "",
}: {
  def: VarDef;
  value: VarValue | undefined;
  onChange: (v: VarValue) => void;
  className?: string;
}) {
  if (def.type === "enum") {
    return (
      <select
        value={String(value ?? def.defaultValue)}
        onChange={(e) => onChange(e.target.value)}
        className={`input-field !py-0.5 text-[11px] font-mono flex-1 min-w-0 ${className}`}
      >
        {(def.values ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (def.type === "boolean") {
    return (
      <select
        value={String(value ?? def.defaultValue)}
        onChange={(e) => onChange(e.target.value === "true")}
        className={`input-field !py-0.5 text-[11px] font-mono flex-1 min-w-0 ${className}`}
      >
        <option value="false">false</option>
        <option value="true">true</option>
      </select>
    );
  }
  if (def.type === "number") {
    return (
      <input
        type="number"
        value={Number(value ?? def.defaultValue)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`input-field !py-0.5 text-[11px] font-mono flex-1 min-w-0 ${className}`}
      />
    );
  }
  return (
    <input
      value={String(value ?? def.defaultValue)}
      onChange={(e) => onChange(e.target.value)}
      className={`input-field !py-0.5 text-[11px] font-mono flex-1 min-w-0 ${className}`}
    />
  );
}


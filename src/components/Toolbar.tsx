import {
  Plus, Undo2, Redo2, Download, Upload, Image, PanelLeftClose, PanelLeftOpen,
  Search, AlertTriangle, CheckCircle2, Tag, Share2, Check, ArrowLeft,
  Cloud, CloudOff, Loader2, LogOut, Wifi, LayoutGrid, Sparkles, Sun, Moon, Spline,
} from "lucide-react";
import { useRef, useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useAuthStore } from "../store/useAuthStore";
import { usePreferencesStore, type EdgeStyle } from "../store/usePreferencesStore";
import { downloadJson, exportCanvasAsPng } from "../utils/exportUtils";
import { buildShareUrl } from "../utils/urlShare";
import { renameDiagram } from "../lib/diagramService";
import { isSupabaseConfigured } from "../lib/supabase";
import { ShareDialog } from "./ShareDialog";

const isCloud = isSupabaseConfigured && window.location.hash !== "#local";

export function Toolbar({ showAiPanel, onToggleAiPanel }: { showAiPanel: boolean; onToggleAiPanel: () => void }) {
  const showJsonPanel = useDiagramStore((s) => s.showJsonPanel);
  const toggleJsonPanel = useDiagramStore((s) => s.toggleJsonPanel);
  const diagram = useDiagramStore((s) => s.diagram);
  const addScreen = useDiagramStore((s) => s.addScreen);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const past = useDiagramStore((s) => s.past);
  const future = useDiagramStore((s) => s.future);
  const clearPositions = useDiagramStore((s) => s.clearPositions);
  const setSearchOpen = useDiagramStore((s) => s.setSearchOpen);
  const validationErrors = useDiagramStore((s) => s.validationErrors);
  const filterTag = useDiagramStore((s) => s.filterTag);
  const setFilterTag = useDiagramStore((s) => s.setFilterTag);
  const getAllTags = useDiagramStore((s) => s.getAllTags);
  const getProgress = useDiagramStore((s) => s.getProgress);
  const setJsonText = useDiagramStore((s) => s.setJsonText);
  const applyJson = useDiagramStore((s) => s.applyJson);
  const cloudDiagramId = useDiagramStore((s) => s.cloudDiagramId);
  const cloudDiagramName = useDiagramStore((s) => s.cloudDiagramName);
  const setCloudDiagramName = useDiagramStore((s) => s.setCloudDiagramName);
  const saveStatus = useDiagramStore((s) => s.saveStatus);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const theme = usePreferencesStore((s) => s.theme);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const edgeStyle = usePreferencesStore((s) => s.edgeStyle);
  const setEdgeStyle = usePreferencesStore((s) => s.setEdgeStyle);

  const fileRef = useRef<HTMLInputElement>(null);
  const [shared, setShared] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const progress = getProgress();
  const tags = getAllTags();
  const errorCount = validationErrors.filter((e) => e.type === "error").length;
  const warnCount = validationErrors.filter((e) => e.type === "warning").length;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setJsonText(text);
      applyJson();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleExportPng = () => {
    const el = document.querySelector(".react-flow") as HTMLElement | null;
    if (el) exportCanvasAsPng(el);
  };

  const handleShare = async () => {
    let url: string;
    if (cloudDiagramId) {
      // Cloud mode: share via ?id= param
      const base = window.location.origin + window.location.pathname;
      url = `${base}?id=${cloudDiagramId}`;
    } else {
      // Local mode: compress into URL hash
      url = await buildShareUrl(diagram);
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  };

  const handleBack = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    window.history.pushState(null, "", url.pathname);
    window.location.reload();
  };

  const handleRename = (name: string) => {
    setCloudDiagramName(name);
    if (cloudDiagramId) renameDiagram(cloudDiagramId, name).catch(console.error);
  };

  return (
    <div className="toolbar-root flex items-center gap-1 px-2 py-1.5 bg-slate-900 border-b border-slate-700 shrink-0">
      {/* Back to list (cloud mode) */}
      {isCloud && cloudDiagramId && (
        <ToolbarButton icon={<ArrowLeft className="w-4 h-4" />} tooltip="Volver a mis diagramas" onClick={handleBack} />
      )}

      {/* Toggle JSON */}
      <ToolbarButton
        icon={showJsonPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        tooltip={showJsonPanel ? "Ocultar JSON" : "Mostrar JSON"}
        onClick={toggleJsonPanel}
      />

      {/* Diagram name (cloud mode) */}
      {isCloud && cloudDiagramId && (
        <>
          <Separator />
          <input
            value={cloudDiagramName}
            onChange={(e) => handleRename(e.target.value)}
            className="bg-transparent text-sm text-slate-200 font-medium outline-none w-40 px-1 border-b border-transparent hover:border-slate-600 focus:border-violet-500 transition-colors"
            placeholder="Nombre del diagrama"
          />
        </>
      )}

      <Separator />

      {/* Add screen */}
      <ToolbarButton icon={<Plus className="w-4 h-4" />} label="Pantalla" onClick={() => addScreen()} />

      <Separator />

      {/* Undo / Redo */}
      <ToolbarButton icon={<Undo2 className="w-4 h-4" />} tooltip="Deshacer (Ctrl+Z)" onClick={undo} disabled={past.length === 0} />
      <ToolbarButton icon={<Redo2 className="w-4 h-4" />} tooltip="Rehacer (Ctrl+Shift+Z)" onClick={redo} disabled={future.length === 0} />
      <ToolbarButton icon={<LayoutGrid className="w-4 h-4" />} tooltip="Reordenar automáticamente" onClick={clearPositions} />

      <Separator />

      {/* Import / Export / Share */}
      <ToolbarButton icon={<Upload className="w-4 h-4" />} tooltip="Importar JSON" onClick={() => fileRef.current?.click()} />
      <ToolbarButton icon={<Download className="w-4 h-4" />} tooltip="Exportar JSON" onClick={() => downloadJson(diagram)} />
      <ToolbarButton icon={<Image className="w-4 h-4" />} tooltip="Exportar PNG" onClick={handleExportPng} />
      {isCloud && cloudDiagramId ? (
        <ToolbarButton
          icon={<Share2 className="w-4 h-4" />}
          label="Compartir"
          onClick={() => setShareDialogOpen(true)}
        />
      ) : (
        <ToolbarButton
          icon={shared ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          label={shared ? "¡Copiada!" : "Compartir"}
          onClick={handleShare}
        />
      )}
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

      <Separator />

      {/* Search */}
      <ToolbarButton icon={<Search className="w-4 h-4" />} tooltip="Buscar (Ctrl+K)" onClick={() => setSearchOpen(true)} />

      {/* AI Panel */}
      <ToolbarButton
        icon={<Sparkles className={`w-4 h-4 ${showAiPanel ? "text-violet-400" : ""}`} />}
        label="AI"
        tooltip="Gemini AI"
        onClick={onToggleAiPanel}
      />

      <Separator />

      {/* Edge style */}
      <div className="flex items-center gap-1">
        <Spline className="w-3 h-3 text-slate-500 dark:text-slate-500" />
        <select
          value={edgeStyle}
          onChange={(e) => setEdgeStyle(e.target.value as EdgeStyle)}
          className="bg-slate-800 dark:bg-slate-800 light:bg-slate-200 text-xs text-slate-300 dark:text-slate-300 light:text-slate-700 border border-slate-700 dark:border-slate-700 light:border-slate-300 rounded px-1.5 py-1 outline-none"
        >
          <option value="bezier">Bezier</option>
          <option value="straight">Recta</option>
          <option value="step">Escalón</option>
          <option value="smoothstep">Escalón suave</option>
        </select>
      </div>

      {/* Theme toggle */}
      <ToolbarButton
        icon={theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        tooltip={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      />

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex items-center gap-1 ml-1">
          <Tag className="w-3 h-3 text-slate-500" />
          <select
            value={filterTag ?? ""}
            onChange={(e) => setFilterTag(e.target.value || null)}
            className="bg-slate-800 text-xs text-slate-300 border border-slate-700 rounded px-1.5 py-1 outline-none"
          >
            <option value="">Todos</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status (cloud mode) */}
      {isCloud && cloudDiagramId && (
        <div className="flex items-center gap-1.5 mr-2 text-xs">
          {saveStatus === "saved" && <Cloud className="w-3.5 h-3.5 text-emerald-500" />}
          {saveStatus === "saving" && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
          {saveStatus === "unsaved" && <Wifi className="w-3.5 h-3.5 text-amber-400" />}
          {saveStatus === "error" && <CloudOff className="w-3.5 h-3.5 text-red-400" />}
          <span className={`${
            saveStatus === "saved" ? "text-emerald-500" :
            saveStatus === "error" ? "text-red-400" : "text-amber-400"
          }`}>
            {saveStatus === "saved" && "Guardado"}
            {saveStatus === "saving" && "Guardando..."}
            {saveStatus === "unsaved" && "Sin guardar"}
            {saveStatus === "error" && "Error"}
          </span>
        </div>
      )}

      {/* Validation */}
      {(errorCount > 0 || warnCount > 0) && (
        <div className="flex items-center gap-2 mr-2 text-xs">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="w-3 h-3" /> {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {warnCount}
            </span>
          )}
        </div>
      )}

      {/* Progress */}
      {progress.total > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>{progress.done}/{progress.total}</span>
          <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="text-emerald-400">{progress.percent}%</span>
        </div>
      )}

      {/* User avatar (cloud mode) */}
      {isCloud && user && (
        <>
          <Separator />
          <div className="flex items-center gap-2">
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} className="w-6 h-6 rounded-full" alt="" />
            )}
            <button onClick={signOut} className="text-slate-500 hover:text-slate-300 transition-colors" title="Cerrar sesión">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {shareDialogOpen && (
        <ShareDialog open={shareDialogOpen} onClose={() => setShareDialogOpen(false)} />
      )}
    </div>
  );
}

function ToolbarButton({
  icon, label, tooltip, onClick, disabled,
}: {
  icon: React.ReactNode; label?: string; tooltip?: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tooltip ?? label}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
        disabled ? "text-slate-600 cursor-not-allowed" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function Separator() {
  return <div className="toolbar-separator w-px h-5 bg-slate-700 mx-1" />;
}

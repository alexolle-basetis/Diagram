import { useEffect, useState, useCallback } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar";
import { JsonEditor } from "./components/JsonEditor";
import { DiagramCanvas } from "./components/DiagramCanvas";
import { AiPanel } from "./components/AiPanel";
import { LoginPage } from "./components/LoginPage";
import { DiagramList } from "./components/DiagramList";
import { useDiagramStore } from "./store/useDiagramStore";
import { useAuthStore } from "./store/useAuthStore";
import { useSupabaseSync } from "./hooks/useSupabaseSync";
import { isSupabaseConfigured } from "./lib/supabase";
import { getHashFromUrl, decompressFromHash } from "./utils/urlShare";

const hashOnLoad = getHashFromUrl();
const localMode = !isSupabaseConfigured || window.location.hash === "#local";

// ── Editor view (with optional Supabase sync) ─────────────────────
function EditorView({ diagramId }: { diagramId: string | null }) {
  const showJsonPanel = useDiagramStore((s) => s.showJsonPanel);
  const setSaveStatus = useDiagramStore((s) => s.setSaveStatus);
  const [syncReady, setSyncReady] = useState(!diagramId);
  const [showAiPanel, setShowAiPanel] = useState(false);

  const onLoaded = useCallback(() => setSyncReady(true), []);
  const onSaveStatusChange = useCallback(
    (status: "saved" | "saving" | "unsaved" | "error") => setSaveStatus(status),
    [setSaveStatus]
  );

  // Real-time sync (only when a cloud diagram is open)
  if (diagramId) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSupabaseSync(diagramId, onLoaded, onSaveStatusChange);
  }

  if (!syncReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400 text-sm">
        Cargando diagrama...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <Toolbar showAiPanel={showAiPanel} onToggleAiPanel={() => setShowAiPanel((v) => !v)} />
      <div className="flex flex-1 overflow-hidden">
        {showJsonPanel && (
          <div className="w-[30%] min-w-[300px] h-full flex-shrink-0">
            <JsonEditor />
          </div>
        )}
        <div className="flex-1 h-full">
          <ReactFlowProvider>
            <DiagramCanvas />
          </ReactFlowProvider>
        </div>
        {showAiPanel && (
          <div className="w-[350px] min-w-[300px] h-full flex-shrink-0">
            <AiPanel onClose={() => setShowAiPanel(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
function App() {
  const loadDiagram = useDiagramStore((s) => s.loadDiagram);
  const setCloudDiagram = useDiagramStore((s) => s.setCloudDiagram);
  const cloudDiagramId = useDiagramStore((s) => s.cloudDiagramId);
  const authUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const initialize = useAuthStore((s) => s.initialize);

  const [hashLoaded, setHashLoaded] = useState(!hashOnLoad);

  // Initialize auth (Supabase mode only)
  useEffect(() => {
    if (!localMode) initialize();
  }, [initialize]);

  // Load diagram from URL hash (works in both modes)
  useEffect(() => {
    if (!hashOnLoad) return;
    decompressFromHash(hashOnLoad)
      .then((diagram) => {
        loadDiagram(diagram);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      })
      .catch((err) => console.warn("Failed to load from URL:", err))
      .finally(() => setHashLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Check URL for ?id= param (Supabase diagram)
  useEffect(() => {
    if (localMode) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id && authUser) {
      setCloudDiagram(id, "");
    }
  }, [authUser, setCloudDiagram]);

  // Handle opening a diagram from the list
  const handleOpenDiagram = useCallback(
    (id: string) => {
      setCloudDiagram(id, "");
      const url = new URL(window.location.href);
      url.searchParams.set("id", id);
      window.history.pushState(null, "", url.toString());
    },
    [setCloudDiagram]
  );

  // Handle going back to list
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("id")) {
        setCloudDiagram(null, "");
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [setCloudDiagram]);

  // Loading states
  if (!hashLoaded) {
    return <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400 text-sm">Cargando...</div>;
  }

  // Local mode → straight to editor
  if (localMode) {
    return <EditorView diagramId={null} />;
  }

  // Supabase mode → auth loading
  if (authLoading) {
    return <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400 text-sm">Cargando...</div>;
  }

  // Not logged in
  if (!authUser) {
    return <LoginPage />;
  }

  // Diagram list (no diagram selected)
  if (!cloudDiagramId) {
    return <DiagramList onOpen={handleOpenDiagram} />;
  }

  // Editor with cloud sync
  return <EditorView diagramId={cloudDiagramId} />;
}

export default App;

import { useEffect, useRef, useMemo } from "react";
import { Search, Monitor, Globe, X } from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useReactFlow } from "@xyflow/react";

interface SearchResult {
  type: "screen" | "api";
  id: string;
  title: string;
  subtitle: string;
  nodeId: string;
}

export function SearchDialog() {
  const searchOpen = useDiagramStore((s) => s.searchOpen);
  const searchTerm = useDiagramStore((s) => s.searchTerm);
  const setSearchTerm = useDiagramStore((s) => s.setSearchTerm);
  const setSearchOpen = useDiagramStore((s) => s.setSearchOpen);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const diagram = useDiagramStore((s) => s.diagram);
  const inputRef = useRef<HTMLInputElement>(null);

  const reactFlow = useReactFlow();

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen]);

  // Global Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(!useDiagramStore.getState().searchOpen);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSearchOpen]);

  const results = useMemo<SearchResult[]>(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();

    const screenResults: SearchResult[] = diagram.screens
      .filter((s) =>
        s.title.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.id.toLowerCase().includes(term)
      )
      .map((s) => ({
        type: "screen",
        id: s.id,
        title: s.title,
        subtitle: s.description,
        nodeId: s.id,
      }));

    const apiResults: SearchResult[] = diagram.apiCalls
      .filter((a) =>
        a.endpoint.toLowerCase().includes(term) ||
        a.method.toLowerCase().includes(term)
      )
      .map((a) => {
        const screen = diagram.screens.find((s) => s.actions.some((act) => act.id === a.actionId));
        return {
          type: "api",
          id: a.actionId,
          title: `${a.method} ${a.endpoint}`,
          subtitle: screen?.title ?? "",
          nodeId: screen?.id ?? "",
        };
      });

    return [...screenResults, ...apiResults].slice(0, 10);
  }, [searchTerm, diagram]);

  const handleSelect = (result: SearchResult) => {
    if (result.type === "screen") {
      setSelection({ kind: "screen", screenId: result.id });
    } else {
      const screen = diagram.screens.find((s) => s.actions.some((a) => a.id === result.id));
      const action = screen?.actions.find((a) => a.id === result.id);
      if (screen && action) {
        setSelection({
          kind: "edge",
          actionId: result.id,
          sourceScreenId: screen.id,
          targetScreenId: action.targetScreen,
        });
      }
    }

    // Zoom to node
    if (reactFlow && result.nodeId) {
      reactFlow.fitView({
        nodes: [{ id: result.nodeId }],
        padding: 0.5,
        duration: 400,
      });
    }

    setSearchOpen(false);
  };

  if (!searchOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50"
      onClick={() => setSearchOpen(false)}
    >
      <div
        className="w-[500px] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar pantallas, endpoints..."
            className="flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-500"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false);
              if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
            }}
          />
          <button onClick={() => setSearchOpen(false)} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto py-1">
            {results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-slate-800 transition-colors"
              >
                {r.type === "screen" ? (
                  <Monitor className="w-4 h-4 text-violet-400 shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 truncate">{r.title}</div>
                  <div className="text-xs text-slate-500 truncate">{r.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {searchTerm && results.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            Sin resultados para "{searchTerm}"
          </div>
        )}

        {!searchTerm && (
          <div className="px-4 py-4 text-center text-xs text-slate-500">
            Escribe para buscar pantallas o endpoints
          </div>
        )}
      </div>
    </div>
  );
}

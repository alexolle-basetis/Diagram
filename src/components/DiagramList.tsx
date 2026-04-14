import { useEffect, useState, useCallback } from "react";
import { Plus, FileText, Trash2, LogOut, GitBranch, Clock, Users } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import {
  listMyDiagrams,
  createDiagram,
  deleteDiagram,
  type DiagramSummary,
} from "../lib/diagramService";
import { listSharedWithMe, type SharedDiagramSummary } from "../lib/sharingService";
import { sampleDiagram } from "../data/sampleDiagram";

interface Props {
  onOpen: (id: string) => void;
}

export function DiagramList({ onOpen }: Props) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [sharedDiagrams, setSharedDiagrams] = useState<SharedDiagramSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user) return;
    Promise.all([
      listMyDiagrams(user.id),
      listSharedWithMe().catch(() => [] as SharedDiagramSummary[]),
    ])
      .then(([mine, shared]) => {
        setDiagrams(mine);
        setSharedDiagrams(shared);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (withSample: boolean) => {
    if (!user) return;
    const data = withSample ? sampleDiagram : { screens: [], apiCalls: [] };
    const name = withSample ? "Diagrama de ejemplo" : "Sin título";
    const id = await createDiagram(user.id, name, data);
    onOpen(id);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    await deleteDiagram(id);
    load();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-500/15">
            <GitBranch className="w-5 h-5 text-violet-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Mis Diagramas</h1>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {user.user_metadata?.avatar_url && (
                <img src={user.user_metadata.avatar_url} className="w-6 h-6 rounded-full" alt="" />
              )}
              <span>{user.user_metadata?.full_name ?? user.email}</span>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 rounded-md hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Salir
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* Create buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handleCreate(false)}
              className="flex items-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Nuevo diagrama
            </button>
            <button
              onClick={() => handleCreate(true)}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium border border-slate-700 transition-colors"
            >
              <FileText className="w-4 h-4" /> Crear con ejemplo
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-12 text-sm text-slate-500">Cargando...</div>
          )}

          {/* Empty state */}
          {!loading && diagrams.length === 0 && (
            <div className="text-center py-12">
              <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No tienes diagramas todavía.</p>
              <p className="text-xs text-slate-600 mt-1">Crea uno nuevo para empezar.</p>
            </div>
          )}

          {/* My diagrams list */}
          {diagrams.length > 0 && (
            <h2 className="text-xs font-semibold uppercase text-slate-500 tracking-wider pt-2">
              Mis diagramas
            </h2>
          )}
          {diagrams.map((d) => (
            <button
              key={d.id}
              onClick={() => onOpen(d.id)}
              className="flex items-center gap-4 w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 hover:bg-slate-800/50 transition-colors text-left group"
            >
              <div className="p-2 rounded bg-slate-800 group-hover:bg-slate-700 transition-colors">
                <GitBranch className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{d.name}</div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>{d.screenCount} pantallas</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(d.updated_at)}
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(d.id, d.name); }}
                className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </button>
          ))}

          {/* Shared with me */}
          {sharedDiagrams.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase text-slate-500 tracking-wider pt-4 flex items-center gap-2">
                <Users className="w-3.5 h-3.5" />
                Compartidos conmigo
              </h2>
              {sharedDiagrams.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onOpen(d.id)}
                  className="flex items-center gap-4 w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 hover:bg-slate-800/50 transition-colors text-left group"
                >
                  <div className="p-2 rounded bg-slate-800 group-hover:bg-slate-700 transition-colors">
                    <Users className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{d.name}</div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span>{d.screenCount} pantallas</span>
                      <span className="flex items-center gap-1">
                        {d.owner_avatar ? (
                          <img src={d.owner_avatar} className="w-3 h-3 rounded-full" alt="" />
                        ) : null}
                        {d.owner_name ?? d.owner_email}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        d.role === "editor"
                          ? "bg-violet-500/15 text-violet-300"
                          : "bg-slate-700 text-slate-400"
                      }`}>
                        {d.role === "editor" ? "Editor" : "Visor"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(d.updated_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  X, Globe, Lock, UserPlus, Trash2, Copy, Check, Loader2,
} from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useAuthStore } from "../store/useAuthStore";
import {
  getDiagramVisibility,
  setDiagramPublic,
  findUserByEmail,
  shareDiagram,
  unshareDiagram,
  listDiagramShares,
  type ShareEntry,
} from "../lib/sharingService";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShareDialog({ open, onClose }: Props) {
  const cloudDiagramId = useDiagramStore((s) => s.cloudDiagramId);
  const user = useAuthStore((s) => s.user);
  const [isPublic, setIsPublic] = useState(false);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    if (!cloudDiagramId) return;
    try {
      const [vis, sh] = await Promise.all([
        getDiagramVisibility(cloudDiagramId),
        listDiagramShares(cloudDiagramId),
      ]);
      setIsPublic(vis);
      setShares(sh);
    } catch (err) {
      console.error("Failed to load sharing data:", err);
    }
  }, [cloudDiagramId]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const handleTogglePublic = async () => {
    if (!cloudDiagramId) return;
    const newVal = !isPublic;
    setIsPublic(newVal);
    try {
      await setDiagramPublic(cloudDiagramId, newVal);
    } catch {
      setIsPublic(!newVal); // revert
    }
  };

  const handleShare = async () => {
    if (!cloudDiagramId || !email.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const found = await findUserByEmail(email.trim());
      if (!found) {
        setError("No se encontró un usuario con ese email");
        return;
      }
      if (found.id === user?.id) {
        setError("No puedes compartir contigo mismo");
        return;
      }
      await shareDiagram(cloudDiagramId, found.id, role);
      setEmail("");
      await loadData();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    try {
      await unshareDiagram(shareId);
      await loadData();
    } catch (err) {
      console.error("Failed to remove share:", err);
    }
  };

  const handleCopyLink = async () => {
    if (!cloudDiagramId) return;
    const url = `${window.location.origin}${window.location.pathname}?id=${cloudDiagramId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-100">Compartir diagrama</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Visibility toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPublic ? (
                <Globe className="w-5 h-5 text-emerald-400" />
              ) : (
                <Lock className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-200">
                  {isPublic ? "Público" : "Privado"}
                </div>
                <div className="text-xs text-slate-500">
                  {isPublic
                    ? "Cualquiera con el enlace puede ver"
                    : "Solo tú y los invitados"}
                </div>
              </div>
            </div>
            <button
              onClick={handleTogglePublic}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isPublic ? "bg-emerald-600" : "bg-slate-600"
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  isPublic ? "left-5.5 translate-x-0" : "left-0.5"
                }`}
                style={{ left: isPublic ? "22px" : "2px" }}
              />
            </button>
          </div>

          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-750 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="flex-1 text-left truncate text-slate-500">
              {`${window.location.origin}${window.location.pathname}?id=${cloudDiagramId}`}
            </span>
            <span className="text-slate-400 shrink-0">{copied ? "¡Copiado!" : "Copiar"}</span>
          </button>

          {/* Add user */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Invitar por email</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleShare()}
                placeholder="usuario@email.com"
                className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
                className="px-2 py-2 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-300 outline-none"
              >
                <option value="viewer">Ver</option>
                <option value="editor">Editar</option>
              </select>
              <button
                onClick={handleShare}
                disabled={loading || !email.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Shared users list */}
          {shares.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Personas con acceso</label>
              <div className="space-y-1">
                {shares.map((s) => (
                  <div
                    key={s.share_id}
                    className="flex items-center gap-3 px-3 py-2 bg-slate-800/50 rounded-lg"
                  >
                    {s.avatar_url ? (
                      <img src={s.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">
                        {(s.full_name?.[0] ?? s.email[0]).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-200 truncate">
                        {s.full_name ?? s.email}
                      </div>
                      {s.full_name && (
                        <div className="text-[10px] text-slate-500 truncate">{s.email}</div>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      s.role === "editor"
                        ? "bg-violet-500/15 text-violet-300"
                        : "bg-slate-700 text-slate-400"
                    }`}>
                      {s.role === "editor" ? "Editor" : "Visor"}
                    </span>
                    <button
                      onClick={() => handleRemove(s.share_id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

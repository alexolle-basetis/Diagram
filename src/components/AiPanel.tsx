import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Loader2, Key, X, Undo2, Sparkles, Trash2, Check, AlertTriangle,
} from "lucide-react";
import { useDiagramStore } from "../store/useDiagramStore";
import {
  getGeminiApiKey,
  setGeminiApiKey,
  removeGeminiApiKey,
  sendToGemini,
  extractDiagramFromResponse,
  type GeminiMessage,
} from "../lib/geminiService";
import type { DiagramData } from "../types/diagram";
import { Markdown } from "./Markdown";

interface ChatMessage {
  role: "user" | "model";
  text: string;
  diagram?: DiagramData; // extracted diagram from model response
  applied?: boolean;     // whether this diagram was applied
}

export function AiPanel({ onClose }: { onClose: () => void }) {
  const diagram = useDiagramStore((s) => s.diagram);
  const loadDiagram = useDiagramStore((s) => s.loadDiagram);
  const undo = useDiagramStore((s) => s.undo);
  const canUndo = useDiagramStore((s) => s.canUndo);

  const [apiKey, setApiKeyState] = useState(getGeminiApiKey() ?? "");
  const [hasKey, setHasKey] = useState(!!getGeminiApiKey());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAppliedIndex, setLastAppliedIndex] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    setGeminiApiKey(apiKey.trim());
    setHasKey(true);
  };

  const handleRemoveKey = () => {
    removeGeminiApiKey();
    setApiKeyState("");
    setHasKey(false);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = { role: "user", text: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      // Build the conversation history for Gemini
      const geminiMessages: GeminiMessage[] = newMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const responseText = await sendToGemini(geminiMessages, diagram);
      const extractedDiagram = extractDiagramFromResponse(responseText);

      // Remove the JSON block from displayed text for cleaner display
      const displayText = responseText
        .replace(/```json\s*\n?[\s\S]*?```/g, "")
        .trim();

      const modelMessage: ChatMessage = {
        role: "model",
        text: displayText || "He generado el diagrama actualizado.",
        diagram: extractedDiagram ?? undefined,
      };
      setMessages([...newMessages, modelMessage]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, diagram]);

  const handleApplyDiagram = (index: number) => {
    const msg = messages[index];
    if (!msg.diagram) return;

    loadDiagram(msg.diagram);
    setLastAppliedIndex(index);

    // Mark as applied
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, applied: true } : m))
    );
  };

  const handleRollback = () => {
    if (canUndo()) {
      undo();
      if (lastAppliedIndex !== null) {
        setMessages((prev) =>
          prev.map((m, i) => (i === lastAppliedIndex ? { ...m, applied: false } : m))
        );
        setLastAppliedIndex(null);
      }
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setLastAppliedIndex(null);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-slate-100">Gemini AI</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
              title="Limpiar chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {lastAppliedIndex !== null && canUndo() && (
            <button
              onClick={handleRollback}
              className="flex items-center gap-1 px-2 py-1 text-xs text-amber-400 hover:bg-amber-400/10 rounded transition-colors"
              title="Deshacer último cambio de IA"
            >
              <Undo2 className="w-3 h-3" /> Rollback
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* API Key setup */}
      {!hasKey && (
        <div className="p-4 border-b border-slate-700">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Key className="w-3 h-3" /> Gemini API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                placeholder="AIza..."
                className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors"
              />
              <button
                onClick={handleSaveKey}
                disabled={!apiKey.trim()}
                className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Guardar
              </button>
            </div>
            <p className="text-[10px] text-slate-600">
              Consigue tu clave en{" "}
              <span className="text-violet-400">aistudio.google.com</span>.
              Se guarda solo en tu navegador.
            </p>
          </div>
        </div>
      )}

      {/* API key indicator when set */}
      {hasKey && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50 bg-slate-800/30">
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Key className="w-3 h-3" /> API Key configurada
          </span>
          <button
            onClick={handleRemoveKey}
            className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
          >
            Eliminar
          </button>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && hasKey && (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 text-violet-400/30 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              Describe lo que quieres y Gemini generará el diagrama.
            </p>
            <p className="text-xs text-slate-600 mt-1">
              Ejemplo: "Crea un flujo de login con email, verificación y dashboard"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-violet-600 text-white"
                  : "bg-slate-800 text-slate-200 border border-slate-700"
              }`}
            >
              {msg.role === "model" ? (
                <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0">
                  <Markdown>{msg.text}</Markdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}

              {/* Apply diagram button */}
              {msg.diagram && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-700/50">
                  {msg.applied ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                      <Check className="w-3.5 h-3.5" />
                      <span>Diagrama aplicado</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleApplyDiagram(i)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      Aplicar al diagrama
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">
                    {msg.diagram.screens.length} pantallas, {msg.diagram.apiCalls.length} API calls
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generando...
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      {hasKey && (
        <div className="p-3 border-t border-slate-700 shrink-0">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe lo que quieres..."
              rows={2}
              className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500 transition-colors resize-none"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="self-end p-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useCallback } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { saveDiagram, loadDiagram, subscribeToDiagram } from "../lib/diagramService";
import type { DiagramRow } from "../lib/supabase";
import type { DiagramData } from "../types/diagram";

const DEBOUNCE_MS = 1000;
const OWN_SAVES_TTL_MS = 15_000;

/**
 * Hook that syncs the Zustand diagram store with a Supabase diagram row.
 * - Loads diagram on mount
 * - Debounces saves when store changes
 * - Subscribes to real-time updates from other users
 *
 * Multi-user correctness:
 *  - Own-saves set: we remember every `updated_at` we produced for ~15 s. Realtime
 *    events whose `updated_at` is in that set are ignored (self-echo). Other users'
 *    events always pass through.
 *  - Pending-remote buffer: if a remote update arrives while we still have local
 *    unsaved edits (saveTimer active), we buffer it and apply it AFTER our save
 *    completes — so typing is never overwritten mid-edit.
 */
export function useSupabaseSync(
  diagramId: string,
  onLoaded: () => void,
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved" | "error") => void,
) {
  const lastSavedAt = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ownSaves = useRef<Set<string>>(new Set());
  const pendingRemote = useRef<DiagramRow | null>(null);
  const hasPendingLocal = useRef(false);

  const rememberOwnSave = useCallback((updatedAt: string) => {
    ownSaves.current.add(updatedAt);
    setTimeout(() => ownSaves.current.delete(updatedAt), OWN_SAVES_TTL_MS);
  }, []);

  const applyRemote = useCallback((row: DiagramRow) => {
    const remoteDiagram = row.data as DiagramData;
    const remotePositions = (row.positions ?? {}) as Record<string, { x: number; y: number }>;

    const store = useDiagramStore.getState();
    store.mergeRemoteDiagram(remoteDiagram);
    Object.entries(remotePositions).forEach(([id, pos]) => {
      store.updateNodePosition(id, pos);
    });

    lastSavedAt.current = row.updated_at;
    onSaveStatusChange("saved");
  }, [onSaveStatusChange]);

  // Load diagram on mount
  useEffect(() => {
    let cancelled = false;

    loadDiagram(diagramId)
      .then(({ diagram, positions, name, updatedAt }) => {
        if (cancelled) return;
        const store = useDiagramStore.getState();
        store.loadDiagram(diagram);
        Object.entries(positions).forEach(([id, pos]) => {
          store.updateNodePosition(id, pos);
        });
        store.setCloudDiagramName(name);
        lastSavedAt.current = updatedAt;
        onSaveStatusChange("saved");
        onLoaded();
      })
      .catch((err) => {
        console.error("Failed to load diagram:", err);
        onSaveStatusChange("error");
        onLoaded();
      });

    return () => { cancelled = true; };
  }, [diagramId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save function
  const save = useCallback(
    async (diagram: DiagramData, positions: Record<string, { x: number; y: number }>) => {
      onSaveStatusChange("saving");
      try {
        const updatedAt = await saveDiagram(diagramId, diagram, positions);
        rememberOwnSave(updatedAt);
        lastSavedAt.current = updatedAt;
        hasPendingLocal.current = false;
        onSaveStatusChange("saved");

        // If a remote arrived while we were editing and is still newer,
        // apply it now so the user sees the latest remote state.
        const buffered = pendingRemote.current;
        pendingRemote.current = null;
        if (buffered && buffered.updated_at > updatedAt && !ownSaves.current.has(buffered.updated_at)) {
          applyRemote(buffered);
        }
      } catch (err) {
        console.error("Failed to save:", err);
        onSaveStatusChange("error");
      }
    },
    [diagramId, onSaveStatusChange, rememberOwnSave, applyRemote]
  );

  // Debounced save on store changes
  useEffect(() => {
    const unsub = useDiagramStore.subscribe(
      (state, prevState) => {
        if (state.diagram === prevState.diagram && state.nodePositions === prevState.nodePositions) return;

        hasPendingLocal.current = true;
        onSaveStatusChange("unsaved");
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          save(state.diagram, state.nodePositions);
        }, DEBOUNCE_MS);
      },
    );

    return () => {
      unsub();
      clearTimeout(saveTimer.current);
    };
  }, [save, onSaveStatusChange]);

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToDiagram(diagramId, (row: DiagramRow) => {
      // Ignore our own echoes.
      if (ownSaves.current.has(row.updated_at)) return;
      // Ignore anything we already processed.
      if (row.updated_at === lastSavedAt.current) return;

      // If we have unsaved local edits, buffer the remote instead of clobbering.
      // Our save() will apply the buffer once flushed.
      if (hasPendingLocal.current) {
        // Keep the newest pending remote.
        if (!pendingRemote.current || row.updated_at > pendingRemote.current.updated_at) {
          pendingRemote.current = row;
        }
        return;
      }

      applyRemote(row);
    });

    return unsubscribe;
  }, [diagramId, applyRemote]);
}

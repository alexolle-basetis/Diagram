import { useEffect, useRef, useCallback } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { saveDiagram, loadDiagram, subscribeToDiagram } from "../lib/diagramService";
import type { DiagramRow } from "../lib/supabase";
import type { DiagramData } from "../types/diagram";

const DEBOUNCE_MS = 1000;

/**
 * Hook that syncs the Zustand diagram store with a Supabase diagram row.
 * - Loads diagram on mount
 * - Debounces saves when store changes
 * - Subscribes to real-time updates from other users
 */
export function useSupabaseSync(
  diagramId: string,
  onLoaded: () => void,
  onSaveStatusChange: (status: "saved" | "saving" | "unsaved" | "error") => void,
) {
  const lastSavedAt = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ignoreNextRemote = useRef(false);

  // Load diagram on mount
  useEffect(() => {
    let cancelled = false;

    loadDiagram(diagramId)
      .then(({ diagram, positions, updatedAt }) => {
        if (cancelled) return;
        const store = useDiagramStore.getState();
        // Load without pushing undo history
        store.loadDiagram(diagram);
        // Set positions
        Object.entries(positions).forEach(([id, pos]) => {
          store.updateNodePosition(id, pos);
        });
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
        ignoreNextRemote.current = true;
        const updatedAt = await saveDiagram(diagramId, diagram, positions);
        lastSavedAt.current = updatedAt;
        onSaveStatusChange("saved");
      } catch (err) {
        console.error("Failed to save:", err);
        onSaveStatusChange("error");
        ignoreNextRemote.current = false;
      }
    },
    [diagramId, onSaveStatusChange]
  );

  // Debounced save on store changes
  useEffect(() => {
    const unsub = useDiagramStore.subscribe(
      (state, prevState) => {
        // Only save when diagram data or positions actually changed
        if (state.diagram === prevState.diagram && state.nodePositions === prevState.nodePositions) return;

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
      // Skip our own saves
      if (ignoreNextRemote.current) {
        ignoreNextRemote.current = false;
        return;
      }

      // Only apply if it's a newer version than what we last saved
      if (row.updated_at === lastSavedAt.current) return;

      const remoteDiagram = row.data as DiagramData;
      const remotePositions = (row.positions ?? {}) as Record<string, { x: number; y: number }>;

      const store = useDiagramStore.getState();
      store.mergeRemoteDiagram(remoteDiagram);
      Object.entries(remotePositions).forEach(([id, pos]) => {
        store.updateNodePosition(id, pos);
      });

      lastSavedAt.current = row.updated_at;
      onSaveStatusChange("saved");
    });

    return unsubscribe;
  }, [diagramId, onSaveStatusChange]);
}

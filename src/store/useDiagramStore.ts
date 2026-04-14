import { create } from "zustand";
import type { DiagramData, Screen, Action, ApiCall, SelectionType, ValidationError } from "../types/diagram";
import { sampleDiagram } from "../data/sampleDiagram";
import { validateDiagram } from "../utils/validation";

const STORAGE_KEY = "diagram-app-state";
const MAX_HISTORY = 50;

// ── Persistence helpers ─────────────────────────────────────────────
function persist(diagram: DiagramData, positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ diagram, positions, savedAt: Date.now() }));
  } catch { /* quota exceeded — silently ignore */ }
}

function loadPersisted(): { diagram: DiagramData; positions: Record<string, { x: number; y: number }> } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.diagram?.screens) return data;
  } catch { /* corrupt data */ }
  return null;
}

// ── ID generator ────────────────────────────────────────────────────
let _counter = 0;
function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

// ── Store types ─────────────────────────────────────────────────────
interface DiagramStore {
  // Core data
  diagram: DiagramData;
  jsonText: string;
  parseError: string | null;

  // UI state
  showJsonPanel: boolean;
  selection: SelectionType;
  searchOpen: boolean;
  searchTerm: string;
  validationErrors: ValidationError[];
  filterTag: string | null;

  // Undo / redo
  past: DiagramData[];
  future: DiagramData[];

  // Node positions (persisted)
  nodePositions: Record<string, { x: number; y: number }>;

  // Cloud state
  cloudDiagramId: string | null;
  cloudDiagramName: string;
  saveStatus: "saved" | "saving" | "unsaved" | "error" | "offline";
  setCloudDiagram: (id: string | null, name: string) => void;
  setSaveStatus: (status: "saved" | "saving" | "unsaved" | "error" | "offline") => void;
  setCloudDiagramName: (name: string) => void;

  // JSON editor
  setJsonText: (text: string) => void;
  applyJson: () => void;
  toggleJsonPanel: () => void;

  // Selection
  setSelection: (sel: SelectionType) => void;
  clearSelection: () => void;

  // Screen CRUD
  addScreen: (position?: { x: number; y: number }) => string;
  updateScreen: (id: string, patch: Partial<Omit<Screen, "id" | "actions">>) => void;
  deleteScreen: (id: string) => void;

  // Action CRUD
  addAction: (screenId: string, targetScreenId?: string) => string;
  updateAction: (screenId: string, actionId: string, patch: Partial<Omit<Action, "id">>) => void;
  deleteAction: (screenId: string, actionId: string) => void;

  // ApiCall CRUD
  setApiCall: (apiCall: ApiCall) => void;
  updateApiCall: (actionId: string, patch: Partial<Omit<ApiCall, "actionId">>) => void;
  deleteApiCall: (actionId: string) => void;

  // Undo / redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Positions
  updateNodePosition: (id: string, pos: { x: number; y: number }) => void;
  clearPositions: () => void;

  // Search & filter
  setSearchOpen: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  setFilterTag: (tag: string | null) => void;

  // Validation
  validate: () => ValidationError[];

  // Load external diagram (from URL share — resets everything)
  loadDiagram: (diagram: DiagramData) => void;
  // Merge remote changes (from real-time sync — preserves selection & undo)
  mergeRemoteDiagram: (diagram: DiagramData) => void;

  // Helpers
  getScreen: (id: string) => Screen | undefined;
  getApiCall: (actionId: string) => ApiCall | undefined;
  getAllTags: () => string[];
  getProgress: () => { done: number; total: number; percent: number };
}

// ── Snapshot helper (push history, clear redo, sync JSON, persist, validate) ──
function commit(
  state: DiagramStore,
  newDiagram: DiagramData,
  extra?: Partial<DiagramStore>,
): Partial<DiagramStore> {
  const positions = (extra as { nodePositions?: Record<string, { x: number; y: number }> })?.nodePositions ?? state.nodePositions;
  persist(newDiagram, positions);
  return {
    past: [...state.past.slice(-(MAX_HISTORY - 1)), state.diagram],
    future: [],
    diagram: newDiagram,
    jsonText: JSON.stringify(newDiagram, null, 2),
    parseError: null,
    validationErrors: validateDiagram(newDiagram),
    ...extra,
  };
}

// ── Initial state ───────────────────────────────────────────────────
const persisted = loadPersisted();
const initialDiagram = persisted?.diagram ?? sampleDiagram;
const initialPositions = persisted?.positions ?? {};

export const useDiagramStore = create<DiagramStore>((set, get) => ({
  diagram: initialDiagram,
  jsonText: JSON.stringify(initialDiagram, null, 2),
  parseError: null,
  showJsonPanel: localStorage.getItem("diagram-show-json") === "true",
  selection: { kind: "none" },
  searchOpen: false,
  searchTerm: "",
  validationErrors: validateDiagram(initialDiagram),
  filterTag: null,
  past: [],
  future: [],
  nodePositions: initialPositions,

  // ── Cloud state ─────────────────────────────────────────────────
  cloudDiagramId: null,
  cloudDiagramName: "",
  saveStatus: "offline",
  setCloudDiagram: (id, name) => set({ cloudDiagramId: id, cloudDiagramName: name }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setCloudDiagramName: (name) => set({ cloudDiagramName: name }),

  // ── JSON editor ─────────────────────────────────────────────────
  setJsonText: (text) => set({ jsonText: text }),

  applyJson: () => {
    const { jsonText } = get();
    try {
      const parsed = JSON.parse(jsonText) as DiagramData;
      if (!Array.isArray(parsed.screens)) {
        set({ parseError: '"screens" debe ser un array' });
        return;
      }
      if (!parsed.apiCalls) parsed.apiCalls = [];
      set((s) => commit(s, parsed, { selection: { kind: "none" } }));
    } catch (e) {
      set({ parseError: (e as Error).message });
    }
  },

  toggleJsonPanel: () => set((s) => {
    const next = !s.showJsonPanel;
    localStorage.setItem("diagram-show-json", String(next));
    return { showJsonPanel: next };
  }),

  // ── Selection ───────────────────────────────────────────────────
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: { kind: "none" } }),

  // ── Screen CRUD ─────────────────────────────────────────────────
  addScreen: (position) => {
    const id = uid("screen");
    set((s) => {
      const newScreen: Screen = {
        id,
        title: "Nueva Pantalla",
        description: "",
        status: "pending",
        tags: [],
        actions: [],
      };
      const newDiagram = { ...s.diagram, screens: [...s.diagram.screens, newScreen] };
      return commit(s, newDiagram, {
        nodePositions: position ? { ...s.nodePositions, [id]: position } : s.nodePositions,
        selection: { kind: "screen", screenId: id },
      }) as DiagramStore;
    });
    return id;
  },

  updateScreen: (id, patch) => {
    set((s) => {
      const screens = s.diagram.screens.map((scr) =>
        scr.id === id ? { ...scr, ...patch } : scr
      );
      return commit(s, { ...s.diagram, screens }) as DiagramStore;
    });
  },

  deleteScreen: (id) => {
    set((s) => {
      const screens = s.diagram.screens
        .filter((scr) => scr.id !== id)
        .map((scr) => ({
          ...scr,
          actions: scr.actions.filter(
            (a) => a.targetScreen !== id && a.errorTargetScreen !== id
          ),
        }));
      const removedActionIds = new Set(
        s.diagram.screens.find((scr) => scr.id === id)?.actions.map((a) => a.id) ?? []
      );
      const apiCalls = s.diagram.apiCalls.filter((a) => !removedActionIds.has(a.actionId));
      const positions = Object.fromEntries(
        Object.entries(s.nodePositions).filter(([k]) => k !== id)
      );
      return commit(s, { screens, apiCalls }, {
        nodePositions: positions,
        selection: { kind: "none" },
      }) as DiagramStore;
    });
  },

  // ── Action CRUD ─────────────────────────────────────────────────
  addAction: (screenId, targetScreenId) => {
    const actionId = uid("act");
    set((s) => {
      const screens = s.diagram.screens.map((scr) => {
        if (scr.id !== screenId) return scr;
        const newAction: Action = {
          id: actionId,
          label: "Nueva acción",
          targetScreen: targetScreenId ?? screenId,
        };
        return { ...scr, actions: [...scr.actions, newAction] };
      });
      return commit(s, { ...s.diagram, screens }) as DiagramStore;
    });
    return actionId;
  },

  updateAction: (screenId, actionId, patch) => {
    set((s) => {
      const screens = s.diagram.screens.map((scr) => {
        if (scr.id !== screenId) return scr;
        return {
          ...scr,
          actions: scr.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)),
        };
      });
      return commit(s, { ...s.diagram, screens }) as DiagramStore;
    });
  },

  deleteAction: (screenId, actionId) => {
    set((s) => {
      const screens = s.diagram.screens.map((scr) => {
        if (scr.id !== screenId) return scr;
        return { ...scr, actions: scr.actions.filter((a) => a.id !== actionId) };
      });
      const apiCalls = s.diagram.apiCalls.filter((a) => a.actionId !== actionId);
      return commit(s, { screens, apiCalls }, { selection: { kind: "none" } }) as DiagramStore;
    });
  },

  // ── ApiCall CRUD ────────────────────────────────────────────────
  setApiCall: (apiCall) => {
    set((s) => {
      const exists = s.diagram.apiCalls.some((a) => a.actionId === apiCall.actionId);
      const apiCalls = exists
        ? s.diagram.apiCalls.map((a) => (a.actionId === apiCall.actionId ? apiCall : a))
        : [...s.diagram.apiCalls, apiCall];
      return commit(s, { ...s.diagram, apiCalls }) as DiagramStore;
    });
  },

  updateApiCall: (actionId, patch) => {
    set((s) => {
      const apiCalls = s.diagram.apiCalls.map((a) =>
        a.actionId === actionId ? { ...a, ...patch } : a
      );
      return commit(s, { ...s.diagram, apiCalls }) as DiagramStore;
    });
  },

  deleteApiCall: (actionId) => {
    set((s) => {
      const apiCalls = s.diagram.apiCalls.filter((a) => a.actionId !== actionId);
      return commit(s, { ...s.diagram, apiCalls }) as DiagramStore;
    });
  },

  // ── Undo / Redo ─────────────────────────────────────────────────
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  undo: () => {
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      persist(prev, s.nodePositions);
      return {
        past: s.past.slice(0, -1),
        future: [s.diagram, ...s.future.slice(0, MAX_HISTORY - 1)],
        diagram: prev,
        jsonText: JSON.stringify(prev, null, 2),
        parseError: null,
        validationErrors: validateDiagram(prev),
      };
    });
  },

  redo: () => {
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      persist(next, s.nodePositions);
      return {
        past: [...s.past, s.diagram],
        future: s.future.slice(1),
        diagram: next,
        jsonText: JSON.stringify(next, null, 2),
        parseError: null,
        validationErrors: validateDiagram(next),
      };
    });
  },

  // ── Positions ───────────────────────────────────────────────────
  updateNodePosition: (id, pos) => {
    set((s) => {
      const nodePositions = { ...s.nodePositions, [id]: pos };
      persist(s.diagram, nodePositions);
      return { nodePositions };
    });
  },

  clearPositions: () => {
    set((s) => {
      persist(s.diagram, {});
      return { nodePositions: {} };
    });
  },

  // ── Search & filter ─────────────────────────────────────────────
  setSearchOpen: (open) => set({ searchOpen: open, searchTerm: open ? "" : get().searchTerm }),
  setSearchTerm: (term) => set({ searchTerm: term }),
  setFilterTag: (tag) => set({ filterTag: tag }),

  // ── Validation ──────────────────────────────────────────────────
  validate: () => {
    const errors = validateDiagram(get().diagram);
    set({ validationErrors: errors });
    return errors;
  },

  // ── Load external diagram (URL share) ────────────────────────────
  loadDiagram: (diagram) => {
    if (!diagram.apiCalls) diagram.apiCalls = [];
    persist(diagram, {});
    set({
      diagram,
      jsonText: JSON.stringify(diagram, null, 2),
      parseError: null,
      validationErrors: validateDiagram(diagram),
      past: [],
      future: [],
      nodePositions: {},
      selection: { kind: "none" },
    });
  },

  mergeRemoteDiagram: (diagram) => {
    if (!diagram.apiCalls) diagram.apiCalls = [];
    set({
      diagram,
      jsonText: JSON.stringify(diagram, null, 2),
      validationErrors: validateDiagram(diagram),
    });
  },

  // ── Helpers ─────────────────────────────────────────────────────
  getScreen: (id) => get().diagram.screens.find((s) => s.id === id),
  getApiCall: (actionId) => get().diagram.apiCalls.find((a) => a.actionId === actionId),

  getAllTags: () => {
    const tags = new Set<string>();
    get().diagram.screens.forEach((s) => s.tags?.forEach((t) => tags.add(t)));
    return [...tags].sort();
  },

  getProgress: () => {
    const screens = get().diagram.screens;
    const total = screens.length;
    const done = screens.filter((s) => s.status === "done").length;
    return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  },
}));

import { create } from "zustand";

export type EdgeStyle = "bezier" | "straight" | "step" | "smoothstep";
export type EdgeConnectMode = "flow" | "free";
export type Theme = "dark" | "light";
export type CardDensity = "full" | "compact" | "minimal";

const STORAGE_KEY = "diagram-preferences";

interface Preferences {
  theme: Theme;
  edgeStyle: EdgeStyle;
  edgeConnectMode: EdgeConnectMode;
  cardDensity: CardDensity;
  showEdgeLabels: boolean;
  showEdges: boolean;
}

interface PreferencesStore extends Preferences {
  setTheme: (theme: Theme) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  setEdgeConnectMode: (mode: EdgeConnectMode) => void;
  setCardDensity: (density: CardDensity) => void;
  setShowEdgeLabels: (show: boolean) => void;
  setShowEdges: (show: boolean) => void;
}

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Preferences>;
      return {
        theme: data.theme === "light" ? "light" : "dark",
        edgeStyle: (["bezier", "straight", "step", "smoothstep"] as const).includes(data.edgeStyle as EdgeStyle)
          ? data.edgeStyle as EdgeStyle
          : "bezier",
        edgeConnectMode: data.edgeConnectMode === "free" ? "free" : "flow",
        cardDensity: (["full", "compact", "minimal"] as const).includes(data.cardDensity as CardDensity)
          ? data.cardDensity as CardDensity
          : "full",
        showEdgeLabels: data.showEdgeLabels !== false,
        showEdges: data.showEdges !== false,
      };
    }
  } catch { /* corrupt */ }
  return {
    theme: "dark",
    edgeStyle: "bezier",
    edgeConnectMode: "flow",
    cardDensity: "full",
    showEdgeLabels: true,
    showEdges: true,
  };
}

function persist(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const initial = loadPreferences();

// Apply theme class on load
document.documentElement.classList.toggle("light", initial.theme === "light");

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  ...initial,

  setTheme: (theme) => {
    document.documentElement.classList.toggle("light", theme === "light");
    set({ theme });
    persist({ ...get(), theme });
  },

  setEdgeStyle: (edgeStyle) => {
    set({ edgeStyle });
    persist({ ...get(), edgeStyle });
  },

  setEdgeConnectMode: (edgeConnectMode) => {
    set({ edgeConnectMode });
    persist({ ...get(), edgeConnectMode });
  },

  setCardDensity: (cardDensity) => {
    set({ cardDensity });
    persist({ ...get(), cardDensity });
  },

  setShowEdgeLabels: (showEdgeLabels) => {
    set({ showEdgeLabels });
    persist({ ...get(), showEdgeLabels });
  },

  setShowEdges: (showEdges) => {
    set({ showEdges });
    persist({ ...get(), showEdges });
  },
}));

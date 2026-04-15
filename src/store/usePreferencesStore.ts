import { create } from "zustand";

export type EdgeStyle = "bezier" | "straight" | "step" | "smoothstep";
export type EdgeConnectMode = "flow" | "free";
export type Theme = "dark" | "light";

const STORAGE_KEY = "diagram-preferences";

interface Preferences {
  theme: Theme;
  edgeStyle: EdgeStyle;
  edgeConnectMode: EdgeConnectMode;
}

interface PreferencesStore extends Preferences {
  setTheme: (theme: Theme) => void;
  setEdgeStyle: (style: EdgeStyle) => void;
  setEdgeConnectMode: (mode: EdgeConnectMode) => void;
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
      };
    }
  } catch { /* corrupt */ }
  return { theme: "dark", edgeStyle: "bezier", edgeConnectMode: "flow" };
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
}));

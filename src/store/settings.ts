import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { applyTheme, type ThemeName, type Typography } from "@/lib/theme";
import { debounce } from "@/lib/utils";

export interface Behavior {
  pageTransition: "slide" | "fade" | "none";
  tapZones: boolean;
  autoSync: boolean;
  comicMode: "single" | "spread" | "strip";
  comicFit: "width" | "height" | "page";
  ttsRate: number;
  showRemaining: boolean;
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  font: "serif",
  fontSize: 19,
  lineHeight: 1.62,
  margin: 8,
  justify: false,
  paragraphSpacing: 0.85,
  letterSpacing: 0,
  columns: "auto",
};

export const DEFAULT_BEHAVIOR: Behavior = {
  pageTransition: "slide",
  tapZones: true,
  autoSync: true,
  comicMode: "single",
  comicFit: "width",
  ttsRate: 1,
  showRemaining: true,
};

interface SettingsState {
  loaded: boolean;
  theme: ThemeName;
  typography: Typography;
  behavior: Behavior;
  syncFolder: string | null;
  load: () => Promise<void>;
  setTheme: (theme: ThemeName) => void;
  setTypography: (patch: Partial<Typography>) => void;
  setBehavior: (patch: Partial<Behavior>) => void;
  setSyncFolder: (folder: string | null) => Promise<void>;
}

/** Writes are debounced because sliders fire on every pixel of travel. */
const persist = debounce((key: string, value: string) => {
  void ipc.setSetting(key, value);
}, 300);

/** Merges stored JSON over defaults so a new setting never breaks an old profile. */
function parse<T extends object>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  loaded: false,
  theme: "dark",
  typography: DEFAULT_TYPOGRAPHY,
  behavior: DEFAULT_BEHAVIOR,
  syncFolder: null,

  load: async () => {
    const [stored, syncFolder] = await Promise.all([ipc.getSettings(), ipc.getSyncFolder()]);
    const theme = (stored.theme as ThemeName) || "dark";
    applyTheme(theme);
    set({
      loaded: true,
      theme,
      typography: parse(stored.typography, DEFAULT_TYPOGRAPHY),
      behavior: parse(stored.behavior, DEFAULT_BEHAVIOR),
      syncFolder: syncFolder || null,
    });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
    persist("theme", theme);
  },

  setTypography: (patch) => {
    const typography = { ...get().typography, ...patch };
    set({ typography });
    persist("typography", JSON.stringify(typography));
  },

  setBehavior: (patch) => {
    const behavior = { ...get().behavior, ...patch };
    set({ behavior });
    persist("behavior", JSON.stringify(behavior));
  },

  setSyncFolder: async (folder) => {
    await ipc.setSyncFolder(folder);
    set({ syncFolder: folder });
  },
}));

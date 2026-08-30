import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import {
  applyTheme,
  resolveTheme,
  type AccentId,
  type ThemeMode,
  type ThemeName,
  type Typography,
} from "@/lib/theme";
import { debounce } from "@/lib/utils";

export interface Behavior {
  pageTransition: "slide" | "fade" | "none";
  tapZones: boolean;
  autoSync: boolean;
  comicMode: "single" | "spread" | "strip";
  comicFit: "width" | "height" | "page";
  ttsRate: number;
  showRemaining: boolean;
  showChapterMarks: boolean;
  autoScrollSpeed: number;
  /** Starting state of the library screen, restored on every launch. */
  defaultView: "grid" | "list";
  defaultSort: string;
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
  showChapterMarks: true,
  autoScrollSpeed: 40,
  defaultView: "grid",
  defaultSort: "recent",
};

/** Minutes a day, the target the stats ring fills up. */
export const DEFAULT_GOAL = 20;

interface SettingsState {
  loaded: boolean;
  /** The theme chosen explicitly; only in force when `themeMode` is "fixed". */
  theme: ThemeName;
  themeMode: ThemeMode;
  lightTheme: ThemeName;
  darkTheme: ThemeName;
  accent: AccentId;
  /** What is actually painted right now — what components should read. */
  activeTheme: ThemeName;
  typography: Typography;
  behavior: Behavior;
  dailyGoal: number;
  syncFolder: string | null;

  load: () => Promise<void>;
  setTheme: (theme: ThemeName) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setSchemeTheme: (scheme: "light" | "dark", theme: ThemeName) => void;
  setAccent: (accent: AccentId) => void;
  setTypography: (patch: Partial<Typography>) => void;
  setBehavior: (patch: Partial<Behavior>) => void;
  setDailyGoal: (minutes: number) => void;
  setSyncFolder: (folder: string | null) => Promise<void>;
  resetReadingDefaults: () => void;
  /** Re-evaluates "auto" mode after the system switches appearance. */
  syncWithSystem: () => void;
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

export const useSettings = create<SettingsState>((set, get) => {
  /** Recomputes the theme in force and paints it. */
  const paint = (patch: Partial<SettingsState> = {}) => {
    const next = { ...get(), ...patch };
    const activeTheme = resolveTheme(
      next.themeMode,
      next.theme,
      next.lightTheme,
      next.darkTheme,
    );
    applyTheme(activeTheme, next.accent);
    set({ ...patch, activeTheme } as Partial<SettingsState>);
  };

  return {
    loaded: false,
    theme: "dark",
    themeMode: "fixed",
    lightTheme: "paper",
    darkTheme: "dark",
    accent: "amber",
    activeTheme: "dark",
    typography: DEFAULT_TYPOGRAPHY,
    behavior: DEFAULT_BEHAVIOR,
    dailyGoal: DEFAULT_GOAL,
    syncFolder: null,

    load: async () => {
      const [stored, syncFolder] = await Promise.all([ipc.getSettings(), ipc.getSyncFolder()]);
      const goal = Number(stored.dailyGoal);
      paint({
        loaded: true,
        theme: (stored.theme as ThemeName) || "dark",
        themeMode: (stored.themeMode as ThemeMode) || "fixed",
        lightTheme: (stored.lightTheme as ThemeName) || "paper",
        darkTheme: (stored.darkTheme as ThemeName) || "dark",
        accent: (stored.accent as AccentId) || "amber",
        typography: parse(stored.typography, DEFAULT_TYPOGRAPHY),
        behavior: parse(stored.behavior, DEFAULT_BEHAVIOR),
        dailyGoal: Number.isFinite(goal) && goal > 0 ? goal : DEFAULT_GOAL,
        syncFolder: syncFolder || null,
      });
    },

    setTheme: (theme) => {
      // Picking a theme by hand is an implicit request to stop following the
      // system, otherwise the choice would be undone at the next sunset.
      paint({ theme, themeMode: "fixed" });
      persist("theme", theme);
      persist("themeMode", "fixed");
    },

    setThemeMode: (themeMode) => {
      paint({ themeMode });
      persist("themeMode", themeMode);
    },

    setSchemeTheme: (scheme, theme) => {
      const key = scheme === "light" ? "lightTheme" : "darkTheme";
      paint({ [key]: theme } as Partial<SettingsState>);
      persist(key, theme);
    },

    setAccent: (accent) => {
      paint({ accent });
      persist("accent", accent);
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

    setDailyGoal: (minutes) => {
      const dailyGoal = Math.max(1, Math.round(minutes));
      set({ dailyGoal });
      persist("dailyGoal", String(dailyGoal));
    },

    setSyncFolder: async (folder) => {
      await ipc.setSyncFolder(folder);
      set({ syncFolder: folder });
    },

    resetReadingDefaults: () => {
      set({ typography: DEFAULT_TYPOGRAPHY, behavior: DEFAULT_BEHAVIOR });
      persist("typography", JSON.stringify(DEFAULT_TYPOGRAPHY));
      persist("behavior", JSON.stringify(DEFAULT_BEHAVIOR));
    },

    syncWithSystem: () => {
      if (get().themeMode === "auto") paint();
    },
  };
});

/**
 * Keeps "auto" honest: the OS can switch appearance while the app is open, and
 * without this the window would keep the theme it started with.
 */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!query) return () => {};
  const listener = () => useSettings.getState().syncWithSystem();
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

import { alpha, darken, lighten, luminance, mix } from "./color";

/**
 * One palette drives both the application chrome and the book page. The reader
 * renders inside an iframe (epub.js) or a shadowed container (MOBI), so the
 * same tokens are exported twice: as CSS variables for the shell, and as a
 * plain style string for the book.
 *
 * Theme and accent are chosen separately: eight themes × eight accents, with
 * the accent's supporting tones derived in `accentTokens` rather than written
 * out sixty-four times.
 */

export type ThemeName =
  | "light"
  | "paper"
  | "sepia"
  | "gray"
  | "dark"
  | "night"
  | "forest"
  | "oled";

export type Scheme = "light" | "dark";

interface Theme {
  label: string;
  scheme: Scheme;
  /** Shown in the theme picker as a two-tone chip. */
  swatch: [string, string];
  tokens: Record<string, string>;
}

export const THEMES: Record<ThemeName, Theme> = {
  light: {
    label: "Day",
    scheme: "light",
    swatch: ["#f6f4f0", "#1c1917"],
    tokens: {
      "--bg": "#f6f4f0",
      "--surface": "#ffffff",
      "--surface-2": "#efece6",
      "--border": "#e0dbd2",
      "--text": "#1c1917",
      "--text-dim": "#78716c",
      "--paper": "#fffdf9",
      "--ink": "#1c1917",
      "--shadow": "0 1px 2px rgba(28,25,23,.06), 0 8px 24px rgba(28,25,23,.08)",
    },
  },
  paper: {
    label: "Paper",
    scheme: "light",
    swatch: ["#faf7f0", "#2b2622"],
    tokens: {
      "--bg": "#f3efe6",
      "--surface": "#fdfaf3",
      "--surface-2": "#eae4d7",
      "--border": "#ded6c6",
      "--text": "#2b2622",
      "--text-dim": "#857c6d",
      "--paper": "#fdfaf3",
      "--ink": "#2b2622",
      "--shadow": "0 1px 2px rgba(43,38,34,.07), 0 8px 24px rgba(43,38,34,.09)",
    },
  },
  sepia: {
    label: "Sepia",
    scheme: "light",
    swatch: ["#efe4d0", "#3b2f22"],
    tokens: {
      "--bg": "#efe4d0",
      "--surface": "#faf1de",
      "--surface-2": "#e7dac2",
      "--border": "#d9c9ab",
      "--text": "#3b2f22",
      "--text-dim": "#8a7761",
      "--paper": "#f8efdc",
      "--ink": "#3b2f22",
      "--shadow": "0 1px 2px rgba(59,47,34,.08), 0 8px 24px rgba(59,47,34,.10)",
    },
  },
  gray: {
    label: "Gray",
    scheme: "dark",
    swatch: ["#33322f", "#e7e4de"],
    tokens: {
      "--bg": "#33322f",
      "--surface": "#3d3c39",
      "--surface-2": "#474540",
      "--border": "#55524c",
      "--text": "#e7e4de",
      "--text-dim": "#a6a199",
      "--paper": "#3a3936",
      "--ink": "#e2ded7",
      "--shadow": "0 1px 2px rgba(0,0,0,.28), 0 10px 30px rgba(0,0,0,.34)",
    },
  },
  dark: {
    label: "Night",
    scheme: "dark",
    swatch: ["#17130f", "#eee6da"],
    tokens: {
      "--bg": "#17130f",
      "--surface": "#211b16",
      "--surface-2": "#2b231c",
      "--border": "#3a3028",
      "--text": "#eee6da",
      "--text-dim": "#a29584",
      "--paper": "#1d1813",
      "--ink": "#e3dacb",
      "--shadow": "0 1px 2px rgba(0,0,0,.4), 0 12px 34px rgba(0,0,0,.45)",
    },
  },
  night: {
    label: "Ocean",
    scheme: "dark",
    swatch: ["#0f1720", "#dce6ef"],
    tokens: {
      "--bg": "#0f1720",
      "--surface": "#16202b",
      "--surface-2": "#1e2b38",
      "--border": "#2a3947",
      "--text": "#dce6ef",
      "--text-dim": "#8b9bab",
      "--paper": "#131d27",
      "--ink": "#d5e0ea",
      "--shadow": "0 1px 2px rgba(0,0,0,.4), 0 12px 34px rgba(0,0,0,.5)",
    },
  },
  forest: {
    label: "Forest",
    scheme: "dark",
    swatch: ["#111a15", "#dde8e0"],
    tokens: {
      "--bg": "#111a15",
      "--surface": "#18241d",
      "--surface-2": "#203026",
      "--border": "#2c3f33",
      "--text": "#dde8e0",
      "--text-dim": "#8ba093",
      "--paper": "#15201a",
      "--ink": "#d7e3da",
      "--shadow": "0 1px 2px rgba(0,0,0,.4), 0 12px 34px rgba(0,0,0,.48)",
    },
  },
  oled: {
    label: "Black",
    scheme: "dark",
    swatch: ["#000000", "#e6e6e6"],
    tokens: {
      "--bg": "#000000",
      "--surface": "#0b0b0b",
      "--surface-2": "#141414",
      "--border": "#242424",
      "--text": "#e6e6e6",
      "--text-dim": "#8c8c8c",
      "--paper": "#000000",
      "--ink": "#d8d8d8",
      "--shadow": "0 1px 2px rgba(0,0,0,.6), 0 12px 34px rgba(0,0,0,.6)",
    },
  },
};

export const THEME_ORDER: ThemeName[] = [
  "light",
  "paper",
  "sepia",
  "gray",
  "dark",
  "night",
  "forest",
  "oled",
];

export const LIGHT_THEMES = THEME_ORDER.filter((name) => THEMES[name].scheme === "light");
export const DARK_THEMES = THEME_ORDER.filter((name) => THEMES[name].scheme === "dark");

export type AccentId =
  | "amber"
  | "rust"
  | "rose"
  | "violet"
  | "indigo"
  | "teal"
  | "green"
  | "slate";

export const ACCENTS: Array<{ id: AccentId; label: string; base: string }> = [
  { id: "amber", label: "Amber", base: "#d99a45" },
  { id: "rust", label: "Rust", base: "#c2653c" },
  { id: "rose", label: "Rose", base: "#cd5f74" },
  { id: "violet", label: "Violet", base: "#8b6fd0" },
  { id: "indigo", label: "Indigo", base: "#5a7fd4" },
  { id: "teal", label: "Teal", base: "#3fa39a" },
  { id: "green", label: "Green", base: "#5c9e58" },
  { id: "slate", label: "Slate", base: "#7c8794" },
];

export function accentBase(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.base ?? ACCENTS[0].base;
}

/**
 * Derives the accent trio from one base colour and the theme it sits on. Dark
 * themes need the accent lifted to stay legible; light themes need it deepened
 * so text on a tinted chip still passes.
 */
export function accentTokens(id: AccentId, theme: ThemeName): Record<string, string> {
  const base = accentBase(id);
  const { scheme, tokens } = THEMES[theme] ?? THEMES.dark;
  const accent = scheme === "dark" ? lighten(base, 0.08) : darken(base, 0.14);
  const soft = mix(base, tokens["--surface"], scheme === "dark" ? 0.82 : 0.78);
  return {
    "--accent": accent,
    "--accent-soft": soft,
    "--on-accent": luminance(accent) > 0.5 ? "#17130f" : "#ffffff",
    "--accent-ring": alpha(accent, 0.28),
  };
}

export type ThemeMode = "fixed" | "auto";

/**
 * Which theme is actually in force. In `auto` the operating system decides
 * between the reader's chosen light and dark themes.
 */
export function resolveTheme(
  mode: ThemeMode,
  fixed: ThemeName,
  light: ThemeName,
  dark: ThemeName,
): ThemeName {
  if (mode === "fixed") return fixed;
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? dark : light;
}

export function applyTheme(name: ThemeName, accent: AccentId) {
  const theme = THEMES[name] ?? THEMES.dark;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
  for (const [key, value] of Object.entries(accentTokens(accent, name))) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = name;
  root.dataset.scheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
}

export const FONTS = [
  // Stacks name a preferred face first, then fall back to something every
  // platform ships — the app bundles no webfonts, so the fallback is what most
  // readers actually see.
  { id: "serif", label: "Serif", stack: "'Literata', 'Iowan Old Style', Georgia, serif" },
  { id: "sans", label: "Sans", stack: "'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif" },
  { id: "humanist", label: "Humanist", stack: "Optima, Candara, 'Gill Sans', sans-serif" },
  { id: "old-style", label: "Old style", stack: "'EB Garamond', Garamond, 'Palatino', serif" },
  { id: "mono", label: "Mono", stack: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace" },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export function fontStack(id: FontId): string {
  return FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack;
}

/** Highlight colours, tuned to stay legible on both paper and night themes. */
export const HIGHLIGHT_COLORS = [
  { id: "amber", label: "Amber", value: "#f5b642" },
  { id: "rose", label: "Rose", value: "#ef7a85" },
  { id: "mint", label: "Mint", value: "#5ec9a0" },
  { id: "sky", label: "Sky", value: "#66aee6" },
  { id: "violet", label: "Violet", value: "#a98ce0" },
] as const;

export interface Typography {
  font: FontId;
  fontSize: number;
  lineHeight: number;
  /** Side margin as a percentage of the viewport width. */
  margin: number;
  justify: boolean;
  paragraphSpacing: number;
  letterSpacing: number;
  columns: "auto" | "single" | "double";
}

/**
 * CSS applied inside the book itself. Written as a string because epub.js
 * injects stylesheets into its iframe by text, and the MOBI reader reuses the
 * exact same rules so both formats read identically.
 */
export function bookCss(theme: ThemeName, type: Typography, accent: AccentId = "amber"): string {
  const tokens = (THEMES[theme] ?? THEMES.dark).tokens;
  const accentColor = accentTokens(accent, theme)["--accent"];
  return `
    :root { color-scheme: ${THEMES[theme].scheme}; }
    body {
      background: ${tokens["--paper"]} !important;
      color: ${tokens["--ink"]} !important;
      font-family: ${fontStack(type.font)} !important;
      font-size: ${type.fontSize}px !important;
      line-height: ${type.lineHeight} !important;
      letter-spacing: ${type.letterSpacing}em !important;
      text-align: ${type.justify ? "justify" : "start"} !important;
      hyphens: ${type.justify ? "auto" : "manual"};
      -webkit-hyphens: ${type.justify ? "auto" : "manual"};
      padding: 0 !important;
    }
    p, li, dd, blockquote {
      font-family: inherit !important;
      font-size: inherit !important;
      line-height: inherit !important;
      color: inherit !important;
      text-align: inherit !important;
      margin-block: ${type.paragraphSpacing}em !important;
    }
    h1, h2, h3, h4, h5, h6 {
      color: ${tokens["--ink"]} !important;
      font-family: inherit !important;
      line-height: 1.25 !important;
      text-align: start !important;
      hyphens: manual;
    }
    a { color: ${accentColor} !important; text-decoration-thickness: 1px; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
    /* Publisher-set page colours are the single biggest cause of a white flash
       when switching to a dark theme. */
    [style*="background"] { background-color: transparent !important; }
    hr.page-break { border: 0; border-top: 1px solid ${tokens["--border"]}; margin: 2.5em 0; }
    ::selection { background: ${alpha(accentColor, 0.32)}; }
  `;
}

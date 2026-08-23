/**
 * One palette drives both the application chrome and the book page. The reader
 * renders inside an iframe (epub.js) or a shadowed container (MOBI), so the
 * same tokens are exported twice: as CSS variables for the shell, and as a
 * plain style object for the book.
 */

export type ThemeName = "light" | "sepia" | "gray" | "dark" | "oled";

interface Theme {
  label: string;
  /** `light` or `dark` — drives form controls and scrollbars inside the book. */
  scheme: "light" | "dark";
  tokens: Record<string, string>;
}

export const THEMES: Record<ThemeName, Theme> = {
  light: {
    label: "Day",
    scheme: "light",
    tokens: {
      "--bg": "#f6f4f0",
      "--surface": "#ffffff",
      "--surface-2": "#efece6",
      "--border": "#e0dbd2",
      "--text": "#1c1917",
      "--text-dim": "#78716c",
      "--accent": "#b45309",
      "--accent-soft": "#fef3c7",
      "--on-accent": "#ffffff",
      "--paper": "#fffdf9",
      "--ink": "#1c1917",
      "--shadow": "0 1px 2px rgba(28,25,23,.06), 0 8px 24px rgba(28,25,23,.08)",
    },
  },
  sepia: {
    label: "Sepia",
    scheme: "light",
    tokens: {
      "--bg": "#efe4d0",
      "--surface": "#faf1de",
      "--surface-2": "#e7dac2",
      "--border": "#d9c9ab",
      "--text": "#3b2f22",
      "--text-dim": "#8a7761",
      "--accent": "#9a5b1e",
      "--accent-soft": "#f2ddb9",
      "--on-accent": "#fff8ec",
      "--paper": "#f8efdc",
      "--ink": "#3b2f22",
      "--shadow": "0 1px 2px rgba(59,47,34,.08), 0 8px 24px rgba(59,47,34,.10)",
    },
  },
  gray: {
    label: "Gray",
    scheme: "dark",
    tokens: {
      "--bg": "#33322f",
      "--surface": "#3d3c39",
      "--surface-2": "#474540",
      "--border": "#55524c",
      "--text": "#e7e4de",
      "--text-dim": "#a6a199",
      "--accent": "#e0a458",
      "--accent-soft": "#4b4239",
      "--on-accent": "#241d14",
      "--paper": "#3a3936",
      "--ink": "#e2ded7",
      "--shadow": "0 1px 2px rgba(0,0,0,.28), 0 10px 30px rgba(0,0,0,.34)",
    },
  },
  dark: {
    label: "Night",
    scheme: "dark",
    tokens: {
      "--bg": "#17130f",
      "--surface": "#211b16",
      "--surface-2": "#2b231c",
      "--border": "#3a3028",
      "--text": "#eee6da",
      "--text-dim": "#a29584",
      "--accent": "#e1a24a",
      "--accent-soft": "#3a2c1a",
      "--on-accent": "#1a1309",
      "--paper": "#1d1813",
      "--ink": "#e3dacb",
      "--shadow": "0 1px 2px rgba(0,0,0,.4), 0 12px 34px rgba(0,0,0,.45)",
    },
  },
  oled: {
    label: "Black",
    scheme: "dark",
    tokens: {
      "--bg": "#000000",
      "--surface": "#0b0b0b",
      "--surface-2": "#141414",
      "--border": "#242424",
      "--text": "#e6e6e6",
      "--text-dim": "#8c8c8c",
      "--accent": "#d99a45",
      "--accent-soft": "#221a10",
      "--on-accent": "#0a0703",
      "--paper": "#000000",
      "--ink": "#d8d8d8",
      "--shadow": "0 1px 2px rgba(0,0,0,.6), 0 12px 34px rgba(0,0,0,.6)",
    },
  },
};

export const THEME_ORDER: ThemeName[] = ["light", "sepia", "gray", "dark", "oled"];

export function applyTheme(name: ThemeName) {
  const theme = THEMES[name] ?? THEMES.dark;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = name;
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
export function bookCss(theme: ThemeName, type: Typography): string {
  const tokens = (THEMES[theme] ?? THEMES.dark).tokens;
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
    a { color: ${tokens["--accent"]} !important; text-decoration-thickness: 1px; }
    img, svg, video { max-width: 100% !important; height: auto !important; }
    /* Publisher-set page colours are the single biggest cause of a white flash
       when switching to a dark theme. */
    [style*="background"] { background-color: transparent !important; }
    hr.page-break { border: 0; border-top: 1px solid ${tokens["--border"]}; margin: 2.5em 0; }
    ::selection { background: ${tokens["--accent"]}55; }
  `;
}

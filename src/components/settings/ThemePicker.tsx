import { Check } from "lucide-react";
import {
  ACCENTS,
  THEMES,
  THEME_ORDER,
  accentBase,
  accentTokens,
  fontStack,
  type AccentId,
  type ThemeName,
  type Typography,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeSwatchesProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
  /** Restricts the list, used by the light/dark pair in automatic mode. */
  only?: ThemeName[];
  accent: AccentId;
}

/**
 * Themes are picked by looking at them, not by reading their names — each chip
 * paints its own palette so the choice is made from the colours themselves.
 */
export function ThemeSwatches({ value, onChange, only, accent }: ThemeSwatchesProps) {
  const names = only ?? THEME_ORDER;

  return (
    <div className="grid grid-cols-4 gap-2">
      {names.map((name) => {
        const theme = THEMES[name];
        const active = value === name;
        return (
          <button
            key={name}
            onClick={() => onChange(name)}
            aria-pressed={active}
            className={cn(
              "group relative overflow-hidden rounded-xl border p-2 text-left transition",
              active
                ? "border-accent ring-2 ring-[var(--accent-ring)]"
                : "border-line hover:border-dim",
            )}
            style={{ background: theme.tokens["--bg"] }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="h-6 w-6 rounded-md ring-1 ring-black/10"
                style={{ background: theme.tokens["--paper"] }}
              />
              <span className="flex flex-1 flex-col gap-1">
                <span
                  className="block h-1.5 w-full rounded-full"
                  style={{ background: theme.tokens["--text"], opacity: 0.75 }}
                />
                <span
                  className="block h-1.5 w-2/3 rounded-full"
                  style={{ background: theme.tokens["--text-dim"], opacity: 0.7 }}
                />
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: accentTokens(accent, name)["--accent"] }}
              />
            </span>
            <span
              className="mt-1.5 block text-[11px] font-medium"
              style={{ color: theme.tokens["--text"] }}
            >
              {theme.label}
            </span>
            {active ? (
              <Check
                size={12}
                strokeWidth={3}
                className="absolute top-1.5 right-1.5"
                style={{ color: accentTokens(accent, name)["--accent"] }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function AccentSwatches({
  value,
  onChange,
}: {
  value: AccentId;
  onChange: (accent: AccentId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ACCENTS.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          title={item.label}
          aria-label={item.label}
          aria-pressed={value === item.id}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full transition",
            value === item.id ? "ring-2 ring-[var(--accent)] ring-offset-2" : "hover:scale-110",
          )}
          style={{ "--tw-ring-offset-color": "var(--bg)" } as React.CSSProperties}
        >
          <span
            className="h-5 w-5 rounded-full ring-1 ring-black/15"
            style={{ background: accentBase(item.id) }}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * A page of a book, at a glance. Changing theme, accent or typography anywhere
 * in Settings is reflected here immediately, so nobody has to open a book to
 * find out what a slider did.
 */
export function PagePreview({
  theme,
  accent,
  typography,
}: {
  theme: ThemeName;
  accent: AccentId;
  typography: Typography;
}) {
  const tokens = THEMES[theme].tokens;
  const accentColor = accentTokens(accent, theme)["--accent"];

  return (
    <div
      className="overflow-hidden rounded-xl border border-line shadow-[var(--shadow)]"
      style={{ background: tokens["--paper"] }}
    >
      <div
        style={{
          color: tokens["--ink"],
          fontFamily: fontStack(typography.font),
          fontSize: Math.max(11, typography.fontSize * 0.62),
          lineHeight: typography.lineHeight,
          letterSpacing: `${typography.letterSpacing}em`,
          textAlign: typography.justify ? "justify" : "start",
          paddingInline: `${Math.max(6, typography.margin)}%`,
          paddingBlock: "1.1rem",
        }}
      >
        <p style={{ fontSize: "1.5em", lineHeight: 1.2, margin: "0 0 .5em" }}>Chapter One</p>
        <p style={{ margin: `${typography.paragraphSpacing}em 0` }}>
          In the hour before dawn the lamplighter walked the long street, and one by one the small
          flames went out behind him.
        </p>
        <p style={{ margin: `${typography.paragraphSpacing}em 0` }}>
          He counted them as a shepherd counts sheep, and when{" "}
          <span style={{ background: `${accentColor}55`, borderRadius: 2 }}>the last was dark</span>{" "}
          he turned to see the sky already the colour of weak tea.
        </p>
      </div>
      <div
        className="flex items-center justify-between px-3 py-1.5 text-[10px]"
        style={{ background: tokens["--surface"], color: tokens["--text-dim"] }}
      >
        <span>34%</span>
        <span style={{ color: accentColor }}>Chapter One</span>
      </div>
    </div>
  );
}

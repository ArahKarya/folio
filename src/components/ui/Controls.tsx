import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, display, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] text-dim">{label}</span>
        <span className="tabular text-[13px] text-ink">{display ?? value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface2 accent-[var(--accent)]"
      />
    </label>
  );
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  className?: string;
}

/** Radio group styled as a pill bar — used for themes, fonts, view modes. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <div className={className}>
      {label ? <div className="mb-2 text-[13px] text-dim">{label}</div> : null}
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-surface2 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            role="radio"
            aria-checked={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition",
              value === option.value
                ? "bg-surface text-ink shadow-[var(--shadow)]"
                : "text-dim hover:text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SwitchProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, hint, checked, onChange }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-1.5 text-left"
    >
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint ? <span className="block text-[12px] text-dim">{hint}</span> : null}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition",
          checked ? "bg-accent" : "bg-surface2 border border-line",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-white transition-all",
            checked ? "left-5" : "left-1",
          )}
        />
      </span>
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-dim">{label}</span>
      {children}
    </label>
  );
}

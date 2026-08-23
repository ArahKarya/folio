import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
  ghost: "text-dim hover:text-ink hover:bg-surface2",
  outline: "border border-line text-ink hover:bg-surface2",
  danger: "text-red-400 hover:bg-red-500/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
};

export function Button({ variant = "outline", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "no-drag inline-flex items-center justify-center font-medium transition",
        "disabled:opacity-40 disabled:pointer-events-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

/** Square action button. `label` is required — these never carry visible text. */
export function IconButton({ label, active, className, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "no-drag grid h-9 w-9 shrink-0 place-items-center rounded-lg transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:opacity-40 disabled:pointer-events-none",
        active ? "bg-accent-soft text-accent" : "text-dim hover:bg-surface2 hover:text-ink",
        className,
      )}
    />
  );
}

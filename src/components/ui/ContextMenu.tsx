import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** Draws a divider above this entry. */
  separated?: boolean;
}

interface ContextMenuProps {
  /** Viewport coordinates of the click that opened it. */
  at: { x: number; y: number } | null;
  items: MenuItem[];
  onClose: () => void;
}

const WIDTH = 208;

/**
 * Right-click menu. Positioned in viewport coordinates and flipped when it
 * would run off an edge, so a book in the last column still gets a full menu.
 */
export function ContextMenu({ at, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!at) return;
    const dismiss = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // `capture` so the menu closes before the click lands on whatever is under it.
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [at, onClose]);

  if (!at) return null;

  const height = items.length * 34 + 12;
  const left = Math.min(at.x, window.innerWidth - WIDTH - 8);
  const top = at.y + height > window.innerHeight ? Math.max(8, at.y - height) : at.y;

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        role="menu"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        style={{ left, top, width: WIDTH, transformOrigin: "top left" }}
        className="panel fixed z-[70] p-1.5"
      >
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition",
              item.separated && "mt-1 border-t border-line pt-2.5",
              item.danger
                ? "text-red-400 hover:bg-red-500/10"
                : "text-ink hover:bg-surface2",
            )}
          >
            <span className="text-dim">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

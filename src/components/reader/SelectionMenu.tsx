import { AnimatePresence, motion } from "framer-motion";
import { Copy, StickyNote, X } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { HIGHLIGHT_COLORS } from "@/lib/theme";

export interface PendingSelection {
  cfi: string;
  text: string;
  /** Viewport coordinates of the selection's top edge. */
  x: number;
  y: number;
}

interface SelectionMenuProps {
  selection: PendingSelection | null;
  onDismiss: () => void;
  onHighlight: (color: string, note: string | null) => void | Promise<void>;
}

const MENU_WIDTH = 268;

export function SelectionMenu({ selection, onDismiss, onHighlight }: SelectionMenuProps) {
  const [noteMode, setNoteMode] = useState(false);
  const [note, setNote] = useState("");
  const [color, setColor] = useState<string>(HIGHLIGHT_COLORS[0].value);

  useEffect(() => {
    setNoteMode(false);
    setNote("");
  }, [selection?.cfi]);

  if (!selection) return null;

  // Keep the menu on screen when the selection sits near an edge.
  const left = Math.min(
    Math.max(selection.x - MENU_WIDTH / 2, 12),
    window.innerWidth - MENU_WIDTH - 12,
  );
  const above = selection.y > 190;
  const top = above ? selection.y - (noteMode ? 168 : 62) : selection.y + 28;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        style={{ left, top, width: MENU_WIDTH }}
        className="panel fixed z-40 p-2"
      >
        <div className="flex items-center gap-1">
          {HIGHLIGHT_COLORS.map((swatch) => (
            <button
              key={swatch.id}
              title={swatch.label}
              aria-label={`Highlight in ${swatch.label}`}
              onClick={() => {
                setColor(swatch.value);
                if (!noteMode) void onHighlight(swatch.value, null);
              }}
              className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-surface2"
            >
              <span
                className="h-4.5 w-4.5 rounded-full ring-1 ring-black/15"
                style={{
                  background: swatch.value,
                  outline: noteMode && color === swatch.value ? "2px solid var(--accent)" : undefined,
                  outlineOffset: "2px",
                }}
              />
            </button>
          ))}
          <span className="mx-0.5 h-5 w-px bg-[var(--border)]" />
          <IconButton
            label="Add a note"
            active={noteMode}
            onClick={() => setNoteMode((value) => !value)}
          >
            <StickyNote size={16} />
          </IconButton>
          <IconButton
            label="Copy text"
            onClick={() => {
              void navigator.clipboard.writeText(selection.text);
              toast.info("Copied.");
              onDismiss();
            }}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton label="Dismiss" onClick={onDismiss}>
            <X size={16} />
          </IconButton>
        </div>

        {noteMode ? (
          <div className="mt-2">
            <textarea
              autoFocus
              value={note}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  void onHighlight(color, note.trim() || null);
                }
              }}
              placeholder="Your note…"
              className="field min-h-20 resize-none text-[13px]"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[11px] text-dim">⌘↵ to save</span>
              <button
                onClick={() => void onHighlight(color, note.trim() || null)}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent"
              >
                Save note
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 line-clamp-2 px-1 text-[11.5px] leading-snug text-dim">
            {selection.text}
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CornerDownLeft, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookCover } from "@/components/library/BookCover";
import { fuzzyRank } from "@/lib/fuzzy";
import { modKey } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import type { Book } from "@/types";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  onOpenBook: (book: Book) => void;
}

type Entry =
  | { kind: "command"; command: Command }
  | { kind: "book"; book: Book };

/**
 * One box for everything: books by title or author, and every action the app
 * can take. Opens on ⌘K and closes on Escape.
 */
export function CommandPalette({ open, onClose, commands, onOpenBook }: CommandPaletteProps) {
  const books = useLibrary((state) => state.books);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      // With nothing typed, offer the actions plus a few books to carry on with.
      const recent = [...books]
        .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
        .slice(0, 5);
      return [
        ...commands.map((command) => ({ kind: "command" as const, command })),
        ...recent.map((book) => ({ kind: "book" as const, book })),
      ];
    }

    const matchedCommands = fuzzyRank(
      commands,
      trimmed,
      (command) => [command.label, command.keywords ?? ""],
      8,
    ).map(({ item }) => ({ kind: "command" as const, command: item }));

    const matchedBooks = fuzzyRank(
      books,
      trimmed,
      (book) => [book.title, book.author ?? "", book.series ?? ""],
      24,
    ).map(({ item }) => ({ kind: "book" as const, book: item }));

    return [...matchedCommands, ...matchedBooks];
  }, [query, commands, books]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, entries.length - 1)));
  }, [entries.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const choose = (entry: Entry) => {
    onClose();
    if (entry.kind === "command") entry.command.run();
    else onOpenBook(entry.book);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => (current + 1) % Math.max(1, entries.length));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => (current - 1 + entries.length) % Math.max(1, entries.length));
        break;
      case "Enter": {
        event.preventDefault();
        const entry = entries[active];
        if (entry) choose(entry);
        break;
      }
      case "Escape":
        event.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
      >
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />

        <motion.div
          role="dialog"
          aria-modal
          aria-label="Command palette"
          initial={{ opacity: 0, scale: 0.98, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="panel relative flex w-full max-w-xl flex-col overflow-hidden"
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Search size={17} className="shrink-0 text-dim" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a book or run a command…"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-dim"
            />
            <kbd className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-[11px] text-dim">
              Esc
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
            {!entries.length ? (
              <p className="px-3 py-6 text-center text-[13px] text-dim">Nothing matches.</p>
            ) : (
              entries.map((entry, index) => (
                <button
                  key={entry.kind === "command" ? entry.command.id : entry.book.id}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(entry)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
                    active === index ? "bg-accent-soft" : "hover:bg-surface2",
                  )}
                >
                  {entry.kind === "command" ? (
                    <>
                      <span
                        className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface2",
                          active === index ? "text-accent" : "text-dim",
                        )}
                      >
                        {entry.command.icon ?? <CornerDownLeft size={15} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {entry.command.label}
                        </span>
                        {entry.command.hint ? (
                          <span className="block truncate text-[11.5px] text-dim">
                            {entry.command.hint}
                          </span>
                        ) : null}
                      </span>
                    </>
                  ) : (
                    <>
                      <BookCover book={entry.book} className="h-10 w-7 shrink-0" rounded="rounded" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {entry.book.title}
                        </span>
                        <span className="block truncate text-[11.5px] text-dim">
                          {entry.book.author ?? "Unknown author"}
                        </span>
                      </span>
                      <BookOpen size={14} className="shrink-0 text-dim" />
                    </>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-dim">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span className="ml-auto">{modKey()}K</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

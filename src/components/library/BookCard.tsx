import { motion } from "framer-motion";
import { Check, MoreVertical, Star } from "lucide-react";
import type { MouseEvent } from "react";
import { BookCover } from "./BookCover";
import { IconButton } from "@/components/ui/Button";
import { FORMAT_LABELS, cn, percent, relativeDate } from "@/lib/utils";
import type { Book } from "@/types";

interface BookCardProps {
  book: Book;
  index: number;
  onOpen: (book: Book) => void;
  onDetails: (book: Book) => void;
  onContextMenu: (book: Book, event: MouseEvent) => void;
  onToggleFavorite: (book: Book) => void;
  onToggleSelect: (book: Book) => void;
  selected: boolean;
  selecting: boolean;
  focused: boolean;
}

export function BookCard({
  book,
  index,
  onOpen,
  onDetails,
  onContextMenu,
  onToggleFavorite,
  onToggleSelect,
  selected,
  selecting,
  focused,
}: BookCardProps) {
  const started = book.progress > 0.001;
  const done = book.finishedAt !== null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // Cascade only across the first screenful; beyond that it just delays.
      transition={{ duration: 0.3, delay: Math.min(index, 14) * 0.022, ease: [0.16, 1, 0.3, 1] }}
      className="group relative"
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(book, event);
      }}
      data-book-card={book.id}
    >
      <button
        onClick={() => (selecting ? onToggleSelect(book) : onOpen(book))}
        className="block w-full text-left"
        tabIndex={-1}
      >
        <div
          className={cn(
            "relative rounded-xl transition",
            focused && "ring-2 ring-accent ring-offset-4 ring-offset-[var(--bg)]",
          )}
        >
          <BookCover
            book={book}
            rounded="rounded-xl"
            className={cn(
              "aspect-[2/3] w-full shadow-[var(--shadow)] transition duration-300",
              "group-hover:-translate-y-1 group-hover:brightness-105",
              selected && "ring-2 ring-accent",
            )}
          />
          {done ? (
            <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent shadow">
              <Check size={14} strokeWidth={3} />
            </span>
          ) : null}
          {book.favorite ? (
            <span className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full bg-black/50 text-amber-300 backdrop-blur-sm">
              <Star size={13} fill="currentColor" />
            </span>
          ) : null}
          <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 backdrop-blur-sm">
            {FORMAT_LABELS[book.format]}
          </span>
          {started && !done ? (
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-black/35">
              <div className="h-full bg-accent" style={{ width: percent(book.progress) }} aria-hidden />
            </div>
          ) : null}
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-[13.5px] leading-snug font-medium text-ink">
          {book.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-dim">{book.author ?? "Unknown author"}</p>
        <p className={cn("mt-0.5 text-[11px]", started ? "text-accent" : "text-dim")}>
          {done
            ? "Finished"
            : started
              ? `${percent(book.progress)} · ${relativeDate(book.lastOpenedAt)}`
              : relativeDate(book.lastOpenedAt)}
        </p>
      </button>

      {/* Selection checkbox appears on hover, and stays put once selecting. */}
      <button
        onClick={() => onToggleSelect(book)}
        aria-label={selected ? "Deselect" : "Select"}
        aria-pressed={selected}
        className={cn(
          "absolute top-1.5 left-1.5 grid h-6 w-6 place-items-center rounded-md border transition",
          selected
            ? "border-accent bg-accent text-on-accent"
            : "border-white/40 bg-black/45 text-transparent backdrop-blur-sm hover:text-white/70",
          selecting || selected
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <IconButton
          label={book.favorite ? "Remove from favourites" : "Add to favourites"}
          onClick={() => onToggleFavorite(book)}
          className="h-7 w-7 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-amber-300"
        >
          <Star size={14} fill={book.favorite ? "currentColor" : "none"} />
        </IconButton>
        <IconButton
          label="Book details"
          onClick={() => onDetails(book)}
          className="h-7 w-7 bg-black/45 text-white backdrop-blur-sm hover:bg-black/65 hover:text-white"
        >
          <MoreVertical size={15} />
        </IconButton>
      </div>
    </motion.div>
  );
}

interface BookRowProps {
  book: Book;
  onOpen: (book: Book) => void;
  onDetails: (book: Book) => void;
  onContextMenu: (book: Book, event: MouseEvent) => void;
  onToggleFavorite: (book: Book) => void;
}

export function BookRow({
  book,
  onOpen,
  onDetails,
  onContextMenu,
  onToggleFavorite,
}: BookRowProps) {
  return (
    <div
      className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface"
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(book, event);
      }}
    >
      <button
        onClick={() => onOpen(book)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <BookCover book={book} className="h-14 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {book.favorite ? (
              <Star size={12} className="shrink-0 text-amber-400" fill="currentColor" />
            ) : null}
            <span className="truncate text-sm font-medium text-ink">{book.title}</span>
          </span>
          <span className="block truncate text-[12px] text-dim">
            {book.author ?? "Unknown author"} · {FORMAT_LABELS[book.format]}
          </span>
        </span>
        <span className="tabular hidden w-24 shrink-0 text-right text-[12px] text-dim sm:block">
          {book.finishedAt ? "Finished" : percent(book.progress)}
        </span>
        <span className="tabular hidden w-28 shrink-0 text-right text-[12px] text-dim md:block">
          {relativeDate(book.lastOpenedAt)}
        </span>
      </button>
      <IconButton
        label={book.favorite ? "Remove from favourites" : "Add to favourites"}
        onClick={() => onToggleFavorite(book)}
        className="opacity-0 transition group-hover:opacity-100"
      >
        <Star size={15} fill={book.favorite ? "currentColor" : "none"} />
      </IconButton>
      <IconButton label="Book details" onClick={() => onDetails(book)}>
        <MoreVertical size={16} />
      </IconButton>
    </div>
  );
}

import { motion } from "framer-motion";
import { Check, MoreVertical } from "lucide-react";
import { BookCover } from "./BookCover";
import { IconButton } from "@/components/ui/Button";
import { FORMAT_LABELS, cn, percent, relativeDate } from "@/lib/utils";
import type { Book } from "@/types";

interface BookCardProps {
  book: Book;
  index: number;
  onOpen: (book: Book) => void;
  onDetails: (book: Book) => void;
}

export function BookCard({ book, index, onOpen, onDetails }: BookCardProps) {
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
    >
      <button
        onClick={() => onOpen(book)}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <div className="relative">
          <BookCover
            book={book}
            rounded="rounded-xl"
            className="aspect-[2/3] w-full shadow-[var(--shadow)] transition duration-300 group-hover:-translate-y-1 group-hover:brightness-105"
          />
          {done ? (
            <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-on-accent shadow">
              <Check size={14} strokeWidth={3} />
            </span>
          ) : null}
          <span className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/90 backdrop-blur-sm">
            {FORMAT_LABELS[book.format]}
          </span>
          {started && !done ? (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/35">
              <div
                className="h-full bg-accent"
                style={{ width: percent(book.progress) }}
                aria-hidden
              />
            </div>
          ) : null}
        </div>

        <h3 className="mt-2.5 line-clamp-2 text-[13.5px] leading-snug font-medium text-ink">
          {book.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-dim">
          {book.author ?? "Unknown author"}
        </p>
        <p className={cn("mt-0.5 text-[11px]", started ? "text-accent" : "text-dim")}>
          {done
            ? "Finished"
            : started
              ? `${percent(book.progress)} · ${relativeDate(book.lastOpenedAt)}`
              : relativeDate(book.lastOpenedAt)}
        </p>
      </button>

      <IconButton
        label="Book details"
        onClick={() => onDetails(book)}
        className="absolute top-1.5 left-1.5 bg-black/45 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/65 hover:text-white"
      >
        <MoreVertical size={16} />
      </IconButton>
    </motion.div>
  );
}

export function BookRow({ book, onOpen, onDetails }: Omit<BookCardProps, "index">) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface">
      <button onClick={() => onOpen(book)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <BookCover book={book} className="h-14 w-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{book.title}</span>
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
      <IconButton label="Book details" onClick={() => onDetails(book)}>
        <MoreVertical size={16} />
      </IconButton>
    </div>
  );
}

import { motion } from "framer-motion";
import { ChevronRight, Play } from "lucide-react";
import { BookCover } from "./BookCover";
import { Button } from "@/components/ui/Button";
import { FORMAT_LABELS, cn, minutesLeft, percent, relativeDate } from "@/lib/utils";
import { continueReading, recentlyAdded } from "@/store/library";
import type { Book } from "@/types";

interface HomeShelfProps {
  books: Book[];
  onRead: (book: Book) => void;
  onDetails: (book: Book) => void;
}

/**
 * The top of an unfiltered library. Reading apps are opened to carry on with
 * something, so the book in progress comes before the catalogue.
 */
export function HomeShelf({ books, onRead, onDetails }: HomeShelfProps) {
  const reading = continueReading(books);
  const recent = recentlyAdded(books).filter((book) => !reading.includes(book));
  if (!reading.length) return null;

  const [hero, ...rest] = reading;

  return (
    <section className="pt-6 pb-2">
      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
        Continue reading
      </h2>

      <div className="flex flex-col gap-4 lg:flex-row">
        <HeroCard book={hero} onRead={onRead} onDetails={onDetails} />

        {rest.length ? (
          <div className="flex gap-3 lg:w-72 lg:shrink-0 lg:flex-col">
            {rest.map((book) => (
              <SmallCard key={book.id} book={book} onRead={onRead} />
            ))}
          </div>
        ) : null}
      </div>

      {recent.length > 3 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
            Recently added
          </h2>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {recent.slice(0, 12).map((book) => (
              <button
                key={book.id}
                onClick={() => onRead(book)}
                className="w-24 shrink-0 text-left"
                title={book.title}
              >
                <BookCover
                  book={book}
                  rounded="rounded-lg"
                  className="aspect-[2/3] w-full shadow-[var(--shadow)] transition hover:-translate-y-1"
                />
                <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-dim">
                  {book.title}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HeroCard({
  book,
  onRead,
  onDetails,
}: {
  book: Book;
  onRead: (book: Book) => void;
  onDetails: (book: Book) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="panel relative flex min-w-0 flex-1 gap-4 overflow-hidden p-4"
    >
      {/* The cover bleeds into the background as a wash of its own colour. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, var(--accent) 0%, transparent 60%)",
        }}
      />

      <BookCover
        book={book}
        rounded="rounded-lg"
        className="h-40 w-[6.75rem] shrink-0 shadow-[var(--shadow)] sm:h-48 sm:w-32"
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <p className="text-[11px] tracking-wide text-dim">
          {FORMAT_LABELS[book.format]} · {relativeDate(book.lastOpenedAt)}
        </p>
        <h3 className="mt-1 line-clamp-2 font-serif text-xl leading-tight font-semibold text-ink">
          {book.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-dim">
          {book.author ?? "Unknown author"}
        </p>

        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3">
            <ProgressRing value={book.progress} />
            <div className="min-w-0 flex-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent" style={{ width: percent(book.progress) }} />
              </div>
              <p className="mt-1 text-[11px] text-dim">≈ {minutesLeft(book)} min left</p>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button variant="primary" size="sm" onClick={() => onRead(book)}>
              <Play size={14} />
              Continue
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDetails(book)}>
              Details
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SmallCard({ book, onRead }: { book: Book; onRead: (book: Book) => void }) {
  return (
    <button
      onClick={() => onRead(book)}
      className="panel flex min-w-0 flex-1 items-center gap-3 p-2.5 text-left transition hover:brightness-110 lg:flex-none"
    >
      <BookCover book={book} className="h-16 w-11 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] leading-snug font-medium text-ink">
          {book.title}
        </span>
        <span className="tabular mt-1 block text-[11px] text-accent">
          {percent(book.progress)}
        </span>
      </span>
    </button>
  );
}

/** Small circular gauge; clearer than a number alone at a glance. */
export function ProgressRing({
  value,
  size = 44,
  stroke = 4,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, value)) * circumference;

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span className="tabular absolute inset-0 grid place-items-center text-[10px] font-medium text-ink">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}

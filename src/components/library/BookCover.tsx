import { useEffect, useState } from "react";
import { coverUrl } from "@/lib/ipc";
import { cn, coverGradient, initials } from "@/lib/utils";
import type { Book } from "@/types";

interface BookCoverProps {
  book: Book;
  className?: string;
  rounded?: string;
}

/**
 * Shows the embedded artwork when a book has any, and a generated cover when it
 * does not — a shelf of identical grey placeholders is unusable, a shelf of
 * distinct colours is not.
 */
export function BookCover({ book, className, rounded = "rounded-lg" }: BookCoverProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailed(false);
    if (!book.cover) return;
    void coverUrl(book.cover).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [book.cover]);

  const showArtwork = src && !failed;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface2",
        rounded,
        className,
      )}
      style={showArtwork ? undefined : { background: coverGradient(book.title + book.id) }}
    >
      {showArtwork ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between p-3 pb-8 text-white/90">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase opacity-70">
            {initials(book.title)}
          </span>
          <span className="line-clamp-4 font-serif text-[13px] leading-snug font-medium">
            {book.title}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/12" />
      {/* A hint of a spine turns a flat rectangle into a book. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-gradient-to-r from-black/28 to-transparent" />
    </div>
  );
}

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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailed(false);
    setLoaded(false);
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
      className={cn("relative overflow-hidden bg-surface2", rounded, className)}
      // A container query so the generated initials scale with the tile, from a
      // list row's thumbnail up to the hero card.
      style={{
        containerType: "inline-size",
        ...(showArtwork ? {} : { background: coverGradient(book.title + book.id) }),
      }}
    >
      {showArtwork ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col justify-between p-3 pb-8 text-white">
          <span className="font-serif text-[clamp(1.4rem,26cqw,3rem)] leading-none font-semibold opacity-30">
            {initials(book.title)}
          </span>
          <span className="line-clamp-4 font-serif text-[13px] leading-snug font-medium opacity-95">
            {book.title}
          </span>
        </div>
      )}

      {/* A hint of a spine and a soft vignette turn a flat rectangle into a book. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[7px] bg-gradient-to-r from-black/35 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_0%,transparent_55%,rgba(0,0,0,0.22))]" />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-black/12 ring-inset" />
    </div>
  );
}

/** Placeholder tile with the same footprint as a cover, for loading states. */
export function CoverSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse overflow-hidden rounded-xl bg-surface2", className)} />
  );
}

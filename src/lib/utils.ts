import type { Book } from "@/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function relativeDate(ms: number | null): string {
  if (!ms) return "Never opened";
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(ms);
}

export const FORMAT_LABELS: Record<Book["format"], string> = {
  epub: "EPUB",
  pdf: "PDF",
  comic: "Comic",
  mobi: "MOBI",
};

/**
 * Deterministic cover for books that ship without artwork: the title's hash
 * picks a hue, so the same book always gets the same colour and the shelf
 * stays recognisable.
 */
export function coverGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const second = (hue + 38) % 360;
  return `linear-gradient(150deg, hsl(${hue} 42% 34%), hsl(${second} 38% 20%))`;
}

export function initials(title: string): string {
  const words = title.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Trailing-edge debounce, used for progress writes during page turns. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => timer && clearTimeout(timer);
  return wrapped;
}

/**
 * Rough time to finish. Fixed-layout formats are counted in pages, because a
 * page is what the reader actually turns; reflowable ones fall back to an
 * estimate of word count from file size at ~250 words per minute. Either way
 * this is a hint, not a promise.
 */
export function minutesLeft(book: Book): number {
  const remaining = Math.max(0, 1 - book.progress);

  if (book.format === "comic" || book.format === "pdf") {
    const pages = (book.pageCount ?? 0) * remaining;
    return Math.max(1, Math.round(pages * (book.format === "comic" ? 0.4 : 1.1)));
  }

  // Markup and compression roughly cancel out at about nine bytes per word.
  const words = Math.min(Math.max(book.fileSize / 9, 500), 500_000);
  return Math.max(1, Math.round((words * remaining) / 250));
}

/**
 * Progress across a fixed number of pages. The first page reads 0% and the
 * last reads 100%: page 1 of 2 showing "50% read" is simply wrong.
 */
export function pageProgress(index: number, total: number): number {
  if (total <= 1) return 1;
  return Math.min(1, Math.max(0, index / (total - 1)));
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

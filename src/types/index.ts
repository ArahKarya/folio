/** Mirrors the serde structs in `src-tauri/src/db/models.rs`. */

export type BookFormat = "epub" | "pdf" | "comic" | "mobi";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  format: BookFormat;
  fileName: string;
  fileSize: number;
  hash: string;
  language: string | null;
  publisher: string | null;
  description: string | null;
  series: string | null;
  seriesIndex: number | null;
  cover: string | null;
  pageCount: number | null;
  addedAt: number;
  lastOpenedAt: number | null;
  finishedAt: number | null;
  favorite: boolean;
  updatedAt: number;
  /** 0–1 */
  progress: number;
  /** EPUB CFI, or a page number for PDF and comics. */
  location: string | null;
  collections: string[];
}

export interface BookEdit {
  title: string;
  author: string | null;
  series: string | null;
  seriesIndex: number | null;
  publisher: string | null;
  language: string | null;
  description: string | null;
}

export type AnnotationKind = "highlight" | "note" | "bookmark";

export interface Annotation {
  id: string;
  bookId: string;
  kind: AnnotationKind;
  location: string;
  locationEnd: string | null;
  page: number | null;
  chapter: string | null;
  text: string | null;
  note: string | null;
  color: string | null;
  /** Format-specific payload as JSON — PDF highlights keep their rects here. */
  data: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationInput {
  id?: string | null;
  bookId: string;
  kind: AnnotationKind;
  location: string;
  locationEnd?: string | null;
  page?: number | null;
  chapter?: string | null;
  text?: string | null;
  note?: string | null;
  color?: string | null;
  data?: string | null;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bookCount: number;
}

export interface ImportFailure {
  file: string;
  reason: string;
}

export interface ImportReport {
  imported: Book[];
  duplicates: string[];
  failures: ImportFailure[];
}

export interface DailyStat {
  day: string;
  seconds: number;
}

export interface BookTime {
  bookId: string;
  seconds: number;
}

export interface LibraryStats {
  totalBooks: number;
  finishedBooks: number;
  readingBooks: number;
  favoriteBooks: number;
  secondsTotal: number;
  secondsThisWeek: number;
  secondsToday: number;
  streakDays: number;
  longestStreak: number;
  daily: DailyStat[];
  perBook: BookTime[];
}

/** Normalised 0–1 rectangles that let a PDF highlight survive zoom changes. */
export interface HighlightRects {
  rects: Array<[number, number, number, number]>;
}

export interface SyncReport {
  applied: number;
  skippedUnknownBooks: number;
  sent: number;
  path: string;
}

/** A chapter entry, flattened from whichever format produced it. */
export interface TocItem {
  label: string;
  /** CFI for EPUB, page index for PDF and comics. */
  target: string;
  depth: number;
}

export interface SearchHit {
  target: string;
  excerpt: string;
  chapter: string | null;
}

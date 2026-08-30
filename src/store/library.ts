import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import type { Book, BookEdit, Collection, ImportReport } from "@/types";

export type SortKey = "recent" | "added" | "title" | "author" | "progress" | "series";
export type ViewMode = "grid" | "list";
export type FormatFilter = "all" | Book["format"];

/**
 * Shelves are derived from reading state rather than stored anywhere, so they
 * are always correct without a background job keeping them up to date.
 */
export type ShelfId = "all" | "reading" | "unread" | "finished" | "favorites";

export const SHELVES: Array<{ id: ShelfId; label: string }> = [
  { id: "all", label: "All books" },
  { id: "reading", label: "Reading" },
  { id: "unread", label: "Unread" },
  { id: "finished", label: "Finished" },
  { id: "favorites", label: "Favourites" },
];

interface LibraryState {
  books: Book[];
  collections: Collection[];
  loading: boolean;
  importing: boolean;
  query: string;
  sort: SortKey;
  view: ViewMode;
  formatFilter: FormatFilter;
  shelf: ShelfId;
  activeCollection: string | null;
  /** Ids picked for a batch action; empty means selection mode is off. */
  selection: string[];

  load: () => Promise<void>;
  importFiles: (files: string[]) => Promise<ImportReport>;
  importFolder: (folder: string) => Promise<ImportReport>;
  remove: (id: string) => Promise<void>;
  update: (id: string, edit: BookEdit) => Promise<void>;
  toggleFinished: (book: Book) => Promise<void>;
  toggleFavorite: (book: Book) => Promise<void>;
  refreshBook: (id: string) => Promise<void>;

  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setView: (view: ViewMode) => void;
  setFormatFilter: (filter: FormatFilter) => void;
  setShelf: (shelf: ShelfId) => void;
  setActiveCollection: (id: string | null) => void;

  toggleSelected: (id: string) => void;
  selectMany: (ids: string[]) => void;
  clearSelection: () => void;
  bulkFavorite: (favorite: boolean) => Promise<void>;
  bulkFinished: (finished: boolean) => Promise<void>;
  bulkDelete: () => Promise<void>;
  bulkCollection: (collectionId: string, member: boolean) => Promise<void>;

  createCollection: (name: string) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  setMembership: (bookId: string, collectionId: string, member: boolean) => Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  books: [],
  collections: [],
  loading: true,
  importing: false,
  query: "",
  sort: "recent",
  view: "grid",
  formatFilter: "all",
  shelf: "all",
  activeCollection: null,
  selection: [],

  load: async () => {
    const [books, collections] = await Promise.all([ipc.listBooks(), ipc.listCollections()]);
    set({ books, collections, loading: false });
  },

  importFiles: async (files) => {
    set({ importing: true });
    try {
      const report = await ipc.importFiles(files);
      await get().load();
      return report;
    } finally {
      set({ importing: false });
    }
  },

  importFolder: async (folder) => {
    set({ importing: true });
    try {
      const report = await ipc.importFolder(folder);
      await get().load();
      return report;
    } finally {
      set({ importing: false });
    }
  },

  remove: async (id) => {
    await ipc.deleteBook(id);
    set({
      books: get().books.filter((book) => book.id !== id),
      selection: get().selection.filter((selected) => selected !== id),
    });
  },

  update: async (id, edit) => {
    const updated = await ipc.updateBook(id, edit);
    set({ books: get().books.map((book) => (book.id === id ? updated : book)) });
  },

  toggleFinished: async (book) => {
    const updated = await ipc.setFinished(book.id, book.finishedAt === null);
    set({ books: get().books.map((item) => (item.id === book.id ? updated : item)) });
  },

  toggleFavorite: async (book) => {
    const updated = await ipc.setFavorite(book.id, !book.favorite);
    set({ books: get().books.map((item) => (item.id === book.id ? updated : item)) });
  },

  // Called when the reader closes, so the shelf shows the position the reader
  // actually stopped at without a full library reload.
  refreshBook: async (id) => {
    const updated = await ipc.getBook(id);
    set({ books: get().books.map((book) => (book.id === id ? updated : book)) });
  },

  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),
  setView: (view) => set({ view }),
  setFormatFilter: (formatFilter) => set({ formatFilter }),
  setShelf: (shelf) => set({ shelf, selection: [] }),
  setActiveCollection: (activeCollection) => set({ activeCollection, selection: [] }),

  toggleSelected: (id) => {
    const selection = get().selection;
    set({
      selection: selection.includes(id)
        ? selection.filter((item) => item !== id)
        : [...selection, id],
    });
  },
  selectMany: (ids) => set({ selection: ids }),
  clearSelection: () => set({ selection: [] }),

  bulkFavorite: async (favorite) => {
    for (const id of get().selection) await ipc.setFavorite(id, favorite);
    set({ books: await ipc.listBooks(), selection: [] });
  },

  bulkFinished: async (finished) => {
    for (const id of get().selection) await ipc.setFinished(id, finished);
    set({ books: await ipc.listBooks(), selection: [] });
  },

  bulkDelete: async () => {
    for (const id of get().selection) await ipc.deleteBook(id);
    set({ books: await ipc.listBooks(), selection: [] });
  },

  bulkCollection: async (collectionId, member) => {
    for (const id of get().selection) {
      await ipc.setCollectionMembership(id, collectionId, member);
    }
    const [books, collections] = await Promise.all([ipc.listBooks(), ipc.listCollections()]);
    set({ books, collections, selection: [] });
  },

  createCollection: async (name) => {
    await ipc.createCollection(name);
    set({ collections: await ipc.listCollections() });
  },

  renameCollection: async (id, name) => {
    await ipc.renameCollection(id, name);
    set({ collections: await ipc.listCollections() });
  },

  deleteCollection: async (id) => {
    await ipc.deleteCollection(id);
    const wasActive = get().activeCollection === id;
    set({
      collections: await ipc.listCollections(),
      activeCollection: wasActive ? null : get().activeCollection,
    });
    await get().load();
  },

  setMembership: async (bookId, collectionId, member) => {
    await ipc.setCollectionMembership(bookId, collectionId, member);
    const [books, collections] = await Promise.all([ipc.listBooks(), ipc.listCollections()]);
    set({ books, collections });
  },
}));

/** A book counts as started once there is measurable progress. */
export const isStarted = (book: Book) => book.progress > 0.001;
export const isFinished = (book: Book) => book.finishedAt !== null;

export function onShelf(book: Book, shelf: ShelfId): boolean {
  switch (shelf) {
    case "reading":
      return isStarted(book) && !isFinished(book);
    case "unread":
      return !isStarted(book) && !isFinished(book);
    case "finished":
      return isFinished(book);
    case "favorites":
      return book.favorite;
    case "all":
    default:
      return true;
  }
}

/** Filtering and sorting live outside the store so they stay pure and testable. */
export function visibleBooks(state: LibraryState): Book[] {
  const query = state.query.trim().toLowerCase();
  const filtered = state.books.filter((book) => {
    if (!onShelf(book, state.shelf)) return false;
    if (state.formatFilter !== "all" && book.format !== state.formatFilter) return false;
    if (state.activeCollection && !book.collections.includes(state.activeCollection)) return false;
    if (!query) return true;
    return (
      book.title.toLowerCase().includes(query) ||
      (book.author ?? "").toLowerCase().includes(query) ||
      (book.series ?? "").toLowerCase().includes(query)
    );
  });

  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return [...filtered].sort((a, b) => {
    switch (state.sort) {
      case "title":
        return collator.compare(a.title, b.title);
      case "author":
        return collator.compare(a.author ?? "￿", b.author ?? "￿");
      case "added":
        return b.addedAt - a.addedAt;
      case "progress":
        return b.progress - a.progress;
      case "series":
        // Books in a series group together in reading order; loose books fall
        // to the end rather than being scattered between the series.
        return (
          collator.compare(a.series ?? "￿", b.series ?? "￿") ||
          (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) ||
          collator.compare(a.title, b.title)
        );
      case "recent":
      default:
        // Never-opened books sort last rather than first.
        return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt;
    }
  });
}

/** Section headings for the grid when sorting by series. */
export function groupBySeries(books: Book[]): Array<{ series: string | null; books: Book[] }> {
  const groups: Array<{ series: string | null; books: Book[] }> = [];
  for (const book of books) {
    const series = book.series?.trim() || null;
    const last = groups.at(-1);
    if (last && last.series === series) last.books.push(book);
    else groups.push({ series, books: [book] });
  }
  return groups;
}

/** Books to offer in "Continue reading", most recently opened first. */
export function continueReading(books: Book[], limit = 3): Book[] {
  return books
    .filter((book) => isStarted(book) && !isFinished(book))
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit);
}

export function recentlyAdded(books: Book[], limit = 12): Book[] {
  return [...books].sort((a, b) => b.addedAt - a.addedAt).slice(0, limit);
}

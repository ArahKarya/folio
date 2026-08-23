import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import type { Book, BookEdit, Collection, ImportReport } from "@/types";

export type SortKey = "recent" | "added" | "title" | "author" | "progress";
export type ViewMode = "grid" | "list";
export type FormatFilter = "all" | Book["format"];

interface LibraryState {
  books: Book[];
  collections: Collection[];
  loading: boolean;
  importing: boolean;
  query: string;
  sort: SortKey;
  view: ViewMode;
  formatFilter: FormatFilter;
  activeCollection: string | null;

  load: () => Promise<void>;
  importFiles: (files: string[]) => Promise<ImportReport>;
  importFolder: (folder: string) => Promise<ImportReport>;
  remove: (id: string) => Promise<void>;
  update: (id: string, edit: BookEdit) => Promise<void>;
  toggleFinished: (book: Book) => Promise<void>;
  refreshBook: (id: string) => Promise<void>;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setView: (view: ViewMode) => void;
  setFormatFilter: (filter: FormatFilter) => void;
  setActiveCollection: (id: string | null) => void;
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
  activeCollection: null,

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
    set({ books: get().books.filter((book) => book.id !== id) });
  },

  update: async (id, edit) => {
    const updated = await ipc.updateBook(id, edit);
    set({ books: get().books.map((book) => (book.id === id ? updated : book)) });
  },

  toggleFinished: async (book) => {
    const updated = await ipc.setFinished(book.id, book.finishedAt === null);
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
  setActiveCollection: (activeCollection) => set({ activeCollection }),

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

/** Filtering and sorting live outside the store so they stay pure and testable. */
export function visibleBooks(state: LibraryState): Book[] {
  const query = state.query.trim().toLowerCase();
  const filtered = state.books.filter((book) => {
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
      case "recent":
      default:
        // Never-opened books sort last rather than first.
        return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt;
    }
  });
}

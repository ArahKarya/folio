import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { debounce } from "@/lib/utils";
import type { Annotation, AnnotationInput, Book, SearchHit, TocItem } from "@/types";

export type ReaderPanel = "toc" | "notes" | "display" | "search" | null;

/**
 * What every format engine must provide. The shell (bars, panels, keyboard,
 * TTS) is written against this interface only, which is why one set of chrome
 * can drive EPUB, PDF, comics and MOBI.
 */
export interface ReaderControls {
  next: () => void;
  prev: () => void;
  goTo: (target: string) => void;
  /** Text of what is on screen right now — used by read-aloud. */
  visibleText: () => Promise<string>;
  search?: (query: string) => Promise<SearchHit[]>;
  /** Present only where a selection can become a highlight. */
  highlightSelection?: (color: string) => Promise<Annotation | null>;
}

interface ReaderState {
  book: Book | null;
  toc: TocItem[];
  chapter: string | null;
  progress: number;
  location: string | null;
  annotations: Annotation[];
  panel: ReaderPanel;
  focus: boolean;
  chromeVisible: boolean;
  loading: boolean;
  error: string | null;
  controls: ReaderControls | null;

  open: (book: Book) => Promise<void>;
  close: () => void;
  setToc: (toc: TocItem[]) => void;
  setChapter: (chapter: string | null) => void;
  reportPosition: (progress: number, location: string | null) => void;
  setControls: (controls: ReaderControls | null) => void;
  setPanel: (panel: ReaderPanel) => void;
  setFocus: (focus: boolean) => void;
  setChromeVisible: (visible: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reloadAnnotations: () => Promise<void>;
  saveAnnotation: (input: AnnotationInput) => Promise<Annotation>;
  deleteAnnotation: (id: string) => Promise<void>;
}

/** Position writes are cheap but frequent; one write per second is plenty. */
const persistPosition = debounce((id: string, progress: number, location: string | null) => {
  void ipc.setProgress(id, progress, location);
}, 900);

export const useReader = create<ReaderState>((set, get) => ({
  book: null,
  toc: [],
  chapter: null,
  progress: 0,
  location: null,
  annotations: [],
  panel: null,
  focus: false,
  chromeVisible: true,
  loading: true,
  error: null,
  controls: null,

  open: async (book) => {
    set({
      book,
      toc: [],
      chapter: null,
      progress: book.progress,
      location: book.location,
      annotations: [],
      panel: null,
      loading: true,
      error: null,
      chromeVisible: true,
      controls: null,
    });
    const [opened, annotations] = await Promise.all([
      ipc.openBook(book.id),
      ipc.listAnnotations(book.id),
    ]);
    set({ book: opened, annotations, location: opened.location, progress: opened.progress });
  },

  close: () => {
    persistPosition.cancel();
    const { book, progress, location } = get();
    // Flush immediately: the shelf is about to read this row back.
    if (book) void ipc.setProgress(book.id, progress, location);
    set({ book: null, controls: null, annotations: [], toc: [], panel: null, focus: false });
  },

  setToc: (toc) => set({ toc }),
  setChapter: (chapter) => set({ chapter }),

  reportPosition: (progress, location) => {
    const book = get().book;
    if (!book) return;
    set({ progress, location });
    persistPosition(book.id, progress, location);
  },

  setControls: (controls) => set({ controls }),
  setPanel: (panel) => set({ panel: get().panel === panel ? null : panel }),
  setFocus: (focus) => set({ focus, chromeVisible: !focus }),
  setChromeVisible: (chromeVisible) => set({ chromeVisible }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  reloadAnnotations: async () => {
    const book = get().book;
    if (!book) return;
    set({ annotations: await ipc.listAnnotations(book.id) });
  },

  saveAnnotation: async (input) => {
    const saved = await ipc.saveAnnotation(input);
    const existing = get().annotations.filter((item) => item.id !== saved.id);
    set({ annotations: [...existing, saved].sort((a, b) => a.createdAt - b.createdAt) });
    return saved;
  },

  deleteAnnotation: async (id) => {
    await ipc.deleteAnnotation(id);
    set({ annotations: get().annotations.filter((item) => item.id !== id) });
  },
}));

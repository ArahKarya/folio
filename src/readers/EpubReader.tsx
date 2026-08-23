import ePubImport from "epubjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { SelectionMenu, type PendingSelection } from "@/components/reader/SelectionMenu";
import { toast } from "@/components/ui/Toast";
import {
  flattenToc,
  sameDocument,
  type EpubBook,
  type EpubContents,
  type EpubFactory,
  type EpubLocation,
  type EpubRendition,
} from "@/lib/epub";
import { bookAssetUrl, errorText, ipc } from "@/lib/ipc";
import { bookCss } from "@/lib/theme";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Annotation, Book, SearchHit } from "@/types";

const ePub = ePubImport as unknown as EpubFactory;

/** Roughly one location per screenful of text — the epub.js default is finer
 * than the progress bar can show and costs seconds on a long book. */
const LOCATION_CHARS = 1650;

const STYLE_KEY = "folio-theme";

interface EpubReaderProps {
  book: Book;
}

export function EpubReader({ book }: EpubReaderProps) {
  const holder = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const [selection, setSelection] = useState<PendingSelection | null>(null);

  const { theme, typography } = useSettings();
  const annotations = useReader((state) => state.annotations);
  const {
    setToc,
    setChapter,
    setControls,
    setLoading,
    setError,
    reportPosition,
    saveAnnotation,
  } = useReader();

  // --- mount the book -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const element = holder.current;
    if (!element) return;

    const mount = async () => {
      try {
        const url = await bookAssetUrl(book.id);
        if (cancelled) return;
        const epub = ePub(url, { openAs: "epub" });
        bookRef.current = epub;

        const rendition = epub.renderTo(element, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "auto",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;

        // Registered before the first display so page one is already themed.
        rendition.hooks.content.register((contents: EpubContents) => {
          contents.addStylesheetCss(bookCss(theme, typography), STYLE_KEY);
        });

        await epub.ready;
        if (cancelled) return;

        const navigation = await epub.loaded.navigation;
        const toc = flattenToc(navigation.toc);
        if (!cancelled) setToc(toc);

        await rendition.display(book.location ?? undefined);
        if (!cancelled) setLoading(false);

        // Generating locations is the expensive part of opening an EPUB, so it
        // happens after the first page is on screen and the result is cached.
        void prepareLocations(epub, book.id).then(() => {
          if (cancelled) return;
          const current = rendition.location;
          if (current) updatePosition(current, toc);
        });

        rendition.on("relocated", ((location: EpubLocation) => {
          if (!cancelled) updatePosition(location, toc);
        }) as never);

        rendition.on("selected", ((cfiRange: string, contents: EpubContents) => {
          const range = contents.window.getSelection()?.toString().trim() ?? "";
          if (!range) return;
          const rect = rendition.getRange(cfiRange)?.getBoundingClientRect();
          const frame = element.getBoundingClientRect();
          setSelection({
            cfi: cfiRange,
            text: range,
            x: frame.left + (rect ? rect.left + rect.width / 2 : frame.width / 2),
            y: frame.top + (rect ? rect.top : frame.height / 2),
          });
        }) as never);

        rendition.on("markClicked", ((cfiRange: string) => {
          const hit = annotations.find((item) => item.location === cfiRange);
          if (hit) useReader.getState().setPanel("notes");
        }) as never);
      } catch (error) {
        if (!cancelled) setError(errorText(error));
      }
    };

    const updatePosition = (location: EpubLocation, toc: ReturnType<typeof flattenToc>) => {
      const epub = bookRef.current;
      if (!epub) return;
      let progress = 0;
      try {
        progress = epub.locations.length()
          ? epub.locations.percentageFromCfi(location.start.cfi)
          : 0;
      } catch {
        progress = 0;
      }
      reportPosition(progress, location.start.cfi);
      const chapter = toc
        .filter((item) => sameDocument(item.target, location.start.href))
        .at(-1);
      setChapter(chapter?.label ?? null);
    };

    void mount();
    return () => {
      cancelled = true;
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current = null;
    };
    // Remounting on a settings change would throw away the reading position;
    // themes and typography are pushed into the live rendition instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // --- live theme and typography -------------------------------------------
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const css = bookCss(theme, typography);
    for (const contents of rendition.getContents()) {
      contents.addStylesheetCss(css, STYLE_KEY);
    }
    rendition.spread(typography.columns === "single" ? "none" : "auto");
    rendition.resize();
  }, [theme, typography]);

  // --- highlights -----------------------------------------------------------
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const marks = annotations.filter((item) => item.kind !== "bookmark" && item.location);
    for (const mark of marks) {
      try {
        rendition.annotations.add(
          "highlight",
          mark.location,
          { id: mark.id },
          undefined,
          `folio-hl-${mark.id}`,
          {
            fill: mark.color ?? "#f5b642",
            "fill-opacity": "0.32",
            "mix-blend-mode": "multiply",
          },
        );
      } catch {
        // A CFI can fail to resolve while its chapter is not rendered; the
        // highlight reappears when the reader returns to that page.
      }
    }
    return () => {
      for (const mark of marks) {
        try {
          rendition.annotations.remove(mark.location, "highlight");
        } catch {
          /* already gone with its chapter */
        }
      }
    };
  }, [annotations]);

  // --- controls for the shell ----------------------------------------------
  const search = useCallback(async (query: string): Promise<SearchHit[]> => {
    const epub = bookRef.current;
    if (!epub || query.trim().length < 2) return [];
    const items: Array<{ href: string; find: (q: string) => Array<{ cfi: string; excerpt: string }>; load: (l: unknown) => Promise<Document>; unload: () => void }> = [];
    epub.spine.each((item) => items.push(item));

    const hits: SearchHit[] = [];
    for (const item of items) {
      try {
        await item.load(epub.load.bind(epub));
        for (const found of item.find(query)) {
          hits.push({ target: found.cfi, excerpt: found.excerpt.trim(), chapter: null });
          if (hits.length >= 120) break;
        }
      } catch {
        /* skip chapters that fail to load */
      } finally {
        item.unload();
      }
      if (hits.length >= 120) break;
    }
    return hits;
  }, []);

  useEffect(() => {
    setControls({
      next: () => void renditionRef.current?.next(),
      prev: () => void renditionRef.current?.prev(),
      goTo: (target) => void renditionRef.current?.display(target),
      visibleText: async () =>
        renditionRef.current?.getContents()[0]?.content.innerText.trim() ?? "",
      search,
      highlightSelection: async () => null,
    });
    return () => setControls(null);
  }, [setControls, search]);

  const createHighlight = async (color: string, note: string | null) => {
    if (!selection) return;
    try {
      const saved: Annotation = await saveAnnotation({
        bookId: book.id,
        kind: note ? "note" : "highlight",
        location: selection.cfi,
        text: selection.text,
        note,
        color,
        chapter: useReader.getState().chapter,
      });
      setSelection(null);
      toast.success(saved.note ? "Note saved." : "Highlighted.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <div
        ref={holder}
        data-selectable
        className="reader-surface h-full w-full"
        style={{
          paddingInline: `${typography.margin}%`,
          paddingBlock: "3vh",
        }}
      />
      <SelectionMenu
        selection={selection}
        onDismiss={() => setSelection(null)}
        onHighlight={createHighlight}
      />
    </>
  );
}

/**
 * Location tables are deterministic for a given book, so they are generated
 * once and cached in the settings table. Reopening a long EPUB then shows an
 * accurate progress bar immediately.
 */
async function prepareLocations(epub: EpubBook, bookId: string) {
  const key = `local.locations.${bookId}`;
  try {
    const stored = await ipc.getSettings();
    const cached = stored[key];
    if (cached) {
      epub.locations.load(cached);
      if (epub.locations.length()) return;
    }
    await epub.locations.generate(LOCATION_CHARS);
    await ipc.setSetting(key, epub.locations.save());
  } catch {
    // Progress falls back to 0 rather than blocking the reader.
  }
}

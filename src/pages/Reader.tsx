import { AnimatePresence } from "framer-motion";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { ReaderBottomBar } from "@/components/reader/ReaderBottomBar";
import { ReaderPanel } from "@/components/reader/ReaderPanel";
import { ReaderTopBar } from "@/components/reader/ReaderTopBar";
import { TtsBar } from "@/components/reader/TtsBar";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadingScreen } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { useReadAloud } from "@/lib/tts";
import { useAutoScroll } from "@/lib/transitions";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Book } from "@/types";

// Each engine pulls in a heavy renderer (epub.js, pdf.js). Loading them on
// demand keeps the library screen fast to start, which matters most on Android.
const EpubReader = lazy(() =>
  import("@/readers/EpubReader").then((module) => ({ default: module.EpubReader })),
);
const PdfReader = lazy(() =>
  import("@/readers/PdfReader").then((module) => ({ default: module.PdfReader })),
);
const ComicReader = lazy(() =>
  import("@/readers/ComicReader").then((module) => ({ default: module.ComicReader })),
);
const DocReader = lazy(() =>
  import("@/readers/DocReader").then((module) => ({ default: module.DocReader })),
);

/** How often reading time is banked, in seconds. */
const TICK = 30;

/**
 * Nudges the reading size. Reads the store directly so the keyboard handler
 * never works from a font size captured on an earlier render.
 */
function resizeText(delta: number) {
  const { typography, setTypography } = useSettings.getState();
  setTypography({ fontSize: Math.min(34, Math.max(13, typography.fontSize + delta)) });
}

interface ReaderProps {
  book: Book;
  onClose: () => void;
}

export function Reader({ book, onClose }: ReaderProps) {
  const {
    open,
    close,
    loading,
    error,
    controls,
    annotations,
    location,
    pendingTarget,
    setPendingTarget,
    focus,
    chromeVisible,
    setFocus,
    setChromeVisible,
    setPanel,
    saveAnnotation,
    deleteAnnotation,
  } = useReader();
  const behavior = useSettings((state) => state.behavior);

  // Auto-scroll is offered only by the formats that actually scroll.
  const [autoScrolling, setAutoScrolling] = useState(false);
  const scroller = useCallback(() => controls?.scroller?.() ?? null, [controls]);
  useAutoScroll(scroller, behavior.autoScrollSpeed, autoScrolling, () =>
    setAutoScrolling(false),
  );
  useEffect(() => {
    if (!controls?.scroller) setAutoScrolling(false);
  }, [controls]);

  const tts = useReadAloud({
    getText: async () => (await controls?.visibleText()) ?? "",
    next: () => controls?.next(),
    rate: behavior.ttsRate,
  });

  useEffect(() => {
    void open(book);
    return () => close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // A note or a palette result asked for a specific place; the engine only
  // exists a moment later, so the jump waits for it here.
  useEffect(() => {
    if (!controls || !pendingTarget || loading) return;
    controls.goTo(pendingTarget);
    setPendingTarget(null);
  }, [controls, pendingTarget, loading, setPendingTarget]);

  // --- reading time ---------------------------------------------------------
  const banked = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      banked.current += TICK;
      void ipc.recordReading(book.id, TICK);
    }, TICK * 1000);
    return () => clearInterval(timer);
  }, [book.id]);

  // --- bookmarks ------------------------------------------------------------
  const bookmark = annotations.find(
    (item) => item.kind === "bookmark" && item.location === (location ?? ""),
  );

  const toggleBookmark = useCallback(async () => {
    const current = useReader.getState();
    const here = current.location;
    const existing = current.annotations.find(
      (item) => item.kind === "bookmark" && item.location === (here ?? ""),
    );
    try {
      if (existing) {
        await deleteAnnotation(existing.id);
        toast.info("Bookmark removed.");
        return;
      }
      if (!here) return;
      await saveAnnotation({
        bookId: book.id,
        kind: "bookmark",
        location: here,
        chapter: current.chapter,
        page: Number.isFinite(Number(here)) ? Number(here) + 1 : null,
      });
      toast.success("Bookmarked.");
    } catch (err) {
      toast.error(errorText(err));
    }
  }, [book.id, deleteAnnotation, saveAnnotation]);

  // --- keyboard -------------------------------------------------------------
  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          event.preventDefault();
          controls?.next();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          controls?.prev();
          break;
        case "Escape":
          if (useReader.getState().panel) setPanel(null);
          else if (useReader.getState().focus) setFocus(false);
          else onClose();
          break;
        case "f":
          setFocus(!useReader.getState().focus);
          break;
        case "t":
          setPanel("toc");
          break;
        case "n":
          setPanel("notes");
          break;
        case "b":
          void toggleBookmark();
          break;
        case "+":
        case "=":
          resizeText(1);
          break;
        case "-":
          resizeText(-1);
          break;
        case "/":
          event.preventDefault();
          setPanel("search");
          break;
        default:
          break;
      }
    },
    [controls, onClose, setFocus, setPanel, toggleBookmark],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // A tap in the middle reveals the chrome; the outer thirds turn pages.
  const onSurfaceClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!behavior.tapZones) {
      setChromeVisible(!chromeVisible);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    if (x < 0.3) controls?.prev();
    else if (x > 0.7) controls?.next();
    else setChromeVisible(!chromeVisible);
  };

  const showChrome = chromeVisible && !focus;

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <div className="absolute inset-0" onClick={onSurfaceClick}>
        {error ? (
          <EmptyState
            title="This book could not be opened"
            hint={error}
            action={
              <Button variant="primary" onClick={onClose}>
                Back to library
              </Button>
            }
          />
        ) : (
          <Suspense fallback={<LoadingScreen message={`Opening ${book.title}…`} />}>
            {book.format === "epub" ? <EpubReader book={book} /> : null}
            {book.format === "pdf" ? <PdfReader book={book} /> : null}
            {book.format === "comic" ? <ComicReader book={book} /> : null}
            {book.format === "mobi" ? <DocReader book={book} /> : null}
          </Suspense>
        )}
      </div>

      {loading && !error ? (
        <div className="pointer-events-none absolute inset-0 bg-bg">
          <LoadingScreen message={`Opening ${book.title}…`} />
        </div>
      ) : null}

      <AnimatePresence>
        {showChrome ? (
          <ReaderTopBar
            key="top"
            onClose={onClose}
            onToggleTts={tts.toggle}
            ttsActive={tts.speaking}
            bookmarked={Boolean(bookmark)}
            onBookmark={toggleBookmark}
            autoScroll={
              controls?.scroller
                ? { running: autoScrolling, toggle: () => setAutoScrolling((value) => !value) }
                : undefined
            }
          />
        ) : null}
        {showChrome ? <ReaderBottomBar key="bottom" /> : null}
      </AnimatePresence>

      {focus ? (
        <button
          onClick={() => setFocus(false)}
          className="absolute top-3 right-3 z-30 rounded-lg bg-surface/70 px-2.5 py-1 text-[11px] text-dim backdrop-blur transition hover:text-ink"
        >
          Exit focus · Esc
        </button>
      ) : null}

      <TtsBar tts={tts} />
      <ReaderPanel />
    </div>
  );
}

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingScreen } from "@/components/ui/Spinner";
import { bookAssetUrl, errorText, ipc } from "@/lib/ipc";
import { pageProgress } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Book, SearchHit } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type PdfDocument = pdfjs.PDFDocumentProxy;

interface PageBox {
  index: number;
  /** Intrinsic size at scale 1, used to reserve space before rendering. */
  width: number;
  height: number;
}

interface PdfReaderProps {
  book: Book;
}

export function PdfReader({ book }: PdfReaderProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const docRef = useRef<PdfDocument | null>(null);
  // The loading task owns the worker; destroying it is what releases memory.
  const taskRef = useRef<pdfjs.PDFDocumentLoadingTask | null>(null);
  const [pages, setPages] = useState<PageBox[]>([]);
  const [zoom, setZoom] = useState(1);
  const { typography } = useSettings();
  const { setToc, setControls, setLoading, setError, reportPosition, setChapter } = useReader();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const url = await bookAssetUrl(book.id);
        if (cancelled) return;
        const task = pdfjs.getDocument({ url });
        taskRef.current = task;
        const doc = await task.promise;
        if (cancelled) {
          void task.destroy();
          return;
        }
        docRef.current = doc;

        const boxes: PageBox[] = [];
        for (let index = 1; index <= doc.numPages; index++) {
          const page = await doc.getPage(index);
          const viewport = page.getViewport({ scale: 1 });
          boxes.push({ index, width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setPages(boxes);
        setLoading(false);

        if (book.pageCount !== doc.numPages) void ipc.setPageCount(book.id, doc.numPages);
        if (!book.cover) void captureCover(doc, book.id);
        void loadOutline(doc, setToc);

        // Restore the saved page once the placeholders exist to scroll to.
        const savedPage = Number(book.location ?? "1");
        if (savedPage > 1) {
          requestAnimationFrame(() => scrollToPage(scroller.current, savedPage));
        }
      } catch (error) {
        if (!cancelled) setError(errorText(error));
      }
    };

    void load();
    return () => {
      cancelled = true;
      void taskRef.current?.destroy();
      taskRef.current = null;
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Track the page under the top third of the viewport — that is the page a
  // reader would say they are "on".
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pages.length) return;
    const onScroll = () => {
      const marker = element.scrollTop + element.clientHeight * 0.33;
      const nodes = element.querySelectorAll<HTMLElement>("[data-page]");
      let current = 1;
      for (const node of nodes) {
        if (node.offsetTop <= marker) current = Number(node.dataset.page);
        else break;
      }
      setChapter(`Page ${current} of ${pages.length}`);
      reportPosition(pageProgress(current - 1, pages.length), String(current));
    };
    onScroll();
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [pages, reportPosition, setChapter]);

  const search = useCallback(async (query: string): Promise<SearchHit[]> => {
    const doc = docRef.current;
    if (!doc || query.trim().length < 2) return [];
    const needle = query.toLowerCase();
    const hits: SearchHit[] = [];
    for (let index = 1; index <= doc.numPages && hits.length < 80; index++) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ");
      let at = text.toLowerCase().indexOf(needle);
      while (at !== -1 && hits.length < 80) {
        hits.push({
          target: String(index),
          excerpt: text.slice(Math.max(0, at - 45), at + needle.length + 55).trim(),
          chapter: `Page ${index}`,
        });
        at = text.toLowerCase().indexOf(needle, at + needle.length);
      }
    }
    return hits;
  }, []);

  useEffect(() => {
    setControls({
      next: () => stepPage(scroller.current, 1),
      prev: () => stepPage(scroller.current, -1),
      goTo: (target) => scrollToPage(scroller.current, Number(target)),
      visibleText: async () => {
        const doc = docRef.current;
        const element = scroller.current;
        if (!doc || !element) return "";
        const marker = element.scrollTop + element.clientHeight * 0.33;
        const nodes = element.querySelectorAll<HTMLElement>("[data-page]");
        let current = 1;
        for (const node of nodes) {
          if (node.offsetTop <= marker) current = Number(node.dataset.page);
          else break;
        }
        const page = await doc.getPage(current);
        const content = await page.getTextContent();
        return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      },
      search,
    });
    return () => setControls(null);
  }, [setControls, search]);

  if (!pages.length) return <LoadingScreen message="Opening the document…" />;

  return (
    <div ref={scroller} className="reader-surface h-full w-full overflow-y-auto overscroll-contain">
      <div
        className="mx-auto flex flex-col items-center gap-4 py-6"
        style={{ paddingInline: `${typography.margin}%` }}
      >
        {pages.map((page) => (
          <PdfPage key={page.index} page={page} zoom={zoom} doc={docRef} />
        ))}
      </div>
      <ZoomBar zoom={zoom} onZoom={setZoom} />
    </div>
  );
}

function ZoomBar({ zoom, onZoom }: { zoom: number; onZoom: (value: number) => void }) {
  return (
    <div className="panel fixed right-4 bottom-24 z-30 flex items-center gap-1 px-1.5 py-1 text-[13px]">
      <button
        className="h-7 w-7 rounded-md hover:bg-surface2"
        onClick={() => onZoom(Math.max(0.5, zoom - 0.15))}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        className="tabular w-12 rounded-md py-1 text-center hover:bg-surface2"
        onClick={() => onZoom(1)}
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="h-7 w-7 rounded-md hover:bg-surface2"
        onClick={() => onZoom(Math.min(3, zoom + 0.15))}
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}

interface PdfPageProps {
  page: PageBox;
  zoom: number;
  doc: React.RefObject<PdfDocument | null>;
}

/**
 * Renders only while on or near the screen. A 900-page PDF holds 900 empty
 * boxes and at most a handful of canvases.
 */
function PdfPage({ page, zoom, doc }: PdfPageProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: element.closest(".overflow-y-auto"), rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: pdfjs.RenderTask | null = null;

    const render = async () => {
      const document = doc.current;
      const target = canvas.current;
      if (!document || !target) return;
      const pdfPage = await document.getPage(page.index);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: zoom * ratio });
      target.width = viewport.width;
      target.height = viewport.height;
      const context = target.getContext("2d");
      if (!context) return;
      task = pdfPage.render({ canvas: target, canvasContext: context, viewport });
      try {
        await task.promise;
      } catch {
        /* superseded by a newer render */
      }
    };

    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, zoom, page.index, doc]);

  const width = page.width * zoom;
  const height = page.height * zoom;

  return (
    <div
      ref={host}
      data-page={page.index}
      style={{ width, height }}
      className="relative w-full max-w-full shadow-[var(--shadow)]"
    >
      {visible ? (
        <canvas ref={canvas} style={{ width, height }} className="block bg-white" />
      ) : (
        <div className="h-full w-full bg-white/80" />
      )}
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-dim">
        {page.index}
      </span>
    </div>
  );
}

function scrollToPage(element: HTMLElement | null, pageNumber: number) {
  const target = element?.querySelector<HTMLElement>(`[data-page="${pageNumber}"]`);
  if (target && element) element.scrollTo({ top: target.offsetTop - 16, behavior: "auto" });
}

function stepPage(element: HTMLElement | null, direction: 1 | -1) {
  if (!element) return;
  element.scrollBy({ top: direction * element.clientHeight * 0.92, behavior: "smooth" });
}

async function loadOutline(
  doc: PdfDocument,
  setToc: (toc: Array<{ label: string; target: string; depth: number }>) => void,
) {
  try {
    const outline = await doc.getOutline();
    if (!outline?.length) return;
    const flat: Array<{ label: string; target: string; depth: number }> = [];

    const walk = async (items: typeof outline, depth: number) => {
      for (const item of items) {
        let pageNumber = 1;
        try {
          const dest =
            typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
          if (dest) pageNumber = (await doc.getPageIndex(dest[0] as never)) + 1;
        } catch {
          /* broken destinations are common in the wild */
        }
        flat.push({ label: item.title.trim(), target: String(pageNumber), depth });
        if (item.items?.length) await walk(item.items, depth + 1);
      }
    };

    await walk(outline, 0);
    setToc(flat);
  } catch {
    /* no outline is fine */
  }
}

/** PDFs carry no cover image, so page one becomes one. */
async function captureCover(doc: PdfDocument, bookId: string) {
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(700 / viewport.width, 2);
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    await page.render({ canvas, canvasContext: context, viewport: scaled }).promise;
    await ipc.setBookCover(bookId, canvas.toDataURL("image/png"));
  } catch {
    /* a missing cover is cosmetic */
  }
}

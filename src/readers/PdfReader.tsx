import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useRef, useState } from "react";
import { PdfPage, type PageBox } from "./pdf/PdfPage";
import { encodeRects, rectsFromSelection } from "./pdf/highlights";
import { SelectionMenu, type PendingSelection } from "@/components/reader/SelectionMenu";
import { LoadingScreen } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { bookAssetUrl, errorText, ipc } from "@/lib/ipc";
import { pageProgress } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Book, SearchHit } from "@/types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Runtime assets pdf.js loads on demand, copied into `public/pdfjs` by
 * `scripts/copy-pdfjs-assets.mjs`.
 *
 * These are not optional extras. pdf.js v6 decodes JBIG2 and JPEG2000 in
 * WebAssembly, and without `wasmUrl` it drops those images *silently* — which
 * is exactly how a scanned document renders with every word missing, because
 * office scanners put the text layer in JBIG2. The font and cmap directories
 * cover the same class of failure for non-embedded standard fonts and CJK.
 */
const PDF_ASSETS = {
  wasmUrl: "/pdfjs/wasm/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  iccUrl: "/pdfjs/iccs/",
} as const;

type PdfDocument = pdfjs.PDFDocumentProxy;

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
  const [selection, setSelection] = useState<(PendingSelection & { page: number }) | null>(null);
  const { typography } = useSettings();
  const annotations = useReader((state) => state.annotations);
  const {
    setToc,
    setControls,
    setLoading,
    setError,
    reportPosition,
    setChapter,
    saveAnnotation,
    setPanel,
  } = useReader();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const url = await bookAssetUrl(book.id);
        if (cancelled) return;
        const task = pdfjs.getDocument({ url, ...PDF_ASSETS });
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
      const current = pageAtMarker(element);
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
        const page = await doc.getPage(pageAtMarker(element));
        const content = await page.getTextContent();
        return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      },
      search,
      scroller: () => scroller.current,
    });
    return () => setControls(null);
  }, [setControls, search]);

  /**
   * A selection only becomes a highlight once we know which page it belongs
   * to, because the geometry is measured against that page's element.
   */
  const onMouseUp = () => {
    const active = window.getSelection();
    const text = active?.toString().trim();
    if (!text || !active?.rangeCount) {
      setSelection(null);
      return;
    }
    const node = active.getRangeAt(0).startContainer;
    const element = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
    const pageElement = element?.closest<HTMLElement>("[data-page]");
    if (!pageElement) {
      setSelection(null);
      return;
    }
    const rect = active.getRangeAt(0).getBoundingClientRect();
    setSelection({
      cfi: pageElement.dataset.page ?? "1",
      page: Number(pageElement.dataset.page ?? 1),
      text,
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
  };

  const createHighlight = async (color: string, note: string | null) => {
    const active = window.getSelection();
    if (!selection || !active) return;
    const pageElement = scroller.current?.querySelector<HTMLElement>(
      `[data-page="${selection.page}"]`,
    );
    if (!pageElement) return;

    const rects = rectsFromSelection(active, pageElement);
    if (!rects.length) {
      toast.error("That selection could not be measured — try selecting it again.");
      return;
    }

    try {
      await saveAnnotation({
        bookId: book.id,
        kind: note ? "note" : "highlight",
        location: String(selection.page),
        page: selection.page,
        chapter: `Page ${selection.page}`,
        text: selection.text,
        note,
        color,
        data: encodeRects(rects),
      });
      setSelection(null);
      active.removeAllRanges();
      toast.success(note ? "Note saved." : "Highlighted.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  if (!pages.length) return <LoadingScreen message="Opening the document…" />;

  return (
    <>
      <div
        ref={scroller}
        data-pdf-scroller
        onMouseUp={onMouseUp}
        className="reader-surface h-full w-full overflow-y-auto overscroll-contain"
      >
        <div
          className="mx-auto flex flex-col items-center gap-4 py-6"
          style={{ paddingInline: `${typography.margin}%` }}
        >
          {pages.map((page) => (
            <PdfPage
              key={page.index}
              page={page}
              zoom={zoom}
              doc={docRef}
              annotations={annotations}
              onHighlightClick={() => setPanel("notes")}
            />
          ))}
        </div>
        <ZoomBar zoom={zoom} onZoom={setZoom} />
      </div>

      <SelectionMenu
        selection={selection}
        onDismiss={() => setSelection(null)}
        onHighlight={createHighlight}
      />
    </>
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

/** The page sitting under the top third of the viewport. */
function pageAtMarker(element: HTMLElement): number {
  const marker = element.scrollTop + element.clientHeight * 0.33;
  const nodes = element.querySelectorAll<HTMLElement>("[data-page]");
  let current = 1;
  for (const node of nodes) {
    if (node.offsetTop <= marker) current = Number(node.dataset.page);
    else break;
  }
  return current;
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

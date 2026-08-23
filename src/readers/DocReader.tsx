import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SelectionMenu, type PendingSelection } from "@/components/reader/SelectionMenu";
import { LoadingScreen } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { bookCss } from "@/lib/theme";
import { pageProgress } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Book, SearchHit } from "@/types";

const COLUMN_GAP = 56;

interface DocReaderProps {
  book: Book;
}

/**
 * Reader for formats that arrive as one HTML document (currently MOBI). It
 * paginates with CSS columns, which gives the same page-turn feel as the EPUB
 * reader without a second layout engine.
 */
export function DocReader({ book }: DocReaderProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const { theme, typography } = useSettings();
  const { setControls, setLoading, setError, reportPosition, setChapter, saveAnnotation } =
    useReader();

  useEffect(() => {
    let cancelled = false;
    void ipc
      .documentHtml(book.id)
      .then((raw) => {
        if (cancelled) return;
        setHtml(sanitize(raw));
        setLoading(false);
      })
      .catch((error) => {
        if (!cancelled) setError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Column width follows the viewport, so a window resize re-paginates.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, [html]);

  const columnWidth =
    typography.columns === "double" && size.width > 900
      ? (size.width - COLUMN_GAP) / 2
      : size.width;

  // Re-measure whenever anything that affects layout changes, then clamp the
  // current page so a smaller window cannot strand the reader past the end.
  useLayoutEffect(() => {
    const element = content.current;
    if (!element || !size.width) return;
    const total = Math.max(1, Math.round(element.scrollWidth / (columnWidth + COLUMN_GAP)));
    setPageCount(total);
    setPage((current) => Math.min(current, total - 1));
  }, [html, size, columnWidth, typography, theme]);

  // Restore the saved page once, after the first successful measurement.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || pageCount <= 1 || !book.location) return;
    restored.current = true;
    setPage(Math.min(Math.max(Number(book.location) || 0, 0), pageCount - 1));
  }, [pageCount, book.location]);

  useEffect(() => {
    if (pageCount <= 0) return;
    reportPosition(pageProgress(page, pageCount), String(page));
    setChapter(`Page ${page + 1} of ${pageCount}`);
  }, [page, pageCount, reportPosition, setChapter]);

  const search = useCallback(
    async (query: string): Promise<SearchHit[]> => {
      const element = content.current;
      if (!element || query.trim().length < 2) return [];
      const needle = query.toLowerCase();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const hits: SearchHit[] = [];
      const stride = columnWidth + COLUMN_GAP;

      while (hits.length < 80) {
        const node = walker.nextNode();
        if (!node) break;
        const text = node.textContent ?? "";
        let at = text.toLowerCase().indexOf(needle);
        while (at !== -1 && hits.length < 80) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + query.length);
          // Columns lay out horizontally, so x offset is the page number.
          const left = range.getBoundingClientRect().left - element.getBoundingClientRect().left;
          hits.push({
            target: String(Math.max(0, Math.floor(left / stride))),
            excerpt: text.slice(Math.max(0, at - 45), at + needle.length + 55).trim(),
            chapter: null,
          });
          at = text.toLowerCase().indexOf(needle, at + needle.length);
        }
      }
      return hits;
    },
    [columnWidth],
  );

  useEffect(() => {
    setControls({
      next: () => setPage((current) => Math.min(current + 1, pageCount - 1)),
      prev: () => setPage((current) => Math.max(current - 1, 0)),
      goTo: (target) => setPage(Math.min(Math.max(Number(target) || 0, 0), pageCount - 1)),
      visibleText: async () => visibleColumnText(content.current, page, columnWidth + COLUMN_GAP),
      search,
    });
    return () => setControls(null);
  }, [setControls, pageCount, page, columnWidth, search]);

  const onSelect = () => {
    const active = window.getSelection();
    const text = active?.toString().trim();
    if (!text || !active?.rangeCount) {
      setSelection(null);
      return;
    }
    const rect = active.getRangeAt(0).getBoundingClientRect();
    setSelection({ cfi: String(page), text, x: rect.left + rect.width / 2, y: rect.top });
  };

  const createNote = async (color: string, note: string | null) => {
    if (!selection) return;
    try {
      await saveAnnotation({
        bookId: book.id,
        kind: note ? "note" : "highlight",
        location: String(page),
        page: page + 1,
        text: selection.text,
        note,
        color,
      });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      toast.success(note ? "Note saved." : "Saved to your notes.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  if (html === null) return <LoadingScreen message="Preparing the book…" />;

  return (
    <>
      <div
        ref={viewport}
        className="reader-surface h-full w-full overflow-hidden"
        style={{ paddingInline: `${typography.margin}%`, paddingBlock: "3vh" }}
      >
        {/* The book stylesheet is written for a document body, so it is
            re-scoped to this container rather than duplicated. */}
        <style>{bookCss(theme, typography).replace(/(^|\s|,)(body|:root)\b/g, "$1.doc-page")}</style>
        <div
          ref={content}
          data-selectable
          onMouseUp={onSelect}
          onTouchEnd={onSelect}
          className="doc-page"
          style={{
            height: size.height ? size.height - 2 : "100%",
            columnWidth: columnWidth ? `${columnWidth}px` : undefined,
            columnGap: `${COLUMN_GAP}px`,
            columnFill: "auto",
            transform: `translateX(-${page * (columnWidth + COLUMN_GAP)}px)`,
            transition: "transform .28s cubic-bezier(.16,1,.3,1)",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <SelectionMenu
        selection={selection}
        onDismiss={() => setSelection(null)}
        onHighlight={createNote}
      />
    </>
  );
}

/**
 * Strips anything executable before the book HTML is injected. The file is
 * local and chosen by the reader, but a book is still untrusted input.
 */
function sanitize(raw: string): string {
  const parsed = new DOMParser().parseFromString(raw, "text/html");
  parsed.querySelectorAll("script, iframe, object, embed, link, meta, base").forEach((node) =>
    node.remove(),
  );
  parsed.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || (name === "href" && value.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return parsed.body.innerHTML;
}

/** Text of the column pair currently on screen, for read-aloud. */
function visibleColumnText(element: HTMLElement | null, page: number, stride: number): string {
  if (!element) return "";
  const from = page * stride;
  const to = from + stride;
  const base = element.getBoundingClientRect().left;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent?.trim();
    if (text) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const left = range.getBoundingClientRect().left - base;
      if (left >= from - 4 && left < to) parts.push(text);
    }
    node = walker.nextNode();
  }
  return parts.join(" ");
}

import * as pdfjs from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { highlightsForPage, parseRects } from "./highlights";
import type { Annotation } from "@/types";

export interface PageBox {
  index: number;
  /** Intrinsic size at scale 1, used to reserve space before rendering. */
  width: number;
  height: number;
}

interface PdfPageProps {
  page: PageBox;
  zoom: number;
  doc: React.RefObject<pdfjs.PDFDocumentProxy | null>;
  annotations: Annotation[];
  onHighlightClick: (annotation: Annotation) => void;
}

/**
 * One page: a canvas for the artwork, a transparent text layer above it so the
 * text can be selected, and the highlight overlay between them.
 *
 * Renders only while on or near the screen — a 900-page PDF holds 900 empty
 * boxes and at most a handful of canvases.
 */
export function PdfPage({ page, zoom, doc, annotations, onHighlightClick }: PdfPageProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: element.closest("[data-pdf-scroller]"), rootMargin: "1200px 0px" },
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
        return; // superseded by a newer render
      }
      if (cancelled) return;

      // The text layer is laid out in CSS pixels, so it uses the unscaled
      // viewport; the canvas above is the one that needs the device ratio.
      const container = textLayer.current;
      if (!container) return;
      container.replaceChildren();
      const layout = pdfPage.getViewport({ scale: zoom });
      container.style.setProperty("--total-scale-factor", String(zoom));
      const layer = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container,
        viewport: layout,
      });
      try {
        await layer.render();
      } catch {
        /* a page whose text cannot be laid out is still readable as an image */
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
  const highlights = highlightsForPage(annotations, page.index);

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

      {/* Between canvas and text so the colour sits under the words. */}
      <div className="pointer-events-none absolute inset-0">
        {highlights.map((item) =>
          parseRects(item.data).map((rect, index) => (
            <button
              key={`${item.id}-${index}`}
              onClick={() => onHighlightClick(item)}
              title={item.note ?? item.text ?? "Highlight"}
              className="pointer-events-auto absolute rounded-[2px]"
              style={{
                left: `${rect[0] * 100}%`,
                top: `${rect[1] * 100}%`,
                width: `${rect[2] * 100}%`,
                height: `${rect[3] * 100}%`,
                background: item.color ?? "#f5b642",
                opacity: 0.34,
                mixBlendMode: "multiply",
              }}
            />
          )),
        )}
      </div>

      <div ref={textLayer} className="textLayer" data-selectable />

      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] text-dim">
        {page.index}
      </span>
    </div>
  );
}

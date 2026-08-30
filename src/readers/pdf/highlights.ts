import type { Annotation, HighlightRects } from "@/types";

/** `[x, y, width, height]`, each a fraction of the page. */
export type NormalisedRect = [number, number, number, number];

/**
 * Selection geometry, stored as fractions of the page rather than pixels.
 * A highlight made at 100% has to come back in the right place at 250% and in
 * a resized window, and only a resolution-independent rectangle survives that.
 */
export function rectsFromSelection(
  selection: Selection,
  page: HTMLElement,
): NormalisedRect[] {
  const bounds = page.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return [];

  const out: NormalisedRect[] = [];
  for (let index = 0; index < selection.rangeCount; index++) {
    const range = selection.getRangeAt(index);
    // A range that starts in this page but ends in the next one still reports
    // rectangles for both; anything outside these bounds is discarded below.
    for (const rect of range.getClientRects()) {
      if (rect.width < 1 || rect.height < 1) continue;
      const x = (rect.left - bounds.left) / bounds.width;
      const y = (rect.top - bounds.top) / bounds.height;
      const width = rect.width / bounds.width;
      const height = rect.height / bounds.height;
      if (x + width < 0 || x > 1 || y + height < 0 || y > 1) continue;
      out.push([clamp(x), clamp(y), clamp(width), clamp(height)]);
    }
  }
  return merge(out);
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Text layers emit a rectangle per span, so a highlighted line arrives as a
 * dozen touching boxes. Runs on the same line are joined into one so the
 * overlay does not show seams.
 */
function merge(rects: NormalisedRect[]): NormalisedRect[] {
  if (rects.length < 2) return rects;
  const sorted = [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const merged: NormalisedRect[] = [];

  for (const rect of sorted) {
    const last = merged.at(-1);
    const sameLine =
      last && Math.abs(last[1] - rect[1]) < 0.004 && Math.abs(last[3] - rect[3]) < 0.006;
    const touching = last && rect[0] - (last[0] + last[2]) < 0.012;
    if (sameLine && touching) {
      const right = Math.max(last[0] + last[2], rect[0] + rect[2]);
      last[2] = right - last[0];
      last[3] = Math.max(last[3], rect[3]);
    } else {
      merged.push([...rect] as NormalisedRect);
    }
  }
  return merged;
}

export function encodeRects(rects: NormalisedRect[]): string {
  return JSON.stringify({ rects } satisfies HighlightRects);
}

export function parseRects(data: string | null): NormalisedRect[] {
  if (!data) return [];
  try {
    const parsed = JSON.parse(data) as Partial<HighlightRects>;
    if (!Array.isArray(parsed.rects)) return [];
    return parsed.rects.filter(
      (rect): rect is NormalisedRect => Array.isArray(rect) && rect.length === 4,
    );
  } catch {
    return [];
  }
}

/** Highlights belonging to one page of a PDF. */
export function highlightsForPage(annotations: Annotation[], page: number): Annotation[] {
  return annotations.filter(
    (item) => item.kind !== "bookmark" && Number(item.location) === page && item.data,
  );
}

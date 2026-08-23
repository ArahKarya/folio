/**
 * Minimal typings for the slice of epub.js the reader uses. The package ships
 * types, but they lag its behaviour; describing the surface we depend on keeps
 * the boundary honest and avoids `any` leaking through the reader.
 */

export interface EpubContents {
  addStylesheetCss: (css: string, key?: string) => void;
  document: Document;
  window: Window;
  content: HTMLElement;
}

export interface EpubLocation {
  start: { cfi: string; href: string; index: number; displayed: { page: number; total: number } };
  end: { cfi: string; href: string };
  atStart?: boolean;
  atEnd?: boolean;
}

export interface EpubNavItem {
  id: string;
  href: string;
  label: string;
  subitems?: EpubNavItem[];
}

export interface EpubAnnotations {
  add: (
    type: "highlight" | "underline" | "mark",
    cfiRange: string,
    data: object,
    callback?: (event: MouseEvent) => void,
    className?: string,
    styles?: Record<string, string>,
  ) => void;
  remove: (cfiRange: string, type: string) => void;
}

export interface EpubRendition {
  display: (target?: string | number) => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  destroy: () => void;
  resize: (width?: number, height?: number) => void;
  spread: (mode: "none" | "auto") => void;
  annotations: EpubAnnotations;
  getContents: () => EpubContents[];
  getRange: (cfiRange: string) => Range;
  hooks: { content: { register: (fn: (contents: EpubContents) => void) => void } };
  on: (event: string, handler: (...args: never[]) => void) => void;
  off?: (event: string, handler: (...args: never[]) => void) => void;
  themes: { fontSize: (size: string) => void };
  location?: EpubLocation;
}

export interface EpubSpineItem {
  href: string;
  load: (loader: unknown) => Promise<Document>;
  unload: () => void;
  find: (query: string) => Array<{ cfi: string; excerpt: string }>;
}

export interface EpubBook {
  ready: Promise<void>;
  loaded: { navigation: Promise<{ toc: EpubNavItem[] }> };
  locations: {
    generate: (chars: number) => Promise<string[]>;
    load: (json: string) => void;
    save: () => string;
    percentageFromCfi: (cfi: string) => number;
    cfiFromPercentage: (percentage: number) => string;
    length: () => number;
  };
  spine: { each: (fn: (item: EpubSpineItem) => void) => void };
  load: (path: string) => Promise<unknown>;
  renderTo: (element: HTMLElement, options: Record<string, unknown>) => EpubRendition;
  destroy: () => void;
}

export type EpubFactory = (input: string | ArrayBuffer, options?: object) => EpubBook;

/** Flattens epub.js's nested navigation into the app's own TOC shape. */
export function flattenToc(
  items: EpubNavItem[],
  depth = 0,
): Array<{ label: string; target: string; depth: number }> {
  return items.flatMap((item) => [
    { label: item.label.trim() || "Untitled section", target: item.href, depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

/** `chapter.xhtml#anchor` and `chapter.xhtml` must compare equal. */
export function sameDocument(a: string, b: string): boolean {
  const strip = (value: string) => value.split("#")[0].replace(/^\.?\//, "");
  return strip(a) === strip(b);
}

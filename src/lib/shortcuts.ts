/**
 * One list of shortcuts, shown in Settings and in the `?` overlay. Keeping it
 * here means the two can never disagree about what a key actually does.
 */

/** macOS says ⌘, everyone else says Ctrl. Set by `App` from the OS plugin. */
export function modKey(): string {
  return typeof document !== "undefined" && document.documentElement.dataset.os === "macos"
    ? "⌘"
    : "Ctrl";
}

export interface ShortcutGroup {
  title: string;
  items: Array<{ label: string; keys: string[] }>;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Anywhere",
    items: [
      { label: "Command palette", keys: [modKey(), "K"] },
      { label: "This list of shortcuts", keys: ["?"] },
      { label: "Close a panel or go back", keys: ["Esc"] },
    ],
  },
  {
    title: "Library",
    items: [
      { label: "Move between books", keys: ["←", "→", "↑", "↓"] },
      { label: "Read the selected book", keys: ["Enter"] },
      { label: "Book details", keys: ["Space"] },
      { label: "Favourite", keys: ["F"] },
      { label: "Search", keys: ["/"] },
      { label: "Add books", keys: [modKey(), "O"] },
    ],
  },
  {
    title: "Reader",
    items: [
      { label: "Next page", keys: ["→", "Space"] },
      { label: "Previous page", keys: ["←"] },
      { label: "Contents", keys: ["T"] },
      { label: "Notes and highlights", keys: ["N"] },
      { label: "Search in the book", keys: ["/"] },
      { label: "Focus mode", keys: ["F"] },
      { label: "Bookmark this page", keys: ["B"] },
      { label: "Bigger or smaller text", keys: ["+", "−"] },
    ],
  },
];

/**
 * True when the event came from somewhere the reader is typing, so global
 * single-letter shortcuts stay out of the way of ordinary text entry.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}

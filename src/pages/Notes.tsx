import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { ArrowLeft, Bookmark, Download, Search, StickyNote, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BookCover } from "@/components/library/BookCover";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState, LoadingScreen } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { HIGHLIGHT_COLORS } from "@/lib/theme";
import { cn, relativeDate } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import type { Annotation, Book } from "@/types";

type KindFilter = "all" | "highlight" | "note" | "bookmark";

interface NotesProps {
  onBack: () => void;
  /** Opens the book and jumps straight to where the note was made. */
  onOpenAt: (book: Book, target: string) => void;
}

/**
 * Every highlight, note and bookmark in the library on one screen. Notes are
 * only useful if they can be found again without remembering which book they
 * came from.
 */
export function Notes({ onBack, onOpenAt }: NotesProps) {
  const books = useLibrary((state) => state.books);
  const [annotations, setAnnotations] = useState<Annotation[] | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    void ipc
      .listAllAnnotations()
      .then(setAnnotations)
      .catch((error) => {
        toast.error(errorText(error));
        setAnnotations([]);
      });
  }, []);

  const byId = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);

  const groups = useMemo(() => {
    if (!annotations) return [];
    const needle = query.trim().toLowerCase();
    const matching = annotations.filter((item) => {
      if (kind !== "all" && item.kind !== kind) return false;
      if (color && item.color !== color) return false;
      if (!needle) return true;
      const book = byId.get(item.bookId);
      return (
        (item.text ?? "").toLowerCase().includes(needle) ||
        (item.note ?? "").toLowerCase().includes(needle) ||
        (book?.title ?? "").toLowerCase().includes(needle)
      );
    });

    // Grouped by book, books with the newest note first.
    const map = new Map<string, Annotation[]>();
    for (const item of matching) {
      const list = map.get(item.bookId) ?? [];
      list.push(item);
      map.set(item.bookId, list);
    }
    return [...map.entries()]
      .map(([bookId, items]) => ({ book: byId.get(bookId), items }))
      .filter((group): group is { book: Book; items: Annotation[] } => Boolean(group.book))
      .sort(
        (a, b) =>
          Math.max(...b.items.map((i) => i.updatedAt)) -
          Math.max(...a.items.map((i) => i.updatedAt)),
      );
  }, [annotations, query, kind, color, byId]);

  const total = annotations?.length ?? 0;

  const remove = async (id: string) => {
    try {
      await ipc.deleteAnnotation(id);
      setAnnotations((current) => current?.filter((item) => item.id !== id) ?? null);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const exportAll = async () => {
    try {
      const markdown = await ipc.exportAllAnnotationsMarkdown();
      const target = await save({
        defaultPath: "folio-notes.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!target) return;
      await writeTextFile(target, markdown);
      toast.success("All notes exported.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header
        style={{ paddingLeft: "max(var(--titlebar-inset), 0.75rem)" }}
        className="drag-region flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-bg/88 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl"
      >
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">Notes</h1>

        <div className="relative ml-2 min-w-40 flex-1 sm:max-w-64">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            className="field no-drag h-9 pl-9 text-[13px]"
          />
        </div>

        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as KindFilter)}
          aria-label="Filter by type"
          className="field no-drag h-9 w-auto text-[13px]"
        >
          <option value="all">Everything</option>
          <option value="highlight">Highlights</option>
          <option value="note">Notes</option>
          <option value="bookmark">Bookmarks</option>
        </select>

        <div className="no-drag flex items-center gap-1">
          {HIGHLIGHT_COLORS.map((swatch) => (
            <button
              key={swatch.id}
              onClick={() => setColor(color === swatch.value ? null : swatch.value)}
              title={swatch.label}
              aria-label={`Only ${swatch.label} highlights`}
              aria-pressed={color === swatch.value}
              className={cn(
                "h-5 w-5 rounded-full ring-1 ring-black/15 transition",
                color === swatch.value ? "ring-2 ring-accent" : "opacity-60 hover:opacity-100",
              )}
              style={{ background: swatch.value }}
            />
          ))}
        </div>

        <Button size="sm" variant="ghost" onClick={exportAll} disabled={!total}>
          <Download size={14} />
          Export all
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
        {annotations === null ? (
          <LoadingScreen />
        ) : !total ? (
          <EmptyState
            title="No notes yet"
            hint="Select text while reading to highlight it or attach a note. Bookmarks land here too."
          />
        ) : !groups.length ? (
          <EmptyState title="Nothing matches" hint="Try a different search or clear the filters." />
        ) : (
          <div className="mx-auto max-w-3xl space-y-8 py-6">
            {groups.map(({ book, items }) => (
              <section key={book.id}>
                <header className="mb-3 flex items-center gap-3">
                  <BookCover book={book} className="h-12 w-8 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-ink">{book.title}</h2>
                    <p className="truncate text-[11.5px] text-dim">
                      {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                      {relativeDate(Math.max(...items.map((i) => i.updatedAt)))}
                    </p>
                  </div>
                </header>

                <div className="space-y-1.5">
                  {items.map((item) => (
                    <NoteCard
                      key={item.id}
                      annotation={item}
                      onOpen={() => onOpenAt(book, item.location)}
                      onDelete={() => void remove(item.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function NoteCard({
  annotation,
  onOpen,
  onDelete,
}: {
  annotation: Annotation;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isBookmark = annotation.kind === "bookmark";

  return (
    <div className="group relative rounded-xl border border-line bg-surface p-3 transition hover:border-dim">
      <button onClick={onOpen} className="block w-full pr-8 text-left">
        {isBookmark ? (
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <Bookmark size={14} className="text-accent" />
            {annotation.page ? `Page ${annotation.page}` : "Bookmark"}
          </p>
        ) : (
          <>
            <p
              className="border-l-2 pl-2.5 text-[13px] leading-snug text-ink"
              style={{ borderColor: annotation.color ?? "var(--accent)" }}
            >
              {annotation.text}
            </p>
            {annotation.note ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-dim italic">
                <StickyNote size={12} className="mt-0.5 shrink-0" />
                {annotation.note}
              </p>
            ) : null}
          </>
        )}
        {annotation.chapter ? (
          <p className="mt-2 truncate text-[11px] text-dim">{annotation.chapter}</p>
        ) : null}
      </button>
      <IconButton
        label="Delete"
        onClick={onDelete}
        className="absolute top-1.5 right-1.5 h-7 w-7 opacity-0 transition group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

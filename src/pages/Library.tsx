import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { BookOpen, BookPlus, Check, FolderOpen, Info, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { BookCard, BookRow } from "@/components/library/BookCard";
import { CoverSkeleton } from "@/components/library/BookCover";
import { BookSheet } from "@/components/library/BookSheet";
import { CollectionsSidebar } from "@/components/library/CollectionsSidebar";
import { HomeShelf } from "@/components/library/HomeShelf";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
import { SelectionBar } from "@/components/library/SelectionBar";
import { Button } from "@/components/ui/Button";
import { ContextMenu, type MenuItem } from "@/components/ui/ContextMenu";
import { EmptyState, Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { describeImport } from "@/lib/import";
import { errorText, ipc } from "@/lib/ipc";
import { isTypingTarget } from "@/lib/shortcuts";
import { groupBySeries, useLibrary, visibleBooks } from "@/store/library";
import { useSettings } from "@/store/settings";
import type { Book, ImportReport } from "@/types";

interface LibraryProps {
  onRead: (book: Book) => void;
  onSettings: () => void;
  onStats: () => void;
  onNotes: () => void;
}

export function Library({ onRead, onSettings, onStats, onNotes }: LibraryProps) {
  const state = useLibrary();
  const {
    load,
    importFiles,
    importFolder,
    loading,
    importing,
    view,
    sort,
    selection,
    toggleSelected,
    toggleFavorite,
    toggleFinished,
    remove,
  } = state;
  const syncFolder = useSettings((s) => s.syncFolder);
  const behavior = useSettings((s) => s.behavior);
  const [details, setDetails] = useState<Book | null>(null);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [menu, setMenu] = useState<{ book: Book; at: { x: number; y: number } } | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
    void ipc.supportedExtensions().then(setExtensions);
  }, [load]);

  // The library opens the way the reader left it configured in Settings.
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    state.setView(behavior.defaultView);
    state.setSort(behavior.defaultSort as typeof sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behavior.defaultView, behavior.defaultSort]);

  const books = useMemo(() => visibleBooks(state), [state]);
  const showHome =
    !state.query && state.shelf === "all" && !state.activeCollection && view === "grid";

  const report = (result: ImportReport) => {
    const failure = result.failures[0];
    if (failure && !result.imported.length) {
      toast.error(`${failure.file}: ${failure.reason}`);
      return;
    }
    toast.success(describeImport(result));
    if (failure) toast.error(`${failure.file}: ${failure.reason}`);
  };

  const addFiles = useCallback(async () => {
    try {
      const picked = await open({ multiple: true, filters: [{ name: "Books", extensions }] });
      if (!picked) return;
      report(await importFiles(Array.isArray(picked) ? picked : [picked]));
    } catch (error) {
      toast.error(errorText(error));
    }
  }, [extensions, importFiles]);

  const addFolder = async () => {
    try {
      const picked = await open({ directory: true });
      if (!picked || Array.isArray(picked)) return;
      report(await importFolder(picked));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await ipc.syncNow();
      await load();
      toast.success(
        result.applied
          ? `Sync complete — ${result.applied} update${result.applied === 1 ? "" : "s"} pulled in.`
          : "Sync complete — everything was already up to date.",
      );
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSyncing(false);
    }
  };

  // --- keyboard navigation --------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || details || menu) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const columns = countColumns(gridRef.current);
      const move = (delta: number) => {
        event.preventDefault();
        setFocusIndex((current) => {
          const next = current < 0 ? 0 : current + delta;
          return Math.max(0, Math.min(books.length - 1, next));
        });
      };

      switch (event.key) {
        case "ArrowRight":
          move(1);
          break;
        case "ArrowLeft":
          move(-1);
          break;
        case "ArrowDown":
          move(view === "grid" ? columns : 1);
          break;
        case "ArrowUp":
          move(view === "grid" ? -columns : -1);
          break;
        case "Enter": {
          const book = books[focusIndex];
          if (book) {
            event.preventDefault();
            onRead(book);
          }
          break;
        }
        case " ": {
          const book = books[focusIndex];
          if (book) {
            event.preventDefault();
            setDetails(book);
          }
          break;
        }
        case "f":
        case "F": {
          const book = books[focusIndex];
          if (book) void toggleFavorite(book);
          break;
        }
        case "Escape":
          setFocusIndex(-1);
          state.clearSelection();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [books, focusIndex, view, details, menu, onRead, toggleFavorite, state]);

  // Keep the focused card on screen as the arrows walk the grid.
  useEffect(() => {
    if (focusIndex < 0) return;
    const book = books[focusIndex];
    if (!book) return;
    document
      .querySelector(`[data-book-card="${book.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex, books]);

  const menuItems = (book: Book): MenuItem[] => [
    { label: "Read", icon: <BookOpen size={15} />, onSelect: () => onRead(book) },
    { label: "Details", icon: <Info size={15} />, onSelect: () => setDetails(book) },
    {
      label: book.favorite ? "Remove from favourites" : "Add to favourites",
      icon: <Star size={15} />,
      onSelect: () => void toggleFavorite(book),
    },
    {
      label: book.finishedAt ? "Mark as unfinished" : "Mark as finished",
      icon: <Check size={15} />,
      onSelect: () => void toggleFinished(book),
    },
    {
      label: "Show the file",
      icon: <FolderOpen size={15} />,
      separated: true,
      onSelect: () => {
        void ipc
          .bookFilePath(book.id)
          .then(revealItemInDir)
          .catch((error) => toast.error(errorText(error)));
      },
    },
    {
      label: "Delete",
      icon: <Trash2 size={15} />,
      danger: true,
      onSelect: () => {
        void remove(book.id)
          .then(() => toast.info(`Removed “${book.title}”.`))
          .catch((error) => toast.error(errorText(error)));
      },
    },
  ];

  const openMenu = (book: Book, event: MouseEvent) => {
    setMenu({ book, at: { x: event.clientX, y: event.clientY } });
  };

  const cardProps = (book: Book, index: number) => ({
    book,
    index,
    onOpen: onRead,
    onDetails: setDetails,
    onContextMenu: openMenu,
    onToggleFavorite: (target: Book) => void toggleFavorite(target),
    onToggleSelect: (target: Book) => toggleSelected(target.id),
    selected: selection.includes(book.id),
    selecting: selection.length > 0,
    focused: focusIndex === index,
  });

  const grid = (items: Book[], offset = 0) => (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
      {items.map((book, index) => (
        <BookCard key={book.id} {...cardProps(book, offset + index)} />
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <LibraryToolbar
        onAddFiles={addFiles}
        onAddFolder={addFolder}
        onSync={sync}
        onSettings={onSettings}
        onStats={onStats}
        onNotes={onNotes}
        syncing={syncing}
        hasSyncFolder={Boolean(syncFolder)}
      />

      <div className="flex min-h-0 flex-1">
        <CollectionsSidebar />

        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-24 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-x-4 gap-y-6 pt-5 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
              {Array.from({ length: 12 }, (_, index) => (
                <div key={index}>
                  <CoverSkeleton className="aspect-[2/3] w-full" />
                  <div className="mt-2.5 h-3 w-4/5 animate-pulse rounded bg-surface2" />
                  <div className="mt-1.5 h-2.5 w-3/5 animate-pulse rounded bg-surface2" />
                </div>
              ))}
            </div>
          ) : !state.books.length ? (
            <EmptyState
              title="Your library is empty"
              hint="Add EPUB, PDF, comic archives or MOBI files. Folio copies them into its own folder, so moving the originals later is safe."
              action={
                <Button variant="primary" onClick={addFiles}>
                  <BookPlus size={16} />
                  Add your first book
                </Button>
              }
            />
          ) : (
            <>
              {showHome ? (
                <HomeShelf books={state.books} onRead={onRead} onDetails={setDetails} />
              ) : null}

              {!books.length ? (
                <EmptyState
                  title="Nothing on this shelf"
                  hint="Try a different shelf, or clear the search and filters."
                />
              ) : view === "list" ? (
                <div ref={gridRef} className="flex flex-col gap-0.5 pt-4">
                  {books.map((book) => (
                    <BookRow
                      key={book.id}
                      book={book}
                      onOpen={onRead}
                      onDetails={setDetails}
                      onContextMenu={openMenu}
                      onToggleFavorite={(target) => void toggleFavorite(target)}
                    />
                  ))}
                </div>
              ) : sort === "series" ? (
                <div ref={gridRef} className="space-y-7 pt-5">
                  {seriesSections(books).map(({ series, books: group, offset }) => (
                    <section key={series ?? "__loose"}>
                      <h2 className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
                        {series ?? "Not in a series"}
                      </h2>
                      {grid(group, offset)}
                    </section>
                  ))}
                </div>
              ) : (
                <div ref={gridRef} className="pt-5">
                  {grid(books)}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {importing ? (
        <div className="panel fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 px-4 py-2.5 text-[13px]">
          <Spinner className="h-4 w-4" />
          Importing books…
        </div>
      ) : null}

      <SelectionBar />
      <ContextMenu
        at={menu?.at ?? null}
        items={menu ? menuItems(menu.book) : []}
        onClose={() => setMenu(null)}
      />
      <BookSheet book={details} onClose={() => setDetails(null)} onOpen={onRead} />
    </div>
  );
}

/** Series sections carrying the running index the keyboard focus counts with. */
function seriesSections(books: Book[]) {
  let offset = 0;
  return groupBySeries(books).map((group) => {
    const section = { ...group, offset };
    offset += group.books.length;
    return section;
  });
}

/**
 * How many cards fit on a row, read from the layout rather than assumed — the
 * grid is `auto-fill`, so only the browser knows.
 */
function countColumns(grid: HTMLElement | null): number {
  const cards = grid?.querySelectorAll<HTMLElement>("[data-book-card]");
  if (!cards?.length) return 1;
  const top = cards[0].offsetTop;
  let columns = 0;
  for (const card of cards) {
    if (card.offsetTop !== top) break;
    columns += 1;
  }
  return Math.max(1, columns);
}

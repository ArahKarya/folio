import {
  BarChart3,
  FolderPlus,
  Grid2X2,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { isTypingTarget } from "@/lib/shortcuts";
import { SHELVES, useLibrary, type FormatFilter, type ShelfId, type SortKey } from "@/store/library";

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "Recently read" },
  { value: "added", label: "Recently added" },
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "series", label: "Series" },
  { value: "progress", label: "Progress" },
];

const FORMATS: Array<{ value: FormatFilter; label: string }> = [
  { value: "all", label: "All formats" },
  { value: "epub", label: "EPUB" },
  { value: "pdf", label: "PDF" },
  { value: "comic", label: "Comics" },
  { value: "mobi", label: "MOBI" },
];

interface LibraryToolbarProps {
  onAddFiles: () => void;
  onAddFolder: () => void;
  onSync: () => void;
  onSettings: () => void;
  onStats: () => void;
  onNotes: () => void;
  syncing: boolean;
  hasSyncFolder: boolean;
}

export function LibraryToolbar({
  onAddFiles,
  onAddFolder,
  onSync,
  onSettings,
  onStats,
  onNotes,
  syncing,
  hasSyncFolder,
}: LibraryToolbarProps) {
  const {
    query,
    setQuery,
    sort,
    setSort,
    view,
    setView,
    formatFilter,
    setFormatFilter,
    collections,
    activeCollection,
    setActiveCollection,
    shelf,
    setShelf,
  } = useLibrary();
  const search = useRef<HTMLInputElement>(null);

  // `/` jumps to search, the convention every reader already knows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || isTypingTarget(event.target)) return;
      event.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="drag-region sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div
        style={{ paddingLeft: "max(var(--titlebar-inset), 1.5rem)" }}
        className="flex flex-wrap items-center gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6"
      >
        <h1 className="mr-2 hidden text-[15px] font-semibold tracking-tight sm:block">Folio</h1>

        {/* A floor on the width: without it the search box is crushed to nothing
            by the buttons instead of letting the row wrap. */}
        <div className="relative min-w-44 flex-1 basis-48 sm:max-w-72">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input
            ref={search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder="Search books"
            aria-label="Search the library"
            className="field no-drag h-9 pl-9 text-[13px]"
          />
        </div>

        {/* The sidebar disappears below `lg`, so shelves and collections stay
            reachable here instead of becoming unusable. */}
        <select
          value={activeCollection ? `c:${activeCollection}` : `s:${shelf}`}
          onChange={(event) => {
            const [kind, value] = event.target.value.split(":");
            if (kind === "s") {
              setShelf(value as ShelfId);
              setActiveCollection(null);
            } else {
              setShelf("all");
              setActiveCollection(value);
            }
          }}
          aria-label="Shelf or collection"
          className="field no-drag h-9 w-auto text-[13px] lg:hidden"
        >
          {SHELVES.map((item) => (
            <option key={item.id} value={`s:${item.id}`}>
              {item.label}
            </option>
          ))}
          {collections.map((collection) => (
            <option key={collection.id} value={`c:${collection.id}`}>
              {collection.name}
            </option>
          ))}
        </select>

        <select
          value={formatFilter}
          onChange={(event) => setFormatFilter(event.target.value as FormatFilter)}
          aria-label="Filter by format"
          className="field no-drag hidden h-9 w-auto text-[13px] md:block"
        >
          {FORMATS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          aria-label="Sort books"
          className="field no-drag hidden h-9 w-auto text-[13px] sm:block"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <IconButton
            label={view === "grid" ? "Switch to list" : "Switch to grid"}
            onClick={() => setView(view === "grid" ? "list" : "grid")}
          >
            {view === "grid" ? <List size={17} /> : <Grid2X2 size={17} />}
          </IconButton>
          {hasSyncFolder ? (
            <IconButton label="Sync now" onClick={onSync} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? "animate-spin" : undefined} />
            </IconButton>
          ) : null}
          <IconButton label="Notes and highlights" onClick={onNotes}>
            <StickyNote size={17} />
          </IconButton>
          <IconButton label="Reading stats" onClick={onStats}>
            <BarChart3 size={17} />
          </IconButton>
          <IconButton label="Settings" onClick={onSettings}>
            <Settings size={17} />
          </IconButton>
          <IconButton label="Add a folder of books" onClick={onAddFolder}>
            <FolderPlus size={17} />
          </IconButton>
          <Button variant="primary" size="sm" onClick={onAddFiles}>
            <Plus size={15} />
            <span className="hidden sm:inline">Add books</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

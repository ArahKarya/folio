import { open } from "@tauri-apps/plugin-dialog";
import { BookPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BookCard, BookRow } from "@/components/library/BookCard";
import { BookSheet } from "@/components/library/BookSheet";
import { CollectionsSidebar } from "@/components/library/CollectionsSidebar";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
import { Button } from "@/components/ui/Button";
import { EmptyState, LoadingScreen, Spinner } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { describeImport } from "@/lib/import";
import { errorText, ipc } from "@/lib/ipc";
import { useLibrary, visibleBooks } from "@/store/library";
import { useSettings } from "@/store/settings";
import type { Book, ImportReport } from "@/types";

interface LibraryProps {
  onRead: (book: Book) => void;
  onSettings: () => void;
  onStats: () => void;
}

export function Library({ onRead, onSettings, onStats }: LibraryProps) {
  const state = useLibrary();
  const { load, importFiles, importFolder, loading, importing, view } = state;
  const syncFolder = useSettings((s) => s.syncFolder);
  const [details, setDetails] = useState<Book | null>(null);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void load();
    void ipc.supportedExtensions().then(setExtensions);
  }, [load]);

  const books = useMemo(() => visibleBooks(state), [state]);

  const report = (result: ImportReport) => {
    const failure = result.failures[0];
    if (failure && !result.imported.length) {
      toast.error(`${failure.file}: ${failure.reason}`);
      return;
    }
    toast.success(describeImport(result));
    if (failure) toast.error(`${failure.file}: ${failure.reason}`);
  };

  const addFiles = async () => {
    try {
      const picked = await open({
        multiple: true,
        filters: [{ name: "Books", extensions }],
      });
      if (!picked) return;
      report(await importFiles(Array.isArray(picked) ? picked : [picked]));
    } catch (error) {
      toast.error(errorText(error));
    }
  };

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

  return (
    <div className="flex h-full flex-col">
      <LibraryToolbar
        onAddFiles={addFiles}
        onAddFolder={addFolder}
        onSync={sync}
        onSettings={onSettings}
        onStats={onStats}
        syncing={syncing}
        hasSyncFolder={Boolean(syncFolder)}
      />

      <div className="flex min-h-0 flex-1">
        <CollectionsSidebar />

        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-6">
          {loading ? (
            <LoadingScreen />
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
          ) : !books.length ? (
            <EmptyState title="No books match" hint="Try a different search or clear the filters." />
          ) : view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(126px,1fr))] gap-x-4 gap-y-6 pt-5 sm:grid-cols-[repeat(auto-fill,minmax(148px,1fr))]">
              {books.map((book, index) => (
                <BookCard
                  key={book.id}
                  book={book}
                  index={index}
                  onOpen={onRead}
                  onDetails={setDetails}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 pt-4">
              {books.map((book) => (
                <BookRow key={book.id} book={book} onOpen={onRead} onDetails={setDetails} />
              ))}
            </div>
          )}
        </main>
      </div>

      {importing ? (
        <div className="panel fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 px-4 py-2.5 text-[13px]">
          <Spinner className="h-4 w-4" />
          Importing books…
        </div>
      ) : null}

      <BookSheet book={details} onClose={() => setDetails(null)} onOpen={onRead} />
    </div>
  );
}

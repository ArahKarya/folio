import { getCurrentWebview } from "@tauri-apps/api/webview";
import { platform } from "@tauri-apps/plugin-os";
import { AnimatePresence, motion } from "framer-motion";
import { BookPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "@/components/ui/Toast";
import { LoadingScreen } from "@/components/ui/Spinner";
import { errorText, ipc } from "@/lib/ipc";
import { describeImport } from "@/lib/import";
import { Library } from "@/pages/Library";
import { Reader } from "@/pages/Reader";
import { Settings } from "@/pages/Settings";
import { Stats } from "@/pages/Stats";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import type { Book } from "@/types";

type View = "library" | "settings" | "stats";

export function App() {
  const [view, setView] = useState<View>("library");
  const [reading, setReading] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);

  const loadSettings = useSettings((state) => state.load);
  const settingsLoaded = useSettings((state) => state.loaded);
  const autoSync = useSettings((state) => state.behavior.autoSync);
  const syncFolder = useSettings((state) => state.syncFolder);
  const { importFiles, refreshBook, load } = useLibrary();

  useEffect(() => {
    void loadSettings();
    // Drives the title-bar inset that keeps content clear of the macOS
    // window buttons.
    document.documentElement.dataset.os = platform();
  }, [loadSettings]);

  // Pull in whatever other devices left behind, once, at startup.
  useEffect(() => {
    if (!settingsLoaded || !autoSync || !syncFolder) return;
    void ipc
      .syncNow()
      .then((report) => {
        if (report.applied) void load();
      })
      .catch(() => {
        // A sync folder that is offline at launch is not worth interrupting for.
      });
  }, [settingsLoaded, autoSync, syncFolder, load]);

  // Files dropped anywhere on the window are imported.
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setDragging(true);
      } else if (event.payload.type === "drop") {
        setDragging(false);
        void importFiles(event.payload.paths)
          .then((report) => toast.success(describeImport(report)))
          .catch((error) => toast.error(errorText(error)));
      } else {
        setDragging(false);
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [importFiles]);

  const closeReader = useCallback(() => {
    const book = reading;
    setReading(null);
    if (!book) return;
    // The shelf must show the position the reader actually stopped at.
    void refreshBook(book.id);
    if (autoSync && syncFolder) void ipc.syncNow().catch(() => undefined);
  }, [reading, refreshBook, autoSync, syncFolder]);

  if (!settingsLoaded) return <LoadingScreen />;

  return (
    <div className="h-full w-full">
      <AnimatePresence mode="wait">
        {reading ? (
          <motion.div
            key="reader"
            className="h-full"
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Reader book={reading} onClose={closeReader} />
          </motion.div>
        ) : (
          <motion.div
            key={view}
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            {view === "library" ? (
              <Library
                onRead={setReading}
                onSettings={() => setView("settings")}
                onStats={() => setView("stats")}
              />
            ) : view === "settings" ? (
              <Settings onBack={() => setView("library")} />
            ) : (
              <Stats onBack={() => setView("library")} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dragging ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-3 z-[70] grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-bg/80 backdrop-blur-sm"
          >
            <div className="flex flex-col items-center gap-2 text-accent">
              <BookPlus size={28} />
              <p className="text-sm font-medium">Drop to add to your library</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Toaster />
    </div>
  );
}

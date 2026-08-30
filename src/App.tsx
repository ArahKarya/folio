import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { platform } from "@tauri-apps/plugin-os";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BookPlus,
  FolderPlus,
  Keyboard,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  StickyNote,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CommandPalette, type Command } from "@/components/ui/CommandPalette";
import { ShortcutsOverlay } from "@/components/ui/ShortcutsOverlay";
import { LoadingScreen } from "@/components/ui/Spinner";
import { Toaster, toast } from "@/components/ui/Toast";
import { describeImport } from "@/lib/import";
import { errorText, ipc } from "@/lib/ipc";
import { isTypingTarget } from "@/lib/shortcuts";
import { THEMES } from "@/lib/theme";
import { Library } from "@/pages/Library";
import { Notes } from "@/pages/Notes";
import { Reader } from "@/pages/Reader";
import { Settings } from "@/pages/Settings";
import { Stats } from "@/pages/Stats";
import { useLibrary } from "@/store/library";
import { useReader } from "@/store/reader";
import { useSettings, watchSystemTheme } from "@/store/settings";
import type { Book } from "@/types";

type View = "library" | "settings" | "stats" | "notes";

export function App() {
  const [view, setView] = useState<View>("library");
  const [reading, setReading] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);

  const loadSettings = useSettings((state) => state.load);
  const settingsLoaded = useSettings((state) => state.loaded);
  const autoSync = useSettings((state) => state.behavior.autoSync);
  const syncFolder = useSettings((state) => state.syncFolder);
  const activeTheme = useSettings((state) => state.activeTheme);
  const setTheme = useSettings((state) => state.setTheme);
  const { importFiles, importFolder, refreshBook, load } = useLibrary();

  useEffect(() => {
    void loadSettings();
    // Drives the title-bar inset that keeps content clear of the macOS
    // window buttons, and the ⌘-versus-Ctrl labels in the shortcut lists.
    document.documentElement.dataset.os = platform();
    return watchSystemTheme();
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

  /** Opens a book and jumps to a specific place inside it. */
  const openBookAt = useCallback((book: Book, target: string) => {
    useReader.getState().setPendingTarget(target);
    setReading(book);
  }, []);

  const addFiles = useCallback(async () => {
    try {
      const extensions = await ipc.supportedExtensions();
      const picked = await open({ multiple: true, filters: [{ name: "Books", extensions }] });
      if (!picked) return;
      const report = await importFiles(Array.isArray(picked) ? picked : [picked]);
      toast.success(describeImport(report));
    } catch (error) {
      toast.error(errorText(error));
    }
  }, [importFiles]);

  const commands = useMemo<Command[]>(() => {
    const scheme = THEMES[activeTheme].scheme;
    return [
      {
        id: "add-books",
        label: "Add books",
        hint: "Import EPUB, PDF, comics or MOBI",
        icon: <BookPlus size={15} />,
        keywords: "import open file",
        run: () => void addFiles(),
      },
      {
        id: "add-folder",
        label: "Add a folder of books",
        icon: <FolderPlus size={15} />,
        keywords: "import scan directory",
        run: () => {
          void open({ directory: true })
            .then((picked) => {
              if (!picked || Array.isArray(picked)) return;
              return importFolder(picked).then((report) =>
                toast.success(describeImport(report)),
              );
            })
            .catch((error) => toast.error(errorText(error)));
        },
      },
      {
        id: "notes",
        label: "Notes and highlights",
        icon: <StickyNote size={15} />,
        keywords: "annotations bookmarks",
        run: () => {
          setReading(null);
          setView("notes");
        },
      },
      {
        id: "stats",
        label: "Reading stats",
        icon: <BarChart3 size={15} />,
        keywords: "streak time goal",
        run: () => {
          setReading(null);
          setView("stats");
        },
      },
      {
        id: "settings",
        label: "Settings",
        icon: <SettingsIcon size={15} />,
        keywords: "preferences theme sync",
        run: () => {
          setReading(null);
          setView("settings");
        },
      },
      {
        id: "theme",
        label: scheme === "dark" ? "Switch to a light theme" : "Switch to a dark theme",
        icon: scheme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
        keywords: "appearance dark light",
        run: () => setTheme(scheme === "dark" ? "paper" : "dark"),
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        icon: <Keyboard size={15} />,
        keywords: "keys help",
        run: () => setShortcuts(true),
      },
      ...(syncFolder
        ? [
            {
              id: "sync",
              label: "Sync now",
              icon: <RefreshCw size={15} />,
              keywords: "folder devices",
              run: () => {
                void ipc
                  .syncNow()
                  .then((report) => {
                    void load();
                    toast.success(
                      report.applied
                        ? `Pulled in ${report.applied} update${report.applied === 1 ? "" : "s"}.`
                        : "Everything was already up to date.",
                    );
                  })
                  .catch((error) => toast.error(errorText(error)));
              },
            },
          ]
        : []),
    ];
  }, [addFiles, importFolder, activeTheme, setTheme, syncFolder, load]);

  // Global keys. Registered in the capture phase so the palette wins over the
  // reader's own single-letter shortcuts.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopPropagation();
        setPalette((value) => !value);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void addFiles();
        return;
      }
      if (event.key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setShortcuts((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [addFiles]);

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
                onNotes={() => setView("notes")}
              />
            ) : view === "settings" ? (
              <Settings onBack={() => setView("library")} />
            ) : view === "notes" ? (
              <Notes onBack={() => setView("library")} onOpenAt={openBookAt} />
            ) : (
              <Stats onBack={() => setView("library")} onOpen={setReading} />
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

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        commands={commands}
        onOpenBook={(book) => {
          setView("library");
          setReading(book);
        }}
      />
      <ShortcutsOverlay open={shortcuts} onClose={() => setShortcuts(false)} />
      <Toaster />
    </div>
  );
}

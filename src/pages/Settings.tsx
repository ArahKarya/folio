import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  BookOpen,
  FolderOpen,
  Info,
  Keyboard,
  Library as LibraryIcon,
  Palette,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AccentSwatches, PagePreview, ThemeSwatches } from "@/components/settings/ThemePicker";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented, Slider, Switch } from "@/components/ui/Controls";
import { toast } from "@/components/ui/Toast";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";
import { sync as SYNC_FILE_NAME } from "@/lib/constants";
import { errorText, ipc } from "@/lib/ipc";
import { DARK_THEMES, FONTS, LIGHT_THEMES, type FontId } from "@/lib/theme";
import { cn, formatBytes } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";

type SectionId = "appearance" | "reading" | "library" | "sync" | "shortcuts" | "about";

const SECTIONS: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
  { id: "reading", label: "Reading", icon: <BookOpen size={16} /> },
  { id: "library", label: "Library", icon: <LibraryIcon size={16} /> },
  { id: "sync", label: "Sync", icon: <RefreshCw size={16} /> },
  { id: "shortcuts", label: "Shortcuts", icon: <Keyboard size={16} /> },
  { id: "about", label: "About", icon: <Info size={16} /> },
];

export function Settings({ onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<SectionId>("appearance");

  return (
    <div className="flex h-full flex-col">
      <header
        style={{ paddingLeft: "max(var(--titlebar-inset), 0.75rem)" }}
        className="drag-region flex shrink-0 items-center gap-2 border-b border-line bg-bg/88 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl"
      >
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-line p-3 sm:flex">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition",
                section === item.id
                  ? "bg-accent-soft text-accent"
                  : "text-dim hover:bg-surface hover:text-ink",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {/* Narrow windows lose the rail, so the sections become a pill bar. */}
          <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 sm:hidden">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-[12px] transition",
                  section === item.id ? "bg-accent-soft text-accent" : "text-dim",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-2xl px-5 py-6">
            {section === "appearance" ? <Appearance /> : null}
            {section === "reading" ? <Reading /> : null}
            {section === "library" ? <LibrarySection /> : null}
            {section === "sync" ? <SyncSection /> : null}
            {section === "shortcuts" ? <Shortcuts /> : null}
            {section === "about" ? <About /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-ink uppercase">{title}</h2>
      {hint ? <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-dim">{hint}</p> : null}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Appearance() {
  const {
    theme,
    themeMode,
    lightTheme,
    darkTheme,
    activeTheme,
    accent,
    typography,
    setTheme,
    setThemeMode,
    setSchemeTheme,
    setAccent,
  } = useSettings();

  return (
    <>
      <Group title="Theme" hint="Applies to the app and to the pages of your books.">
        <Segmented
          value={themeMode}
          onChange={setThemeMode}
          options={[
            { value: "fixed", label: "Always the same" },
            { value: "auto", label: "Follow the system" },
          ]}
        />

        {themeMode === "fixed" ? (
          <ThemeSwatches value={theme} onChange={setTheme} accent={accent} />
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] text-dim">When the system is light</p>
              <ThemeSwatches
                value={lightTheme}
                onChange={(name) => setSchemeTheme("light", name)}
                only={LIGHT_THEMES}
                accent={accent}
              />
            </div>
            <div>
              <p className="mb-2 text-[13px] text-dim">When the system is dark</p>
              <ThemeSwatches
                value={darkTheme}
                onChange={(name) => setSchemeTheme("dark", name)}
                only={DARK_THEMES}
                accent={accent}
              />
            </div>
          </div>
        )}
      </Group>

      <Group title="Accent" hint="Used for progress, highlights and every active control.">
        <AccentSwatches value={accent} onChange={setAccent} />
      </Group>

      <Group title="Preview" hint="Exactly how a page will look with these settings.">
        <PagePreview theme={activeTheme} accent={accent} typography={typography} />
      </Group>
    </>
  );
}

function Reading() {
  const { typography, setTypography, behavior, setBehavior, dailyGoal, setDailyGoal, resetReadingDefaults } =
    useSettings();

  return (
    <>
      <Group title="Type" hint="The starting point for every book; adjust per book from the reader.">
        <Segmented
          label="Typeface"
          value={typography.font}
          onChange={(font: FontId) => setTypography({ font })}
          options={FONTS.map((item) => ({ value: item.id, label: item.label }))}
        />
        <Slider
          label="Text size"
          min={13}
          max={34}
          value={typography.fontSize}
          display={`${typography.fontSize}px`}
          onChange={(fontSize) => setTypography({ fontSize })}
        />
        <Slider
          label="Line height"
          min={1.15}
          max={2.4}
          step={0.05}
          value={typography.lineHeight}
          display={typography.lineHeight.toFixed(2)}
          onChange={(lineHeight) => setTypography({ lineHeight })}
        />
        <Slider
          label="Paragraph spacing"
          min={0}
          max={2}
          step={0.05}
          value={typography.paragraphSpacing}
          display={`${typography.paragraphSpacing.toFixed(2)}em`}
          onChange={(paragraphSpacing) => setTypography({ paragraphSpacing })}
        />
        <Slider
          label="Page margins"
          min={0}
          max={22}
          value={typography.margin}
          display={`${typography.margin}%`}
          onChange={(margin) => setTypography({ margin })}
        />
        <Switch
          label="Justify text"
          checked={typography.justify}
          onChange={(justify) => setTypography({ justify })}
        />
      </Group>

      <Group title="Behaviour">
        <Segmented
          label="Page transition"
          value={behavior.pageTransition}
          onChange={(pageTransition) => setBehavior({ pageTransition })}
          options={[
            { value: "slide", label: "Slide" },
            { value: "fade", label: "Fade" },
            { value: "none", label: "None" },
          ]}
        />
        <Switch
          label="Tap edges to turn pages"
          checked={behavior.tapZones}
          onChange={(tapZones) => setBehavior({ tapZones })}
        />
        <Switch
          label="Show time remaining"
          checked={behavior.showRemaining}
          onChange={(showRemaining) => setBehavior({ showRemaining })}
        />
        <Switch
          label="Chapter marks on the progress bar"
          checked={behavior.showChapterMarks}
          onChange={(showChapterMarks) => setBehavior({ showChapterMarks })}
        />
        <Slider
          label="Auto-scroll speed"
          min={10}
          max={200}
          step={5}
          value={behavior.autoScrollSpeed}
          display={`${behavior.autoScrollSpeed} px/s`}
          onChange={(autoScrollSpeed) => setBehavior({ autoScrollSpeed })}
        />
        <Slider
          label="Read-aloud speed"
          min={0.5}
          max={2}
          step={0.05}
          value={behavior.ttsRate}
          display={`${behavior.ttsRate.toFixed(2)}×`}
          onChange={(ttsRate) => setBehavior({ ttsRate })}
        />
      </Group>

      <Group title="Daily goal" hint="Fills the ring on the stats screen and keeps your streak alive.">
        <Slider
          label="Minutes a day"
          min={5}
          max={180}
          step={5}
          value={dailyGoal}
          display={`${dailyGoal} min`}
          onChange={setDailyGoal}
        />
      </Group>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          resetReadingDefaults();
          toast.info("Reading settings restored to their defaults.");
        }}
      >
        <RotateCcw size={14} />
        Reset reading settings
      </Button>
    </>
  );
}

function LibrarySection() {
  const { behavior, setBehavior } = useSettings();
  const books = useLibrary((state) => state.books);
  const [size, setSize] = useState<number | null>(null);

  useEffect(() => {
    void ipc.librarySize().then(setSize).catch(() => setSize(null));
  }, [books.length]);

  const reveal = async () => {
    try {
      await revealItemInDir(await ipc.libraryFolder());
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <Group title="Defaults" hint="How the library looks when Folio starts.">
        <Segmented
          label="View"
          value={behavior.defaultView}
          onChange={(defaultView) => setBehavior({ defaultView })}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
        />
        <Segmented
          label="Sort"
          value={behavior.defaultSort}
          onChange={(defaultSort) => setBehavior({ defaultSort })}
          options={[
            { value: "recent", label: "Recent" },
            { value: "added", label: "Added" },
            { value: "title", label: "Title" },
            { value: "series", label: "Series" },
          ]}
        />
      </Group>

      <Group
        title="Storage"
        hint="Folio keeps its own copy of every book, so moving or deleting the original file is safe."
      >
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
          <span className="text-[13px] text-dim">
            {books.length} book{books.length === 1 ? "" : "s"}
          </span>
          <span className="tabular text-sm font-medium text-ink">
            {size === null ? "—" : formatBytes(size)}
          </span>
        </div>
        <Button size="sm" onClick={reveal}>
          <FolderOpen size={14} />
          Open the library folder
        </Button>
      </Group>
    </>
  );
}

function SyncSection() {
  const { behavior, setBehavior, syncFolder, setSyncFolder } = useSettings();
  const reloadLibrary = useLibrary((state) => state.load);
  const [syncing, setSyncing] = useState(false);

  const chooseFolder = async () => {
    try {
      const picked = await open({ directory: true });
      if (!picked || Array.isArray(picked)) return;
      await setSyncFolder(picked);
      toast.success("Sync folder set. Use “Sync now” on every device that shares this folder.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const report = await ipc.syncNow();
      await reloadLibrary();
      const skipped = report.skippedUnknownBooks
        ? ` ${report.skippedUnknownBooks} entries belong to books not on this device.`
        : "";
      toast.success(
        `Pulled in ${report.applied} update${report.applied === 1 ? "" : "s"}.${skipped}`,
      );
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSyncing(false);
    }
  };

  const exportBundle = async () => {
    try {
      const target = await save({
        defaultPath: SYNC_FILE_NAME,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!target) return;
      await ipc.exportSyncBundle(target);
      toast.success("Reading data exported.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const importBundle = async () => {
    try {
      const picked = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!picked || Array.isArray(picked)) return;
      const report = await ipc.importSyncBundle(picked);
      await reloadLibrary();
      toast.success(`Applied ${report.applied} update${report.applied === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <>
      <Group
        title="Sync between devices"
        hint={`Folio writes ${SYNC_FILE_NAME} into a folder you already sync — iCloud Drive, Dropbox, Syncthing. Reading positions, highlights, notes, collections, favourites and finished marks travel; the book files themselves stay put.`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={chooseFolder}>
            <FolderOpen size={15} />
            {syncFolder ? "Change folder" : "Choose folder"}
          </Button>
          {syncFolder ? (
            <>
              <Button variant="primary" onClick={runSync} disabled={syncing}>
                <RefreshCw size={15} className={syncing ? "animate-spin" : undefined} />
                Sync now
              </Button>
              <Button variant="ghost" onClick={() => void setSyncFolder(null)}>
                Turn off
              </Button>
            </>
          ) : null}
        </div>
        {syncFolder ? (
          <p data-selectable className="truncate text-[12px] text-dim">
            {syncFolder}
          </p>
        ) : null}
        <Switch
          label="Sync automatically"
          hint="Runs when Folio starts and after you close a book"
          checked={behavior.autoSync}
          onChange={(autoSync) => setBehavior({ autoSync })}
        />
      </Group>

      <Group title="Manual transfer" hint="A one-off copy of your reading data, without a shared folder.">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={exportBundle}>
            Export reading data
          </Button>
          <Button size="sm" variant="ghost" onClick={importBundle}>
            Import reading data
          </Button>
        </div>
      </Group>
    </>
  );
}

function Shortcuts() {
  return (
    <>
      {SHORTCUT_GROUPS.map((group) => (
        <Group key={group.title} title={group.title}>
          <dl className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-line bg-surface">
            {group.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-[13px] text-ink">{item.label}</dt>
                <dd className="flex gap-1">
                  {item.keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-[11px] text-dim"
                    >
                      {key}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </Group>
      ))}
    </>
  );
}

function About() {
  return (
    <Group title="Folio 0.2.0">
      <p className="text-[13px] leading-relaxed text-dim">
        Reads EPUB, PDF, CBZ/CBR comics and MOBI. Books are copied into Folio&rsquo;s own library
        folder on import, so moving or deleting the originals afterwards is safe.
      </p>
      <p className="text-[12px] leading-relaxed text-dim">
        AZW3 files that use the newer KF8 container may need converting to EPUB first. CBR comics
        are unavailable on Android, where the RAR decoder cannot be compiled. DRM-protected books
        are not supported.
      </p>
    </Group>
  );
}

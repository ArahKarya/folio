import { open, save } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, FolderOpen, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Segmented, Slider, Switch } from "@/components/ui/Controls";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { FONTS, THEMES, THEME_ORDER, type FontId } from "@/lib/theme";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import { sync as SYNC_FILE_NAME } from "@/lib/constants";

export function Settings({ onBack }: { onBack: () => void }) {
  const { theme, setTheme, typography, setTypography, behavior, setBehavior, syncFolder, setSyncFolder } =
    useSettings();
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
      toast.success(`Pulled in ${report.applied} update${report.applied === 1 ? "" : "s"}.${skipped}`);
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
    <div className="h-full overflow-y-auto">
      <header style={{ paddingLeft: "max(var(--titlebar-inset), 0.75rem)" }}
      className="drag-region sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/88 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-8 px-5 py-6">
        <Section title="Appearance" hint="Applies to the app and to the pages of your books.">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={THEME_ORDER.map((name) => ({ value: name, label: THEMES[name].label }))}
          />
        </Section>

        <Section title="Reading defaults" hint="Starting point for every book. Adjust per book from the reader.">
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
        </Section>

        <Section
          title="Sync between devices"
          hint={`Folio writes ${SYNC_FILE_NAME} into a folder you already sync — iCloud Drive, Dropbox, Syncthing. Reading positions, highlights, notes and collections travel; the book files themselves stay put.`}
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
            <p data-selectable className="mt-2 truncate text-[12px] text-dim">
              {syncFolder}
            </p>
          ) : null}
          <Switch
            label="Sync automatically"
            hint="Runs when Folio starts and after you close a book"
            checked={behavior.autoSync}
            onChange={(autoSync) => setBehavior({ autoSync })}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={exportBundle}>
              Export reading data
            </Button>
            <Button size="sm" variant="ghost" onClick={importBundle}>
              Import reading data
            </Button>
          </div>
        </Section>

        <Section title="About" hint="Folio 0.1.0">
          <p className="text-[13px] leading-relaxed text-dim">
            Reads EPUB, PDF, CBZ/CBR comics and MOBI. Books are copied into Folio&rsquo;s own
            library folder on import, so moving or deleting the originals afterwards is safe.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-dim">
            PDF highlighting is not supported yet — bookmarks and page notes are. AZW3 files that
            use the newer KF8 container may need converting to EPUB first.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-ink uppercase">{title}</h2>
      {hint ? <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-dim">{hint}</p> : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { DisplayPanel } from "./panels/DisplayPanel";
import { NotesPanel } from "./panels/NotesPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { TocPanel } from "./panels/TocPanel";
import { useReader, type ReaderPanel as PanelId } from "@/store/reader";

const TITLES: Record<Exclude<PanelId, null>, string> = {
  toc: "Contents",
  notes: "Notes & highlights",
  search: "Search",
  display: "Text & theme",
};

/** Right-hand drawer. On narrow windows it takes the full width instead. */
export function ReaderPanel() {
  const { panel, setPanel } = useReader();

  return (
    <AnimatePresence>
      {panel ? (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setPanel(null)}
            className="absolute inset-0 z-30 bg-black/25 md:hidden"
          />
          <motion.aside
            key="panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[22rem] flex-col border-l border-line bg-surface shadow-[var(--shadow)]"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[13px] font-semibold tracking-wide">{TITLES[panel]}</h2>
              <IconButton label="Close panel" onClick={() => setPanel(null)}>
                <X size={16} />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === "toc" ? <TocPanel /> : null}
              {panel === "notes" ? <NotesPanel /> : null}
              {panel === "search" ? <SearchPanel /> : null}
              {panel === "display" ? <DisplayPanel /> : null}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

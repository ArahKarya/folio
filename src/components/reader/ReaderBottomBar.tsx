import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { IconButton } from "@/components/ui/Button";
import { minutesLeft, percent } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";

export function ReaderBottomBar() {
  const { book, progress, controls, chapter, chapterPage, chapterMarks } = useReader();
  const { showRemaining, showChapterMarks } = useSettings((state) => state.behavior);
  const track = useRef<HTMLDivElement>(null);
  if (!book) return null;

  const remaining = minutesLeft(book);
  const canSeek = book.format !== "epub";

  /**
   * Dragging the bar seeks by page for the formats whose positions are pages.
   * EPUB positions are CFIs, which cannot be produced from a fraction without
   * the locations table, so its bar stays a read-out.
   */
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek || !controls || !book.pageCount) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const page = Math.round(ratio * (book.pageCount - 1));
    controls.goTo(String(book.format === "pdf" ? page + 1 : page));
  };

  return (
    <motion.footer
      initial={{ y: 56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 56, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-bg/88 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2">
        <IconButton label="Previous page" onClick={() => controls?.prev()}>
          <ChevronLeft size={18} />
        </IconButton>

        <div className="min-w-0 flex-1">
          <div
            ref={track}
            onClick={seek}
            className={`relative h-1.5 w-full overflow-hidden rounded-full bg-surface2 ${
              canSeek ? "cursor-pointer" : ""
            }`}
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: percent(progress) }}
            />
            {showChapterMarks
              ? chapterMarks.map((mark) => (
                  <span
                    key={mark}
                    aria-hidden
                    className="absolute top-0 h-full w-px bg-[var(--bg)] opacity-70"
                    style={{ left: `${mark * 100}%` }}
                  />
                ))
              : null}
          </div>

          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-dim">
            <span className="tabular">{percent(progress)}</span>
            {chapterPage && chapter ? (
              <span className="tabular truncate">
                {chapterPage.page} / {chapterPage.total} in this chapter
              </span>
            ) : null}
            {showRemaining && progress < 0.999 ? (
              <span className="tabular">≈ {remaining} min left</span>
            ) : null}
          </div>
        </div>

        <IconButton label="Next page" onClick={() => controls?.next()}>
          <ChevronRight size={18} />
        </IconButton>
      </div>
    </motion.footer>
  );
}

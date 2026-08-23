import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { minutesLeft, percent } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";

export function ReaderBottomBar() {
  const { book, progress, controls } = useReader();
  const showRemaining = useSettings((state) => state.behavior.showRemaining);
  if (!book) return null;

  const remaining = minutesLeft(book);

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
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: percent(progress) }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-dim">
            <span className="tabular">{percent(progress)}</span>
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

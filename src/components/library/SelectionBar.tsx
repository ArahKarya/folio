import { AnimatePresence, motion } from "framer-motion";
import { Check, Star, Tag, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { errorText } from "@/lib/ipc";
import { useLibrary } from "@/store/library";

/**
 * Batch actions for a multi-selection. Deleting asks twice, because it removes
 * files from disk and nothing else in the app is that final.
 */
export function SelectionBar() {
  const {
    selection,
    collections,
    clearSelection,
    bulkFavorite,
    bulkFinished,
    bulkDelete,
    bulkCollection,
  } = useLibrary();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickingCollection, setPickingCollection] = useState(false);
  const count = selection.length;

  const run = async (action: () => Promise<void>, message: string) => {
    try {
      await action();
      setConfirmDelete(false);
      setPickingCollection(false);
      toast.success(message);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <AnimatePresence>
      {count ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="panel fixed bottom-5 left-1/2 z-50 flex max-w-[min(46rem,94vw)] -translate-x-1/2 flex-col gap-2 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="tabular px-1 text-[13px] font-medium text-ink">
              {count} selected
            </span>
            <span className="h-5 w-px bg-[var(--border)]" />

            <Button size="sm" variant="ghost" onClick={() => void run(() => bulkFavorite(true), "Added to favourites.")}>
              <Star size={14} />
              Favourite
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run(() => bulkFinished(true), "Marked as finished.")}>
              <Check size={14} />
              Finished
            </Button>
            {collections.length ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPickingCollection((value) => !value)}
              >
                <Tag size={14} />
                Collection
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                confirmDelete
                  ? void run(bulkDelete, `Removed ${count} book${count === 1 ? "" : "s"}.`)
                  : setConfirmDelete(true)
              }
            >
              <Trash2 size={14} />
              {confirmDelete ? "Delete for good?" : "Delete"}
            </Button>

            <span className="flex-1" />
            <IconButton label="Clear selection" onClick={clearSelection}>
              <X size={16} />
            </IconButton>
          </div>

          {pickingCollection ? (
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  onClick={() =>
                    void run(
                      () => bulkCollection(collection.id, true),
                      `Added to “${collection.name}”.`,
                    )
                  }
                  className="rounded-full border border-line px-2.5 py-1 text-[12px] text-dim transition hover:border-accent hover:text-accent"
                >
                  {collection.name}
                </button>
              ))}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

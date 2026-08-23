import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  List,
  Maximize2,
  Search,
  StickyNote,
  Type,
  Volume2,
} from "lucide-react";
import { IconButton } from "@/components/ui/Button";
import { useReader } from "@/store/reader";

interface ReaderTopBarProps {
  onClose: () => void;
  onToggleTts: () => void;
  ttsActive: boolean;
  bookmarked: boolean;
  onBookmark: () => void;
}

export function ReaderTopBar({
  onClose,
  onToggleTts,
  ttsActive,
  bookmarked,
  onBookmark,
}: ReaderTopBarProps) {
  const { book, chapter, panel, setPanel, setFocus } = useReader();

  return (
    <motion.header
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -56, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      style={{ paddingLeft: "max(var(--titlebar-inset), 0.5rem)" }}
      className="drag-region absolute inset-x-0 top-0 z-30 flex items-center gap-1 border-b border-line bg-bg/88 px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl"
    >
      <IconButton label="Back to library" onClick={onClose}>
        <ArrowLeft size={18} />
      </IconButton>

      <div className="mx-1 min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink">{book?.title}</p>
        {chapter ? <p className="truncate text-[11px] text-dim">{chapter}</p> : null}
      </div>

      <IconButton
        label={bookmarked ? "Remove bookmark" : "Bookmark this page"}
        active={bookmarked}
        onClick={onBookmark}
      >
        {bookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
      </IconButton>
      <IconButton label="Read aloud" active={ttsActive} onClick={onToggleTts}>
        <Volume2 size={17} />
      </IconButton>
      <IconButton label="Contents" active={panel === "toc"} onClick={() => setPanel("toc")}>
        <List size={17} />
      </IconButton>
      <IconButton
        label="Notes and highlights"
        active={panel === "notes"}
        onClick={() => setPanel("notes")}
      >
        <StickyNote size={17} />
      </IconButton>
      <IconButton label="Search in book" active={panel === "search"} onClick={() => setPanel("search")}>
        <Search size={17} />
      </IconButton>
      <IconButton
        label="Text and theme"
        active={panel === "display"}
        onClick={() => setPanel("display")}
      >
        <Type size={17} />
      </IconButton>
      <IconButton label="Focus mode" onClick={() => setFocus(true)}>
        <Maximize2 size={17} />
      </IconButton>
    </motion.header>
  );
}

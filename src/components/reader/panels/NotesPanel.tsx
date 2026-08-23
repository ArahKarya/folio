import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Bookmark, Download, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Spinner";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { useReader } from "@/store/reader";
import type { Annotation } from "@/types";

export function NotesPanel() {
  const { book, annotations, controls, deleteAnnotation, setPanel } = useReader();
  if (!book) return null;

  const exportNotes = async () => {
    try {
      const markdown = await ipc.exportAnnotationsMarkdown(book.id);
      const target = await save({
        defaultPath: `${book.title.replace(/[\\/:*?"<>|]/g, "-")}.md`,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!target) return;
      await writeTextFile(target, markdown);
      toast.success("Notes exported.");
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  if (!annotations.length) {
    return (
      <EmptyState
        title="Nothing saved yet"
        hint="Select text to highlight it or attach a note. Bookmarks live here too."
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {annotations.map((item) => (
          <AnnotationRow
            key={item.id}
            annotation={item}
            onOpen={() => {
              controls?.goTo(item.location);
              setPanel(null);
            }}
            onDelete={() => void deleteAnnotation(item.id)}
          />
        ))}
      </div>
      <div className="border-t border-line p-3">
        <Button size="sm" className="w-full" onClick={exportNotes}>
          <Download size={14} />
          Export as Markdown
        </Button>
      </div>
    </div>
  );
}

function AnnotationRow({
  annotation,
  onOpen,
  onDelete,
}: {
  annotation: Annotation;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isBookmark = annotation.kind === "bookmark";

  return (
    <div className="group relative mb-1.5 rounded-xl border border-line bg-surface p-3">
      <button onClick={onOpen} className="block w-full text-left">
        {isBookmark ? (
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <Bookmark size={14} className="text-accent" />
            {annotation.page ? `Page ${annotation.page}` : "Bookmark"}
          </p>
        ) : (
          <>
            <p
              className="border-l-2 pl-2.5 text-[13px] leading-snug text-ink"
              style={{ borderColor: annotation.color ?? "var(--accent)" }}
            >
              {annotation.text}
            </p>
            {annotation.note ? (
              <p className="mt-2 text-[12.5px] leading-snug text-dim italic">{annotation.note}</p>
            ) : null}
          </>
        )}
        {annotation.chapter ? (
          <p className="mt-2 truncate text-[11px] text-dim">{annotation.chapter}</p>
        ) : null}
      </button>
      <IconButton
        label="Delete"
        onClick={onDelete}
        className="absolute top-1.5 right-1.5 h-7 w-7 opacity-0 transition group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

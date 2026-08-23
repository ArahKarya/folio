import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { BookOpen, Check, Download, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BookCover } from "./BookCover";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Controls";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/Toast";
import { errorText, ipc } from "@/lib/ipc";
import { FORMAT_LABELS, cn, formatBytes, formatDate, percent } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import type { Book, BookEdit } from "@/types";

interface BookSheetProps {
  book: Book | null;
  onClose: () => void;
  onOpen: (book: Book) => void;
}

function toEdit(book: Book): BookEdit {
  return {
    title: book.title,
    author: book.author,
    series: book.series,
    seriesIndex: book.seriesIndex,
    publisher: book.publisher,
    language: book.language,
    description: book.description,
  };
}

export function BookSheet({ book, onClose, onOpen }: BookSheetProps) {
  const { collections, update, remove, toggleFinished, setMembership } = useLibrary();
  const [edit, setEdit] = useState<BookEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEdit(book ? toEdit(book) : null);
    setConfirmDelete(false);
  }, [book]);

  if (!book || !edit) return null;

  const commit = async () => {
    setSaving(true);
    try {
      await update(book.id, edit);
      toast.success("Details saved.");
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  };

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

  const destroy = async () => {
    // Two-step rather than a system dialog: a modal alert would block the
    // webview's event loop on some platforms.
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await remove(book.id);
      toast.info(`Removed “${book.title}”.`);
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <Modal
      open
      title="Book details"
      onClose={onClose}
      width="40rem"
      footer={
        <>
          <Button variant="danger" onClick={destroy}>
            <Trash2 size={15} />
            {confirmDelete ? "Delete for good?" : "Delete"}
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={commit} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="sm:w-40 sm:shrink-0">
          <BookCover book={book} rounded="rounded-xl" className="aspect-[2/3] w-full sm:w-40" />
          <dl className="mt-3 space-y-1 text-[12px] text-dim">
            <div className="flex justify-between gap-2">
              <dt>Format</dt>
              <dd className="text-ink">{FORMAT_LABELS[book.format]}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Size</dt>
              <dd className="text-ink">{formatBytes(book.fileSize)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Added</dt>
              <dd className="text-ink">{formatDate(book.addedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Progress</dt>
              <dd className="text-ink">{percent(book.progress)}</dd>
            </div>
          </dl>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Field label="Title">
            <input
              className="field"
              value={edit.title}
              onChange={(event) => setEdit({ ...edit, title: event.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Author">
              <input
                className="field"
                value={edit.author ?? ""}
                onChange={(event) => setEdit({ ...edit, author: event.target.value || null })}
              />
            </Field>
            <Field label="Publisher">
              <input
                className="field"
                value={edit.publisher ?? ""}
                onChange={(event) => setEdit({ ...edit, publisher: event.target.value || null })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <Field label="Series">
              <input
                className="field"
                value={edit.series ?? ""}
                onChange={(event) => setEdit({ ...edit, series: event.target.value || null })}
              />
            </Field>
            <Field label="No.">
              <input
                className="field"
                inputMode="decimal"
                value={edit.seriesIndex ?? ""}
                onChange={(event) =>
                  setEdit({
                    ...edit,
                    seriesIndex: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
            </Field>
          </div>
          <Field label="Description">
            <textarea
              className="field min-h-24 resize-y"
              value={edit.description ?? ""}
              onChange={(event) => setEdit({ ...edit, description: event.target.value || null })}
            />
          </Field>

          {collections.length ? (
            <div>
              <span className="mb-1.5 block text-[13px] text-dim">Collections</span>
              <div className="flex flex-wrap gap-1.5">
                {collections.map((collection) => {
                  const member = book.collections.includes(collection.id);
                  return (
                    <button
                      key={collection.id}
                      onClick={() => void setMembership(book.id, collection.id, !member)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] transition",
                        member
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line text-dim hover:text-ink",
                      )}
                    >
                      {collection.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="primary" onClick={() => onOpen(book)}>
              <BookOpen size={14} />
              Read
            </Button>
            <Button size="sm" onClick={() => void toggleFinished(book)}>
              <Check size={14} />
              {book.finishedAt ? "Mark unfinished" : "Mark finished"}
            </Button>
            <Button size="sm" onClick={exportNotes}>
              <Download size={14} />
              Export notes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

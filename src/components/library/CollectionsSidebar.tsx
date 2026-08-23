import { Library, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { errorText } from "@/lib/ipc";
import { cn } from "@/lib/utils";
import { useLibrary } from "@/store/library";

export function CollectionsSidebar() {
  const { collections, books, activeCollection, setActiveCollection, createCollection, deleteCollection } =
    useLibrary();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = async () => {
    const trimmed = name.trim();
    setAdding(false);
    setName("");
    if (!trimmed) return;
    try {
      await createCollection(trimmed);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const remove = async (id: string, label: string) => {
    try {
      await deleteCollection(id);
      toast.info(`Removed the “${label}” collection. The books stay in your library.`);
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  return (
    <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-line px-3 py-4 lg:flex">
      <button
        onClick={() => setActiveCollection(null)}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition",
          activeCollection === null ? "bg-accent-soft text-accent" : "text-dim hover:bg-surface hover:text-ink",
        )}
      >
        <Library size={16} />
        <span className="flex-1">All books</span>
        <span className="tabular text-[11px] opacity-70">{books.length}</span>
      </button>

      <div className="mt-4 flex items-center justify-between px-3">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-dim uppercase">
          Collections
        </span>
        <IconButton label="New collection" onClick={() => setAdding(true)} className="h-6 w-6">
          <Plus size={14} />
        </IconButton>
      </div>

      {adding ? (
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
            if (event.key === "Escape") {
              setAdding(false);
              setName("");
            }
          }}
          placeholder="Collection name"
          className="field mt-1 h-8 text-[13px]"
        />
      ) : null}

      <div className="mt-1 flex flex-col gap-0.5 overflow-y-auto">
        {collections.map((collection) => (
          <div key={collection.id} className="group flex items-center">
            <button
              onClick={() => setActiveCollection(collection.id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition",
                activeCollection === collection.id
                  ? "bg-accent-soft text-accent"
                  : "text-dim hover:bg-surface hover:text-ink",
              )}
            >
              <Tag size={15} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="tabular text-[11px] opacity-70">{collection.bookCount}</span>
            </button>
            <IconButton
              label={`Delete ${collection.name}`}
              onClick={() => void remove(collection.id, collection.name)}
              className="h-7 w-7 opacity-0 transition group-hover:opacity-100"
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        ))}
        {!collections.length && !adding ? (
          <p className="px-3 py-1 text-[12px] leading-relaxed text-dim">
            Group books by shelf, subject or mood.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

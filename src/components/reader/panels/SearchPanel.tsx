import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useReader } from "@/store/reader";
import type { SearchHit } from "@/types";

export function SearchPanel() {
  const { controls, setPanel } = useReader();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const run = async () => {
    if (!controls?.search || query.trim().length < 2) return;
    setBusy(true);
    try {
      setHits(await controls.search(query.trim()));
    } finally {
      setBusy(false);
    }
  };

  if (!controls?.search) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-dim">
        Searching inside comics is not supported.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void run();
            }}
            placeholder="Find in this book"
            className="field h-9 pl-9 text-[13px]"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-dim">Press Enter to search the whole book.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {busy ? (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        ) : hits === null ? null : hits.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-dim">No matches.</p>
        ) : (
          hits.map((hit, index) => (
            <button
              key={`${hit.target}-${index}`}
              onClick={() => {
                controls.goTo(hit.target);
                setPanel(null);
              }}
              className="mb-1 block w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-surface2"
            >
              <span className="line-clamp-3 text-[12.5px] leading-snug text-ink">
                …{hit.excerpt}…
              </span>
              {hit.chapter ? (
                <span className="mt-1 block text-[11px] text-dim">{hit.chapter}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

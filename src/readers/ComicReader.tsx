import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingScreen } from "@/components/ui/Spinner";
import { errorText, ipc } from "@/lib/ipc";
import { cn, pageProgress } from "@/lib/utils";
import { useReader } from "@/store/reader";
import { useSettings } from "@/store/settings";
import type { Book } from "@/types";

interface ComicReaderProps {
  book: Book;
}

export function ComicReader({ book }: ComicReaderProps) {
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(() => Math.max(0, Number(book.location ?? "0")));
  const strip = useRef<HTMLDivElement>(null);
  const { behavior } = useSettings();
  const { setControls, setLoading, setError, reportPosition, setChapter } = useReader();

  const cache = useRef(new Map<number, string>());
  const [, forceRender] = useState(0);

  const spread = behavior.comicMode === "spread";
  const step = spread ? 2 : 1;

  useEffect(() => {
    let cancelled = false;
    void ipc
      .comicPageCount(book.id)
      .then((total) => {
        if (cancelled) return;
        setCount(total);
        setLoading(false);
        if (book.pageCount !== total) void ipc.setPageCount(book.id, total);
      })
      .catch((error) => {
        if (!cancelled) setError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // Blob URLs are revoked together on unmount; keeping them alive while the
  // book is open is what makes page turns instant.
  const pageCache = cache.current;
  useEffect(
    () => () => {
      for (const url of pageCache.values()) URL.revokeObjectURL(url);
      pageCache.clear();
    },
    [pageCache],
  );

  const fetchPage = useCallback(
    async (index: number) => {
      if (index < 0 || (count && index >= count)) return;
      if (pageCache.has(index)) return;
      try {
        const bytes = await ipc.comicPage(book.id, index);
        const url = URL.createObjectURL(new Blob([bytes]));
        pageCache.set(index, url);
        forceRender((tick) => tick + 1);
      } catch (error) {
        if (index === 0) setError(errorText(error));
      }
    },
    [book.id, count, pageCache, setError],
  );

  // Current page plus a small look-ahead, so a forward reader never waits.
  useEffect(() => {
    if (!count) return;
    const wanted =
      behavior.comicMode === "strip"
        ? Array.from({ length: count }, (_, index) => index).slice(page, page + 4)
        : [page, page + 1, page + 2, page + 3, page - 1];
    for (const index of wanted) void fetchPage(index);
  }, [page, count, behavior.comicMode, fetchPage]);

  useEffect(() => {
    if (!count) return;
    reportPosition(pageProgress(page, count), String(page));
    setChapter(`Page ${page + 1} of ${count}`);
  }, [page, count, reportPosition, setChapter]);

  const go = useCallback(
    (delta: number) => {
      setPage((current) => Math.min(Math.max(current + delta, 0), Math.max(count - 1, 0)));
    },
    [count],
  );

  useEffect(() => {
    setControls({
      next: () => go(step),
      prev: () => go(-step),
      goTo: (target) => setPage(Math.min(Math.max(Number(target) || 0, 0), Math.max(count - 1, 0))),
      visibleText: async () => "",
    });
    return () => setControls(null);
  }, [setControls, go, step, count]);

  const fit = useMemo(() => {
    switch (behavior.comicFit) {
      case "height":
        return "h-full w-auto max-w-none object-contain";
      case "page":
        return "max-h-full max-w-full object-contain";
      case "width":
      default:
        return "w-full h-auto object-contain";
    }
  }, [behavior.comicFit]);

  if (!count) return <LoadingScreen message="Reading the archive…" />;

  if (behavior.comicMode === "strip") {
    return (
      <div
        ref={strip}
        className="reader-surface h-full w-full overflow-y-auto overscroll-contain bg-black"
        onScroll={(event) => {
          const element = event.currentTarget;
          const approximate = Math.round(
            (element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight)) *
              (count - 1),
          );
          setPage(approximate);
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-col">
          {Array.from({ length: count }, (_, index) => (
            <ComicImage key={index} src={pageCache.get(index)} index={index} className="w-full" />
          ))}
        </div>
      </div>
    );
  }

  const visible = spread ? [page, page + 1].filter((index) => index < count) : [page];

  return (
    <div className="reader-surface grid h-full w-full place-items-center bg-black p-2">
      <div className={cn("flex h-full items-center justify-center gap-1", spread && "flex-row")}>
        {visible.map((index) => (
          <ComicImage key={index} src={pageCache.get(index)} index={index} className={fit} />
        ))}
      </div>
    </div>
  );
}

function ComicImage({
  src,
  index,
  className,
}: {
  src: string | undefined;
  index: number;
  className?: string;
}) {
  if (!src) {
    return (
      <div className="grid h-full min-h-40 w-full place-items-center text-[12px] text-white/40">
        Page {index + 1}
      </div>
    );
  }
  return <img src={src} alt={`Page ${index + 1}`} className={className} draggable={false} />;
}

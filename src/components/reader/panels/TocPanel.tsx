import { EmptyState } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { useReader } from "@/store/reader";

export function TocPanel() {
  const { toc, chapter, controls, setPanel } = useReader();

  if (!toc.length) {
    return <EmptyState title="No contents" hint="This book does not include a table of contents." />;
  }

  return (
    <nav className="flex flex-col py-2">
      {toc.map((item, index) => (
        <button
          key={`${item.target}-${index}`}
          onClick={() => {
            controls?.goTo(item.target);
            setPanel(null);
          }}
          style={{ paddingLeft: `${0.75 + item.depth * 0.9}rem` }}
          className={cn(
            "rounded-lg py-2 pr-3 text-left text-[13px] leading-snug transition",
            item.label === chapter
              ? "bg-accent-soft font-medium text-accent"
              : "text-dim hover:bg-surface2 hover:text-ink",
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

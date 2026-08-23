import { ArrowLeft, BookOpen, CheckCircle2, Clock, Flame } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Spinner";
import { ipc } from "@/lib/ipc";
import { formatDuration } from "@/lib/utils";
import type { LibraryStats } from "@/types";

const VISIBLE_DAYS = 56;

export function Stats({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<LibraryStats | null>(null);

  useEffect(() => {
    void ipc.getStats().then(setStats);
  }, []);

  const days = useMemo(() => stats?.daily.slice(-VISIBLE_DAYS) ?? [], [stats]);
  const peak = useMemo(() => Math.max(60, ...days.map((day) => day.seconds)), [days]);

  return (
    <div className="h-full overflow-y-auto">
      <header style={{ paddingLeft: "max(var(--titlebar-inset), 0.75rem)" }}
      className="drag-region sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/88 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">Reading stats</h1>
      </header>

      {!stats ? (
        <LoadingScreen />
      ) : (
        <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={<Flame size={16} />}
              label="Streak"
              value={`${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}`}
            />
            <Stat
              icon={<Clock size={16} />}
              label="This week"
              value={formatDuration(stats.secondsThisWeek)}
            />
            <Stat
              icon={<BookOpen size={16} />}
              label="In progress"
              value={String(stats.readingBooks)}
            />
            <Stat
              icon={<CheckCircle2 size={16} />}
              label="Finished"
              value={String(stats.finishedBooks)}
            />
          </div>

          <section className="panel p-4">
            <h2 className="text-[13px] font-semibold">Last eight weeks</h2>
            <p className="mt-0.5 text-[12px] text-dim">
              Total time read: {formatDuration(stats.secondsTotal)} across {stats.totalBooks} book
              {stats.totalBooks === 1 ? "" : "s"}.
            </p>
            <div className="mt-4 flex h-28 items-end gap-[3px]">
              {days.map((day) => (
                <div
                  key={day.day}
                  title={`${day.day} · ${formatDuration(day.seconds)}`}
                  className="flex-1 rounded-t-[3px] bg-accent transition-all"
                  style={{
                    // A day with any reading always shows a visible sliver.
                    height: day.seconds ? `${Math.max(6, (day.seconds / peak) * 100)}%` : "2px",
                    opacity: day.seconds ? 1 : 0.28,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-dim">
              <span>{days[0]?.day}</span>
              <span>Today</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="panel px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-dim">
        {icon}
        <span className="text-[11.5px]">{label}</span>
      </div>
      <p className="tabular mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

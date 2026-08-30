import { ArrowLeft, BookOpen, CheckCircle2, Clock, Flame, Star, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookCover } from "@/components/library/BookCover";
import { ProgressRing } from "@/components/library/HomeShelf";
import { IconButton } from "@/components/ui/Button";
import { LoadingScreen } from "@/components/ui/Spinner";
import { ipc } from "@/lib/ipc";
import { cn, formatDuration } from "@/lib/utils";
import { useLibrary } from "@/store/library";
import { useSettings } from "@/store/settings";
import type { Book, DailyStat, LibraryStats } from "@/types";

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

export function Stats({ onBack, onOpen }: { onBack: () => void; onOpen: (book: Book) => void }) {
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const books = useLibrary((state) => state.books);
  const dailyGoal = useSettings((state) => state.dailyGoal);

  useEffect(() => {
    void ipc.getStats().then(setStats);
  }, []);

  const byId = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);
  const goalSeconds = dailyGoal * 60;
  const todayRatio = stats ? Math.min(1, stats.secondsToday / goalSeconds) : 0;

  return (
    <div className="flex h-full flex-col">
      <header
        style={{ paddingLeft: "max(var(--titlebar-inset), 0.75rem)" }}
        className="drag-region flex shrink-0 items-center gap-2 border-b border-line bg-bg/88 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl"
      >
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1 className="text-[15px] font-semibold">Reading stats</h1>
      </header>

      {!stats ? (
        <LoadingScreen />
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-10">
          <div className="mx-auto max-w-3xl space-y-6 py-6">
            <section className="panel flex flex-wrap items-center gap-5 p-5">
              <ProgressRing value={todayRatio} size={92} stroke={8} />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">Today</h2>
                <p className="mt-0.5 text-[13px] text-dim">
                  {formatDuration(stats.secondsToday)} of a {dailyGoal} minute goal
                </p>
                <p className="mt-2 text-[12px] text-dim">
                  {stats.secondsToday >= goalSeconds
                    ? "Goal met — the streak is safe."
                    : `${formatDuration(Math.max(0, goalSeconds - stats.secondsToday))} to go.`}
                </p>
              </div>
              <div className="flex gap-2">
                <Stat icon={<Flame size={15} />} label="Streak" value={`${stats.streakDays}d`} />
                <Stat
                  icon={<Trophy size={15} />}
                  label="Best"
                  value={`${stats.longestStreak}d`}
                />
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                icon={<Clock size={16} />}
                label="This week"
                value={formatDuration(stats.secondsThisWeek)}
              />
              <Card
                icon={<BookOpen size={16} />}
                label="In progress"
                value={String(stats.readingBooks)}
              />
              <Card
                icon={<CheckCircle2 size={16} />}
                label="Finished"
                value={String(stats.finishedBooks)}
              />
              <Card
                icon={<Star size={16} />}
                label="Favourites"
                value={String(stats.favoriteBooks)}
              />
            </div>

            <section className="panel p-5">
              <h2 className="text-[13px] font-semibold">The last year</h2>
              <p className="mt-0.5 text-[12px] text-dim">
                {formatDuration(stats.secondsTotal)} across {stats.totalBooks} book
                {stats.totalBooks === 1 ? "" : "s"}.
              </p>
              <Heatmap daily={stats.daily} goalSeconds={goalSeconds} />
            </section>

            {stats.perBook.length ? (
              <section className="panel p-5">
                <h2 className="mb-3 text-[13px] font-semibold">Most time spent</h2>
                <div className="space-y-1">
                  {stats.perBook.map((entry) => {
                    const book = byId.get(entry.bookId);
                    if (!book) return null;
                    const share = entry.seconds / stats.perBook[0].seconds;
                    return (
                      <button
                        key={entry.bookId}
                        onClick={() => onOpen(book)}
                        className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-surface2"
                      >
                        <BookCover book={book} className="h-11 w-8 shrink-0" rounded="rounded" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{book.title}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface2">
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{ width: `${Math.max(4, share * 100)}%` }}
                            />
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-[12px] text-dim">
                          {formatDuration(entry.seconds)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </main>
      )}
    </div>
  );
}

/**
 * A year of reading as a calendar grid. Intensity is measured against the daily
 * goal, so a full square means "did what I set out to do" rather than an
 * arbitrary maximum.
 */
function Heatmap({ daily, goalSeconds }: { daily: DailyStat[]; goalSeconds: number }) {
  const weeks = useMemo(() => {
    if (!daily.length) return [];
    // The window starts on whatever weekday it starts on, so the first column
    // is padded until it begins on a Monday. Without this the row labels are
    // simply wrong.
    const first = new Date(`${daily[0].day}T00:00:00Z`);
    const weekday = (first.getUTCDay() + 6) % 7; // 0 = Monday
    const padded: Array<DailyStat | null> = [...Array(weekday).fill(null), ...daily];

    const columns: Array<Array<DailyStat | null>> = [];
    for (let index = 0; index < padded.length; index += 7) {
      columns.push(padded.slice(index, index + 7));
    }
    return columns;
  }, [daily]);

  const today = daily.at(-1)?.day;

  return (
    <div className="mt-4 flex gap-2">
      <div className="flex flex-col justify-between py-[1px] text-[9px] text-dim">
        {WEEKDAYS.map((label, index) => (
          <span key={index} className="h-[11px] leading-[11px]">
            {label}
          </span>
        ))}
      </div>

      <div className="flex flex-1 gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((day, row) => {
              if (!day) return <span key={`pad-${row}`} className="h-[11px] w-[11px]" />;
              const ratio = goalSeconds ? day.seconds / goalSeconds : 0;
              return (
                <span
                  key={day.day}
                  title={`${day.day} · ${day.seconds ? formatDuration(day.seconds) : "nothing read"}`}
                  className={cn(
                    "h-[11px] w-[11px] rounded-[2px]",
                    day.seconds ? "bg-accent" : "bg-surface2",
                    day.day === today && "ring-1 ring-accent ring-offset-1 ring-offset-[var(--surface)]",
                  )}
                  style={
                    day.seconds
                      ? { opacity: Math.max(0.28, Math.min(1, 0.28 + ratio * 0.72)) }
                      : undefined
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface2 px-3 py-2 text-center">
      <span className="flex items-center justify-center gap-1 text-dim">{icon}</span>
      <p className="tabular mt-0.5 text-sm font-semibold text-ink">{value}</p>
      <p className="text-[10px] text-dim">{label}</p>
    </div>
  );
}

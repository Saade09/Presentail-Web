import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  selectedIso: string | null;
  todayIso: string;
  onSelect: (iso: string) => void;
};

function isoFromYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildGrid(year: number, month: number): (number | null)[][] {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function CalendarPopover({ selectedIso, todayIso, onSelect }: Props) {
  const todayDate = new Date(`${todayIso}T00:00:00`);
  const todayYear = todayDate.getFullYear();
  const todayMonth = todayDate.getMonth();

  const [viewYear, setViewYear] = useState(() => {
    if (selectedIso) {
      const d = new Date(`${selectedIso}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d.getFullYear();
    }
    return todayYear;
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedIso) {
      const d = new Date(`${selectedIso}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return d.getMonth();
    }
    return todayMonth;
  });

  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const canGoPrev =
    viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth);

  const goPrev = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 shadow-lg w-72"
      data-testid="calendar-popover"
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className={cn(
            "p-1 rounded-lg transition-colors",
            canGoPrev
              ? "hover:bg-secondary text-foreground"
              : "text-muted-foreground opacity-40 cursor-not-allowed",
          )}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={goNext}
          className="p-1 rounded-lg hover:bg-secondary text-foreground transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        {grid.map((row, ri) => (
          <div key={ri} className="grid grid-cols-7">
            {row.map((day, ci) => {
              if (day === null) {
                return <div key={ci} />;
              }
              const iso = isoFromYMD(viewYear, viewMonth, day);
              const isPast = iso < todayIso;
              const isSelected = iso === selectedIso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={ci}
                  type="button"
                  disabled={isPast}
                  onClick={() => !isPast && onSelect(iso)}
                  className={cn(
                    "h-8 w-8 mx-auto flex items-center justify-center rounded-xl text-xs transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold"
                      : isPast
                        ? "text-muted-foreground opacity-40 cursor-not-allowed"
                        : isToday
                          ? "border border-primary text-primary font-semibold hover:bg-primary/10"
                          : "hover:bg-secondary text-foreground",
                  )}
                  data-testid={`cal-day-${iso}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

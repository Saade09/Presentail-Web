import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dayLabels,
  firstAvailableSlot,
  getCountryHour,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { CalendarPopover } from "./CalendarPopover";

type Props = {
  countryCode?: string | null;
  initialDate?: string | null;
  initialSlotLabel?: string | null;
  /** OS-sourced slots for the selected city. When provided, overrides the hardcoded per-country defaults. */
  timeSlots?: TimeSlot[];
  onChange: (args: {
    mode: "today_slot" | "schedule";
    date: string;
    slotLabel: string;
  }) => void;
};

// Inline date + time-slot picker that appears right below the
// "Select date and time of delivery" row on the product page. Shows a
// pill row of the next 3 days plus a calendar icon chip that
// opens a full month-view popover so shoppers can pick any future date.
export function ScheduleInlinePanel({
  countryCode,
  initialDate,
  initialSlotLabel,
  timeSlots: propTimeSlots,
  onChange,
}: Props) {
  const code = (countryCode ?? "LB").toUpperCase();
  const days = useMemo(() => dayLabels("Today", "Tomorrow").slice(0, 3), []);
  const timeSlots = useMemo(
    () => (propTimeSlots?.length ? propTimeSlots : timeSlotsForCountry(code)),
    [propTimeSlots, code],
  );
  const localHour = useMemo(() => getCountryHour(code), [code]);
  const todayIso = days[0]?.iso ?? new Date().toISOString().slice(0, 10);

  const seedDate =
    initialDate && initialDate >= todayIso ? initialDate : todayIso;
  const [date, setDateState] = useState<string>(seedDate);

  // No upper-bound clamp — shoppers can pick any future date via the calendar.
  const setDate = (next: string) => {
    if (next < todayIso) return;
    setDateState(next);
  };

  const [slotLabel, setSlotLabel] = useState<string | null>(() => {
    if (initialSlotLabel) {
      const known = timeSlots.find((s) => s.label === initialSlotLabel);
      const isToday = seedDate === todayIso;
      if (known && (!isToday || localHour < known.cutoffHour))
        return initialSlotLabel;
    }
    const isToday = seedDate === todayIso;
    return firstAvailableSlot(timeSlots, isToday, localHour)?.label ?? null;
  });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close the calendar popover when clicking outside of it.
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  // Push the parent every time the local selection changes — there's no
  // confirm button here, the inline picker is "live".
  const lastEmittedRef = useRef<string>("");
  useEffect(() => {
    if (!slotLabel) return;
    const mode: "today_slot" | "schedule" =
      date === todayIso ? "today_slot" : "schedule";
    const key = `${mode}|${date}|${slotLabel}`;
    if (key === lastEmittedRef.current) return;
    lastEmittedRef.current = key;
    onChange({ mode, date, slotLabel });
  }, [date, slotLabel, todayIso, onChange]);

  // Keep the slot valid when the date or available slot list changes (e.g.
  // switching from today to a future day, or the city's OS slots updating).
  useEffect(() => {
    const isToday = date === todayIso;
    if (!slotLabel) {
      const initial = firstAvailableSlot(timeSlots, isToday, localHour);
      if (initial) setSlotLabel(initial.label);
      return;
    }
    const found = timeSlots.find((s) => s.label === slotLabel);
    if (!found || (isToday && localHour >= found.cutoffHour)) {
      const initial = firstAvailableSlot(timeSlots, isToday, localHour);
      setSlotLabel(initial?.label ?? null);
    }
  }, [date, todayIso, timeSlots, localHour, slotLabel]);

  // Whether the current date selection falls outside the visible chip strip.
  const dateInStrip = days.some((d) => d.iso === date);

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5"
      data-testid="schedule-inline-panel"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Delivery Date
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 items-start">
          {days.map((d) => {
            const active = d.iso === date;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => {
                  setDate(d.iso);
                  setCalendarOpen(false);
                }}
                className={cn(
                  "shrink-0 rounded-xl border px-4 py-2 text-center transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:border-foreground/30",
                )}
                data-testid={`schedule-day-${d.iso}`}
              >
                <span className="block text-[11px] font-semibold leading-tight">
                  {d.label}
                </span>
                <span className="block text-xs opacity-80 leading-tight">
                  {d.date} {monthShort(d.iso)}
                </span>
              </button>
            );
          })}

          {/* Synthetic chip for a calendar-picked date outside the strip */}
          {!dateInStrip && (
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-xl border px-4 py-2 text-center transition-colors",
                "bg-primary text-primary-foreground border-primary",
              )}
              data-testid={`schedule-day-${date}`}
            >
              <span className="block text-[11px] font-semibold leading-tight">
                {weekdayShort(date)}
              </span>
              <span className="block text-xs opacity-80 leading-tight">
                {dayOfMonth(date)} {monthShort(date)}
              </span>
            </button>
          )}

          {/* Calendar icon chip — toggles the popover */}
          <div className="relative shrink-0" ref={calendarRef}>
            <button
              type="button"
              onClick={() => setCalendarOpen((o) => !o)}
              className={cn(
                "rounded-xl border px-3 py-2 text-center transition-colors flex flex-col items-center justify-center gap-0.5",
                calendarOpen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-foreground/30",
              )}
              aria-label="Pick a date from the calendar"
              data-testid="schedule-calendar-toggle"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="block text-[10px] leading-tight">More</span>
            </button>

            {calendarOpen && (
              <div className="absolute z-50 top-full left-0 mt-2">
                <CalendarPopover
                  selectedIso={date}
                  todayIso={todayIso}
                  onSelect={(iso) => {
                    setDate(iso);
                    setCalendarOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Delivery Time
        </p>
        <div className="flex flex-wrap gap-2">
          {timeSlots.map((s) => {
            const isToday = date === todayIso;
            const past = isToday && localHour >= s.cutoffHour;
            const active = slotLabel === s.label;
            const [from, to] = s.label.split("–").map((p) => p.trim());
            return (
              <button
                key={s.label}
                type="button"
                disabled={past}
                onClick={() => setSlotLabel(s.label)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-center transition-colors min-w-[88px]",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : past
                      ? "bg-secondary text-muted-foreground border-border line-through opacity-60 cursor-not-allowed"
                      : "bg-background text-foreground border-border hover:border-foreground/30",
                )}
                data-testid={`schedule-slot-${s.cutoffHour}`}
              >
                <span className="block text-xs leading-tight">{from}</span>
                {to ? (
                  <span className="block text-xs leading-tight">{to}</span>
                ) : null}
                {s.extraFee && s.extraFee > 0 ? (
                  <span className="block text-[10px] leading-tight mt-0.5 opacity-80">
                    +${s.extraFee}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function monthShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short" });
}

function weekdayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function dayOfMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return String(d.getDate());
}

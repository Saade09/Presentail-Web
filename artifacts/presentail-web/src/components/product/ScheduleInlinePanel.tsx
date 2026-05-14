import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  dayLabels,
  firstAvailableSlot,
  getCountryHour,
  timeSlotsForCountry,
} from "@workspace/delivery";

type Props = {
  countryCode?: string | null;
  initialDate?: string | null;
  initialSlotLabel?: string | null;
  onChange: (args: {
    mode: "today_slot" | "schedule";
    date: string;
    slotLabel: string;
  }) => void;
};

// Inline date + time-slot picker that appears right below the
// "Select date and time of delivery" row on the product page. Mirrors
// the mobile RescheduleDeliverySheet (which renders the bounded
// `dayLabels(...)` window as a horizontally-scrollable pill row) so
// shoppers can never pick an out-of-range date. No native calendar
// fallback — the bounded day list is the only path, matching mobile.
export function ScheduleInlinePanel({
  countryCode,
  initialDate,
  initialSlotLabel,
  onChange,
}: Props) {
  const code = (countryCode ?? "LB").toUpperCase();
  const days = useMemo(() => dayLabels("Today", "Tomorrow"), []);
  const timeSlots = useMemo(() => timeSlotsForCountry(code), [code]);
  const localHour = useMemo(() => getCountryHour(code), [code]);
  const todayIso = days[0]?.iso ?? new Date().toISOString().slice(0, 10);
  const lastAllowedIso = days[days.length - 1]?.iso ?? todayIso;

  const seedDate =
    initialDate &&
    initialDate >= todayIso &&
    initialDate <= lastAllowedIso
      ? initialDate
      : todayIso;
  const [date, setDateState] = useState<string>(seedDate);
  // Clamp any caller / state-restore attempt to land outside the bounded
  // window. Mirrors the mobile sheet which can never produce an
  // out-of-range value because it only renders the bounded day list.
  const setDate = (next: string) => {
    if (next < todayIso || next > lastAllowedIso) return;
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

  // Keep the slot valid when the date changes (e.g. switching from today
  // to a future day, or vice-versa, where some slots may have lapsed).
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

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5"
      data-testid="schedule-inline-panel"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          Delivery Date
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {days.map((d) => {
            const active = d.iso === date;
            return (
              <button
                key={d.iso}
                type="button"
                onClick={() => setDate(d.iso)}
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


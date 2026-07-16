import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import {
  dayLabels,
  firstAvailableSlot,
  formatSlotTimeRangeShort,
  getCountryHour,
  getLocalIso,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { CalendarPopover } from "./CalendarPopover";

type Props = {
  countryCode?: string | null;
  initialDate?: string | null;
  initialSlotLabel?: string | null;
  /** OS-sourced slots for the selected city (flat fallback). When provided, overrides the hardcoded per-country defaults. */
  timeSlots?: TimeSlot[];
  /**
   * Per-day-of-week slots from OS. Keys are lowercase English weekday names (e.g. "monday").
   * When present, only the slots for the selected date's day of week are shown.
   * Falls back to the flat `timeSlots` when the day key is absent or this prop is omitted.
   */
  slotsByDay?: Record<string, TimeSlot[]>;
  /**
   * When true the standard district delivery fee is waived for this order (cart
   * total meets the free-delivery threshold and freeDeliveryEnabled is on). Used
   * to determine whether zero-extraFee slots are labelled "Free" or remain silent.
   * Defaults to false so the label is conservative when data hasn't loaded yet.
   */
  freeDeliveryMet?: boolean;
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
  slotsByDay: propSlotsByDay,
  freeDeliveryMet = false,
  onChange,
}: Props) {
  const { t } = useLocale();
  const { formatPrice } = useDisplayCurrency();
  const code = (countryCode ?? "LB").toUpperCase();
  // Pass the country code so dayLabels() uses the local timezone (not UTC)
  // when computing which calendar day is "today".
  const allDays = useMemo(() => dayLabels("Today", "Tomorrow", new Date(), code).slice(0, 3), [code]);
  /** Flat fallback slot list (all days merged, or hardcoded per-country), sorted by window start. */
  const flatTimeSlots = useMemo(() => {
    const raw = propTimeSlots?.length ? propTimeSlots : timeSlotsForCountry(code);
    return [...raw].sort(
      (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
    );
  }, [propTimeSlots, code]);
  const localHour = useMemo(() => getCountryHour(code), [code]);
  // allDays[0].iso is already the country-local date (dayLabels uses getLocalIso
  // internally); fall back to getLocalIso directly so the two are always in sync.
  const todayIso = allDays[0]?.iso ?? getLocalIso(code);

  // Slots to use when checking whether today still has any open windows.
  // Prefers the per-day-of-week OS override when available, otherwise falls
  // back to the flat list — the same resolution logic used for the time picker.
  const todaySlotsForCheck = useMemo<TimeSlot[]>(() => {
    if (propSlotsByDay) {
      const weekday = new Date(`${todayIso}T00:00:00`)
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase();
      const daySlots = propSlotsByDay[weekday];
      if (daySlots && daySlots.length > 0)
        return [...daySlots].sort(
          (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
        );
    }
    return flatTimeSlots;
  }, [propSlotsByDay, todayIso, flatTimeSlots]);

  // Hide "Today" from the date chip strip when every slot has passed its cutoff.
  const todayHasSlots = useMemo(
    () => firstAvailableSlot(todaySlotsForCheck, true, localHour) !== null,
    [todaySlotsForCheck, localHour],
  );

  // Only show Today when it still has bookable slots; otherwise start from Tomorrow.
  const days = useMemo(
    () => allDays.filter((d) => d.iso !== todayIso || todayHasSlots),
    [allDays, todayIso, todayHasSlots],
  );

  const tomorrowIso =
    allDays[1]?.iso ??
    (() => {
      const d = new Date(`${todayIso}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

  const defaultDate = todayHasSlots ? todayIso : tomorrowIso;
  const seedDate =
    initialDate && initialDate >= todayIso ? initialDate : defaultDate;
  const [date, setDateState] = useState<string>(seedDate);

  // No upper-bound clamp — shoppers can pick any future date via the calendar.
  const setDate = (next: string) => {
    if (next < todayIso) return;
    setDateState(next);
  };

  /**
   * Active slot list for the currently selected date.
   * When OS provides per-day slots, use the day-of-week subset;
   * fall back to the flat list otherwise.
   */
  const timeSlots = useMemo<TimeSlot[]>(() => {
    const byStart = (arr: TimeSlot[]) =>
      [...arr].sort(
        (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
      );
    if (propSlotsByDay) {
      const weekday = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const daySlots = propSlotsByDay[weekday];
      if (daySlots && daySlots.length > 0) return byStart(daySlots as TimeSlot[]);
    }
    return byStart(flatTimeSlots);
  }, [propSlotsByDay, date, flatTimeSlots]);

  const [slotLabel, setSlotLabel] = useState<string | null>(() => {
    // Use flatTimeSlots for seed-time lookup since `date` may not be set yet.
    if (initialSlotLabel && initialDate && initialDate >= todayIso) {
      const known = flatTimeSlots.find((s) => s.label === initialSlotLabel);
      const isToday = seedDate === todayIso;
      if (known && (!isToday || localHour < known.cutoffHour))
        return initialSlotLabel;
    }
    const isToday = seedDate === todayIso;
    return firstAvailableSlot(flatTimeSlots, isToday, localHour)?.label ?? null;
  });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Track whether the viewport is narrower than the sm breakpoint (640 px).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const closeCalendar = useCallback(() => setCalendarOpen(false), []);

  // Close the calendar popover when clicking outside of it (desktop only —
  // on mobile the backdrop onClick handles dismissal).
  useEffect(() => {
    if (!calendarOpen || isMobile) return;
    const handler = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen, isMobile]);

  // Dismiss the calendar with the Escape key in both mobile and desktop modes.
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
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

  // Build a unified, chronologically-sorted chip list. When the selected date
  // was picked from the calendar and falls outside the 3-day strip we insert a
  // synthetic entry at the correct sorted position rather than appending it at
  // the end.
  const visibleChips = useMemo(() => {
    const chips = [...days];
    if (!dateInStrip) {
      // Build a synthetic entry that matches the DeliveryDay shape so the
      // sorted array is fully typed.
      const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
      const dt = new Date(y, mo - 1, d, 12, 0, 0);
      chips.push({
        iso: date,
        label: weekdayShort(date),
        day: dt.toLocaleDateString(undefined, { weekday: "short" }),
        date: String(dt.getDate()),
        full: dt.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        }),
      });
    }
    chips.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    return chips;
  }, [days, dateInStrip, date]);

  // Build the confirmation line: shown once both date and slot are selected.
  const confirmationLine = useMemo(() => {
    if (!slotLabel) return null;
    const dayEntry = days.find((d) => d.iso === date);
    const dayLabel = dayEntry ? dayEntry.label : weekdayShort(date);
    const dateStr = `${dayOfMonth(date)} ${monthShort(date)}`;
    const slot = timeSlots.find((s) => s.label === slotLabel);
    const slotRange = slot ? formatSlotTimeRangeShort(slot) : slotLabel;
    return t("product.deliveryConfirmation")
      .replace("{date}", `${dayLabel}, ${dateStr}`)
      .replace("{slot}", slotRange);
  }, [slotLabel, date, days, timeSlots, t]);

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5"
      data-testid="schedule-inline-panel"
    >
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          {t("checkout.deliveryDate")}
        </p>
        <div className="flex gap-2 items-start -mx-1 px-1">
          {/* Scrollable chip strip — overflow is contained here so it never clips the popover */}
          <div className="flex gap-2 overflow-x-auto pb-1 items-start flex-1 min-w-0">
            {visibleChips.map((d) => {
              const active = d.iso === date;
              const isStripDay = days.some((s) => s.iso === d.iso);
              return (
                <button
                  key={d.iso}
                  type="button"
                  aria-pressed={active}
                  onClick={
                    isStripDay
                      ? () => {
                          setDate(d.iso);
                          setCalendarOpen(false);
                        }
                      : undefined
                  }
                  className={cn(
                    "shrink-0 rounded-xl border px-4 py-2 text-center transition-colors relative",
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

          {/* Calendar icon chip — sits outside the overflow-x-auto strip so its
              popover can extend freely without being clipped */}
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
              aria-label={t("product.calendarAria")}
              data-testid="schedule-calendar-toggle"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="block text-[10px] leading-tight">{t("product.otherDate")}</span>
            </button>

            {/* Desktop: absolute popover anchored to the button */}
            {calendarOpen && !isMobile && (
              <div className="absolute z-50 top-full right-0 mt-2">
                <CalendarPopover
                  selectedIso={date}
                  todayIso={todayIso}
                  onSelect={(iso) => {
                    setDate(iso);
                    closeCalendar();
                  }}
                />
              </div>
            )}
          </div>

          {/* Mobile: full-screen dimmed backdrop with the calendar centred */}
          {calendarOpen && isMobile && (
            <div
              className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
              onClick={closeCalendar}
              onKeyDown={(e) => { if (e.key === "Escape") closeCalendar(); }}
              role="dialog"
              aria-modal="true"
              tabIndex={-1}
              data-testid="calendar-modal-backdrop"
            >
              {/* Stop clicks on the calendar itself from bubbling to the backdrop */}
              <div onClick={(e) => e.stopPropagation()}>
                <CalendarPopover
                  selectedIso={date}
                  todayIso={todayIso}
                  onSelect={(iso) => {
                    setDate(iso);
                    closeCalendar();
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
          {t("checkout.deliveryTime")}
        </p>
        <div className="flex flex-wrap gap-2">
          {timeSlots.map((s) => {
            const isToday = date === todayIso;
            const past = isToday && localHour >= s.cutoffHour;
            const active = slotLabel === s.label;
            const rangeLabel = formatSlotTimeRangeShort(s);
            const hasExtraFee = typeof s.extraFee === "number" && s.extraFee > 0;
            // "Free" label: only shown when this slot has no extra surcharge AND the
            // district delivery fee is also waived (cart meets the free-delivery threshold).
            // "+fee" label: always shown when extraFee > 0 regardless of threshold.
            const feeLabel = hasExtraFee
              ? t("product.deliveryExtraFee").replace("{fee}", formatPrice(s.extraFee!))
              : freeDeliveryMet
                ? t("product.deliveryFree")
                : null;
            return (
              <button
                key={s.label}
                type="button"
                disabled={past}
                aria-pressed={active}
                onClick={() => setSlotLabel(s.label)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-center transition-colors min-w-[88px] relative",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : past
                      ? "bg-secondary text-muted-foreground border-border line-through opacity-60 cursor-not-allowed"
                      : "bg-background text-foreground border-border hover:border-foreground/30",
                )}
                data-testid={`schedule-slot-${s.cutoffHour}`}
              >
                <span className="block text-xs font-medium leading-tight">{rangeLabel}</span>
                {feeLabel && (
                  <span className={cn(
                    "block text-[10px] leading-tight mt-0.5",
                    active ? "opacity-80" : "text-muted-foreground",
                  )}>
                    {feeLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation line — shown once both a date and a time slot are selected */}
      {confirmationLine && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3 leading-snug">
          {confirmationLine}
        </p>
      )}
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

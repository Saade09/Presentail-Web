import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { buildFeeNode } from "@/lib/feeNode";
import {
  dayLabels,
  firstAvailableSlot,
  formatSlotTimeRangeShort,
  getCountryHour,
  getLocalIso,
  isMidnightSlot,
  type TimeSlot,
} from "@workspace/delivery";
import { CalendarPopover } from "./CalendarPopover";
import { displayedSlotsForDate } from "@/components/delivery/displayedSlots";
import { citySlotsForDate } from "@/components/delivery/citySlotsForDate";
import { buildMidnightDeliveryMessage } from "@/components/delivery/midnightCopy";

import { trackWebEventOnce } from "@/lib/analytics";

type Props = {
  countryCode?: string | null;
  cityId?: string | null;
  initialDate?: string | null;
  initialSlotLabel?: string | null;
  initialSlotId?: string | null;
  /** OS-sourced slots for the selected city. An empty list means no schedule is configured. */
  timeSlots?: TimeSlot[];
  /**
   * Per-day-of-week slots from OS. Keys are lowercase English weekday names (e.g. "monday").
   * When present, only the slots for the selected date's day of week are shown.
   * Falls back to the flat `timeSlots` only when this prop is omitted.
   */
  slotsByDay?: Record<string, TimeSlot[]>;
  onChange: (args: {
    mode: "today_slot" | "schedule";
    date: string;
    slotLabel: string;
    /** OS-assigned stable slot ID, when available. */
    slotId?: string;
    serviceType?: "midnight";
    cityId?: string;
  }) => void;
  /**
   * Fired when the user explicitly clicks a date chip or time-slot chip.
   * NOT fired for the automatic initial selection on mount.
   * Used by ProductDetail to track whether the shopper has explicitly
   * confirmed a delivery window before allowing Add to Cart.
   */
  onUserInteracted?: () => void;
};

// Inline date + time-slot picker that appears right below the
// "Scheduled delivery" row on the product page. Shows a
// pill row of the next 3 days plus a calendar icon chip that
// opens a full month-view popover so shoppers can pick any future date.
export function ScheduleInlinePanel({
  countryCode,
  cityId,
  initialDate,
  initialSlotLabel,
  initialSlotId,
  timeSlots: propTimeSlots,
  slotsByDay: propSlotsByDay,
  onChange,
  onUserInteracted,
}: Props) {
  const { t } = useLocale();
  const { formatPrice } = useDisplayCurrency();
  const code = (countryCode ?? "LB").toUpperCase();
  // Pass the country code so dayLabels() uses the local timezone (not UTC)
  // when computing which calendar day is "today".
  const allDays = useMemo(() => dayLabels("Today", "Tomorrow", new Date(), code).slice(0, 3), [code]);
  /** Flat OS slot list (all days merged), sorted by window start. */
  const flatTimeSlots = useMemo(() => {
    const raw = propTimeSlots ?? [];
    return [...raw].sort(
      (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
    );
  }, [propTimeSlots]);
  const localHour = useMemo(() => getCountryHour(code), [code]);
  // allDays[0].iso is already the country-local date (dayLabels uses getLocalIso
  // internally); fall back to getLocalIso directly so the two are always in sync.
  const todayIso = allDays[0]?.iso ?? getLocalIso(code);

  // Slots to use when checking whether today still has any open windows.
  // Prefers the per-day-of-week OS override when available, otherwise falls
  // back to the flat list — the same resolution logic used for the time picker.
  const todaySlotsForCheck = useMemo<TimeSlot[]>(() => {
    return citySlotsForDate(flatTimeSlots, propSlotsByDay, todayIso);
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
  // When the parent passes today as the initial date but today no longer has
  // bookable slots, ignore it and fall through to defaultDate (tomorrow).
  const seedDate =
    initialDate && initialDate >= todayIso && (initialDate !== todayIso || todayHasSlots)
      ? initialDate
      : defaultDate;
  const [date, setDateState] = useState<string>(seedDate);

  // No upper-bound clamp — shoppers can pick any future date via the calendar.
  const setDate = (next: string) => {
    if (next < todayIso) return;
    setDateState(next);
  };

  /**
   * Active slot list for the currently selected date.
   * When OS provides per-day slots, use the day-of-week subset;
   * use the flat list only for legacy payloads without `slotsByDay`.
   */
  const timeSlots = useMemo<TimeSlot[]>(() => {
    return citySlotsForDate(flatTimeSlots, propSlotsByDay, date);
  }, [propSlotsByDay, date, flatTimeSlots]);

  const seedTimeSlots = useMemo(
    () => citySlotsForDate(flatTimeSlots, propSlotsByDay, seedDate),
    [flatTimeSlots, propSlotsByDay, seedDate],
  );

  const [slotLabel, setSlotLabel] = useState<string | null>(() => {
    if (initialSlotLabel && initialDate && initialDate >= todayIso) {
      const known =
        (initialSlotId ? seedTimeSlots.find((s) => s.slotId === initialSlotId) : undefined) ??
        seedTimeSlots.find((s) => s.label === initialSlotLabel);
      const isToday = seedDate === todayIso;
      if (known && (!isToday || localHour < known.cutoffHour))
        return known.label;
    }
    const isToday = seedDate === todayIso;
    return firstAvailableSlot(seedTimeSlots, isToday, localHour)?.label ?? null;
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

  /**
   * Date-filtered, deduplicated view of the slot list.
   *
   * Step 1 — date filter:
   *   - Today     → sameDayEnabled !== false  (undefined counts as eligible)
   *   - Tomorrow  → nextDayEnabled !== false
   *   - Later     → all slots
   *   When no slot carries the relevant field at all (legacy OS data without
   *   same-day/next-day flags) the filter is skipped and all slots proceed to
   *   step 2 — deduplication still runs regardless.
   *
   * Step 2 — label deduplication (always):
   *   When multiple slots share the same label (e.g. two "9 PM–11 PM" entries),
   *   keep the one best suited for the current date:
   *   - Today:        prefer sameDayEnabled=true, then higher extraFee
   *   - Other dates:  prefer nextDayEnabled=true, then lower/absent extraFee
   */
  const displayedSlots = useMemo<TimeSlot[]>(
    () => displayedSlotsForDate(timeSlots, date, todayIso, tomorrowIso, cityId),
    [timeSlots, date, todayIso, tomorrowIso, cityId],
  );

  // Track midnight option viewed (once per session/render combination).
  const midnightViewedRef = useRef(false);
  const midnightIneligibleRef = useRef<string | null>(null);
  useEffect(() => {
    const midnightSlot = displayedSlots.find(s => isMidnightSlot(s, cityId));
    if (midnightSlot && !midnightViewedRef.current) {
      midnightViewedRef.current = true;
      trackWebEventOnce({
        type: "midnight_option_viewed",
        properties: {
          city_id: cityId ?? "unknown",
          date,
          slot_id: midnightSlot.slotId ?? undefined
        }
      }, `${cityId ?? "unknown"}|${date}|${midnightSlot.slotId ?? ""}`);
    } else if (!midnightSlot) {
      midnightViewedRef.current = false;
      const key = cityId ? `${cityId}|${date}` : null;
      if (key && midnightIneligibleRef.current !== key) {
        midnightIneligibleRef.current = key;
        trackWebEventOnce({
          type: "midnight_option_ineligible",
          properties: { city_id: cityId, occasion_date: date },
        }, key);
      }
    }
  }, [displayedSlots, cityId, date]);

  // Push the parent every time the local selection changes — there's no
  // confirm button here, the inline picker is "live". The selected slot is
  // resolved against the date-filtered/deduplicated displayedSlots so that
  // duplicate-label configurations emit the slotId of the variant actually
  // shown for the selected date (e.g. next-day free vs same-day paid).
  const lastEmittedRef = useRef<string>("");
  useEffect(() => {
    if (!slotLabel) return;
    const mode: "today_slot" | "schedule" =
      date === todayIso ? "today_slot" : "schedule";
    const selectedSlot = displayedSlots.find((s) => s.label === slotLabel);
    const slotId = selectedSlot?.slotId;
    const key = `${mode}|${date}|${slotLabel}|${slotId ?? ""}`;
    if (key === lastEmittedRef.current) return;
    lastEmittedRef.current = key;
    onChange({
      mode,
      date,
      slotLabel,
      slotId,
      serviceType: selectedSlot && isMidnightSlot(selectedSlot, cityId) ? "midnight" : undefined,
      cityId: cityId ?? undefined,
    });
  }, [date, slotLabel, todayIso, onChange, displayedSlots]);

  // Keep the slot valid when the date or available slot list changes (e.g.
  // switching from today to a future day, or the city's OS slots updating).
  useEffect(() => {
    const isToday = date === todayIso;
    if (!slotLabel) {
      const initial = firstAvailableSlot(displayedSlots, isToday, localHour);
      if (initial) setSlotLabel(initial.label);
      return;
    }
    const found = displayedSlots.find((s) => s.label === slotLabel);
    if (!found || (isToday && localHour >= found.cutoffHour)) {
      const initial = firstAvailableSlot(displayedSlots, isToday, localHour);
      setSlotLabel(initial?.label ?? null);
    }
  }, [date, todayIso, displayedSlots, localHour, slotLabel]);

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

  const selectedMidnightSlot = useMemo(() => {
    if (!slotLabel) return null;
    const selected = displayedSlots.find((s) => s.label === slotLabel);
    if (!selected) return null;
    return isMidnightSlot(selected, cityId) ? selected : null;
  }, [displayedSlots, slotLabel, cityId]);

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
                          onUserInteracted?.();
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
          {displayedSlots.map((s) => {
            const isToday = date === todayIso;
            const past = isToday && localHour >= s.cutoffHour;
            const active = slotLabel === s.label;
            const isMidnight = isMidnightSlot(s, cityId);
            const rangeLabel = formatSlotTimeRangeShort(s);
            // Only show a fee label when there is a real surcharge (extraFee > 0).
            // "Free" is intentionally suppressed — it clutters the slot chips and is
            // already implicit when no fee amount is shown.
            // Hide the fee label inside the pill if it's the active Midnight slot,
            // since the fee is shown in the banner below instead.
            const showPillFee = !(isMidnight && active);
            const feeLabel =
              showPillFee && s.extraFee !== undefined && s.extraFee !== null && s.extraFee > 0
                ? buildFeeNode(t("product.deliveryExtraFee"), { fee: s.extraFee })
                : null;
            return (
              <button
                key={s.slotId ?? s.label}
                type="button"
                disabled={past}
                aria-pressed={active}
                onClick={() => {
                  setSlotLabel(s.label);
                  onUserInteracted?.();
                  if (isMidnight) {
                    trackWebEventOnce({
                      type: "midnight_option_selected",
                      properties: {
                        city_id: cityId ?? "unknown",
                        date,
                        slot_id: s.slotId ?? undefined
                      }
                    }, `${cityId ?? "unknown"}|${date}|${s.slotId ?? ""}`);
                  }
                }}
                className={cn(
                  "rounded-xl border px-3 py-2 text-center transition-colors min-w-[88px] relative",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : past
                      ? "bg-secondary text-muted-foreground border-border line-through opacity-60 cursor-not-allowed"
                      : "bg-background text-foreground border-border hover:border-foreground/30",
                )}
                data-testid={
                  s.slotId
                    ? `schedule-slot-${s.slotId}`
                    : `schedule-slot-${s.cutoffHour}`
                }
              >
                <span className="flex items-center justify-center gap-1.5 text-xs font-medium leading-tight">
                  {isMidnight && <Moon className="w-3.5 h-3.5" />}
                  {rangeLabel}
                </span>
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

      {selectedMidnightSlot && (() => {
        const midnightMessage = buildMidnightDeliveryMessage(t, date, todayIso);

        return (
          <div className="rounded-xl bg-[#FFF8EE] text-[#1A1A1A] p-3 flex items-center justify-between mt-2" data-testid="midnight-delivery-banner">
            <div className="flex gap-2.5 items-start">
              <Moon className="w-4 h-4 mt-0.5 opacity-80" />
              <div>
                <p className="text-sm font-semibold leading-tight">{t("product.midnightDelivery")}</p>
                <p className="text-xs opacity-70 mt-0.5 leading-tight">
                  {midnightMessage}
                </p>
              </div>
            </div>
            <div className="text-sm font-semibold whitespace-nowrap pl-3">
              +{formatPrice(selectedMidnightSlot.extraFee ?? 20)}
            </div>
          </div>
        );
      })()}

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

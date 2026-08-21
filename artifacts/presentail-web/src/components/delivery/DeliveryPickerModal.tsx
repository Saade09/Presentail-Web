import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Zap, CalendarDays, Check, ChevronLeft, ChevronRight, ArrowRight, Moon } from "lucide-react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { ReactNode } from "react";
import { useNow } from "@/lib/useNow";
import { trackEvent } from "@/lib/analytics";
import { FormattedPrice } from "@/components/FormattedPrice";
import {
  dayLabels,
  expressDeadlineFrom,
  expressSurchargeForCountry,
  firstAvailableSlot,
  fmt12h,
  getCountryHour,
  getLocalIso,
  isExpressDeliveryAvailable,
  isMidnightSlot,
  nearestSlotForHour,
  type TimeSlot,
} from "@workspace/delivery";
import { displayedSlotsForDate } from "./displayedSlots";
import { trackWebEvent, trackWebEventOnce } from "@/lib/analytics";
import { buildExpressPromise, buildStandardPromise } from "./deliveryPromise";
import { DeliverEarlierDialog } from "./DeliverEarlierDialog";
import { buildMidnightDeliveryMessage } from "./midnightCopy";

/** Sort slots chronologically by delivery-window start (falling back to cutoff). */
function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort(
    (a, b) => (a.startHour ?? a.cutoffHour) - (b.startHour ?? b.cutoffHour),
  );
}

/** ISO date `n` days after `iso`, computed from local parts (never UTC-shifted). */
function addDaysIso(iso: string, n: number): string {
  const [ty, tm, td] = iso.split("-").map(Number) as [number, number, number];
  const d = new Date(ty, tm - 1, td + n, 12, 0, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type DeliveryPickerSelection = {
  mode: "express" | "today_slot" | "schedule";
  date: string;
  slotLabel: string | null;
  /** OS-assigned stable ID of the selected slot configuration (disambiguates duplicate labels). */
  slotId: string | null;
  serviceType: "midnight" | null;
  cityId: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called synchronously with the confirmed selection before the modal closes. */
  onConfirm?: (selection: DeliveryPickerSelection) => void;
  /** OS-sourced slots for the selected city. An empty list means OS has no schedule to offer. */
  timeSlots?: TimeSlot[];
  /**
   * Whether the OS has enabled express delivery for this specific city.
   * Defaults to true when omitted (backwards-compatible) so callers that
   * don't have city data yet don't accidentally hide express globally.
   * Pass `city?.expressAvailable === true` from the parent to honour the
   * per-city OS flag — the modal ANDs this with the time-window check.
   */
  cityExpressAvailable?: boolean;
  /**
   * OS-derived express surcharge in USD. When provided and > 0, overrides
   * the hardcoded `expressSurchargeForCountry` fallback shown in the modal.
   */
  expressSurchargeUsd?: number;
  /**
   * When set, the modal opens with this mode preselected instead of the
   * persisted selection (e.g. the cart's express upsell opens with express
   * highlighted). Still subject to express availability.
   */
  initialModeOverride?: "express" | "schedule";
}

function dayMonthShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function weekdayDayMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** Parse "9:00 AM" / "2 PM" style strings → hour (0–23). Null on failure. */
function parse12h(s: string): number | null {
  const m = /^(\d+)(?::\d+)?\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let h = parseInt(m[1]!, 10);
  if (m[2]!.toUpperCase() === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return h;
}

/** Best-effort start hour for a slot: explicit startHour, else parsed from a "9:00 AM – 2:00 PM" label, else cutoffHour. */
function slotStartHour(s: TimeSlot): number {
  if (s.startHour !== undefined) return s.startHour;
  const first = s.label.split("–")[0];
  const parsed = first !== undefined ? parse12h(first) : null;
  return parsed ?? s.cutoffHour ?? 0;
}

/** Semantically-correct time-of-day i18n key based on the slot's start hour. */
function periodKeyForStartHour(h: number): string {
  if (h >= 21 || h < 5) return "delivery.slot.lateNight";
  if (h < 12) return "delivery.slot.morning";
  if (h < 17) return "delivery.slot.afternoon";
  return "delivery.slot.evening";
}

/** Primary time-range text for a slot card, e.g. "9:00 AM – 2:00 PM". */
function slotTimeText(s: TimeSlot): string {
  if (s.startHour !== undefined && s.endHour !== undefined) {
    return `${fmt12h(s.startHour)} – ${fmt12h(s.endHour)}`;
  }
  return s.label;
}

/** Radio-style selection indicator (non-color-only selected state). */
function RadioDot({ selected, disabled = false }: { selected: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : disabled
            ? "border-border bg-muted"
            : "border-border bg-card"
      }`}
    >
      {selected && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold text-foreground">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Inline calendar
// ---------------------------------------------------------------------------

type CalendarProps = {
  /** Currently selected ISO date (or "" for none). */
  selectedIso: string;
  todayIso: string;
  /** True when today still has bookable slots (today is selectable). */
  todaySelectable: boolean;
  onSelect: (iso: string) => void;
  prevLabel: string;
  nextLabel: string;
};

function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function InlineCalendar({ selectedIso, todayIso, todaySelectable, onSelect, prevLabel, nextLabel }: CalendarProps) {
  const anchorIso = selectedIso || todayIso;
  const [ay, am] = anchorIso.split("-").map(Number) as [number, number, number];
  const [viewYear, setViewYear] = useState(ay);
  const [viewMonth, setViewMonth] = useState(am - 1); // 0-based

  const [ty, tm] = todayIso.split("-").map(Number) as [number, number, number];
  const atCurrentMonth = viewYear === ty && viewMonth === tm - 1;

  const monthTitle = new Date(viewYear, viewMonth, 1, 12).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Monday-first weekday headers, derived from a known Monday so they localize.
  const weekdayHeaders = useMemo(() => {
    const headers: string[] = [];
    for (let i = 0; i < 7; i++) {
      // 2024-01-01 was a Monday.
      headers.push(new Date(2024, 0, 1 + i, 12).toLocaleDateString(undefined, { weekday: "short" }));
    }
    return headers;
  }, []);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // getDay(): 0=Sun … 6=Sat → Monday-first offset.
  const firstWeekday = (new Date(viewYear, viewMonth, 1, 12).getDay() + 6) % 7;

  const goPrev = () => {
    if (atCurrentMonth) return;
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3" data-testid="inline-calendar">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={goPrev}
          disabled={atCurrentMonth}
          aria-label={prevLabel}
          className="rounded-full p-1.5 text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="calendar-prev-month"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <p className="text-sm font-semibold" data-testid="calendar-month-title">{monthTitle}</p>
        <button
          type="button"
          onClick={goNext}
          aria-label={nextLabel}
          className="rounded-full p-1.5 text-foreground transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="calendar-next-month"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekdayHeaders.map((w) => (
          <span key={w} className="py-1 text-[11px] font-medium text-muted-foreground">{w}</span>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const iso = isoFromParts(viewYear, viewMonth, day);
          const isPast = iso < todayIso;
          const isToday = iso === todayIso;
          const disabled = isPast || (isToday && !todaySelectable);
          const isSelected = iso === selectedIso;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => !disabled && onSelect(iso)}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isSelected
                  ? "bg-primary font-semibold text-primary-foreground"
                  : disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : isToday
                      ? "font-semibold text-foreground ring-1 ring-inset ring-primary/50 hover:bg-secondary/60"
                      : "text-foreground hover:bg-secondary/60"
              }`}
              data-testid={`calendar-day-${iso}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function DeliveryPickerModal({ open, onOpenChange, onConfirm, timeSlots: propTimeSlots, cityExpressAvailable = true, expressSurchargeUsd, initialModeOverride }: Props) {
  const { t, language } = useLocale();
  const { countryCode, city } = useLocationSelection();
  const now = useNow();
  const deliverySelection = useDeliverySelection();

  // Raw (unfiltered) slot list — per-date filtering/dedup happens below via
  // displayedSlotsForDate so same-day/next-day OS flags and duplicate-label
  // configurations are honoured exactly like the product page's inline panel.
  const rawTimeSlots = useMemo(() => propTimeSlots ?? [], [propTimeSlots]);
  const quickDays = useMemo(
    () => dayLabels(t("checkout.day.today"), t("checkout.day.tomorrow"), now, countryCode).slice(0, 3),
    [t, now, countryCode],
  );
  const expressAvailable = useMemo(
    () => cityExpressAvailable && isExpressDeliveryAvailable(countryCode, now),
    [cityExpressAvailable, countryCode, now],
  );
  const expressSurcharge =
    expressSurchargeUsd && expressSurchargeUsd > 0
      ? expressSurchargeUsd
      : expressSurchargeForCountry(countryCode);
  const currentHour = useMemo(() => getCountryHour(countryCode, now), [countryCode, now]);
  // Use the country-aware local date instead of UTC so that midnight-to-~3 AM
  // UTC calls (= early Beirut morning) correctly show today's local date.
  const todayIso = useMemo(() => getLocalIso(countryCode, now), [countryCode, now]);

  const tomorrowIso = useMemo(() => addDaysIso(todayIso, 1), [todayIso]);

  // Date-aware slot list for a given ISO date — same filtering/dedup semantics
  // as the product page's ScheduleInlinePanel (sameDayEnabled/nextDayEnabled
  // flags, duplicate-label preference, $5 same-day night fallback).
  const slotsForDate = useCallback(
    (dateIso: string) => {
      const weekday = new Date(`${dateIso}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
      }).toLowerCase();
      const source =
        city?.slotsByDay && Object.prototype.hasOwnProperty.call(city.slotsByDay, weekday)
          ? city.slotsByDay[weekday] ?? []
          : rawTimeSlots;
      return sortSlots(displayedSlotsForDate(source, dateIso, todayIso, tomorrowIso, city?.id));
    },
    [rawTimeSlots, todayIso, tomorrowIso, city?.id, city?.slotsByDay],
  );

  const todaySlots = useMemo(() => slotsForDate(todayIso), [slotsForDate, todayIso]);
  const todayHasSlots = useMemo(
    () => firstAvailableSlot(todaySlots, true, currentHour) !== null,
    [todaySlots, currentHour],
  );

  /** Default slot label for a date: nearest upcoming today, else the first slot. */
  const defaultSlotForDate = useCallback(
    (dateIso: string) => {
      const daySlots = slotsForDate(dateIso);
      const isToday = dateIso === todayIso;
      return (
        (isToday
          ? nearestSlotForHour(daySlots, true, currentHour)
          : firstAvailableSlot(daySlots, false, currentHour)
        )?.label ?? ""
      );
    },
    [slotsForDate, todayIso, currentHour],
  );

  const initialMode: "express" | "schedule" =
    initialModeOverride === "express" && expressAvailable
      ? "express"
      : initialModeOverride === "schedule"
        ? "schedule"
        : deliverySelection.mode === "express" && expressAvailable
          ? "express"
          : "schedule";
  const initialDate =
    deliverySelection.mode !== "express" && deliverySelection.date
      ? deliverySelection.date
      : "";
  const initialSlot =
    deliverySelection.slotLabel ?? defaultSlotForDate(initialDate || todayIso);

  const [mode, setMode] = useState<"express" | "schedule">(initialMode);
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState(initialSlot);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const midnightViewedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      midnightViewedRef.current = false;
      return;
    }
    const activeIso = date || todayIso;
    const midnightSlot = slotsForDate(activeIso).find((s) => isMidnightSlot(s, city?.id));
    if (midnightSlot && !midnightViewedRef.current) {
      midnightViewedRef.current = true;
      trackWebEventOnce({
        type: "midnight_option_viewed",
        properties: {
          city_id: city?.id ?? "unknown",
          date: activeIso,
          slot_id: midnightSlot.slotId ?? undefined,
        },
      }, `${city?.id ?? "unknown"}|${activeIso}|${midnightSlot.slotId ?? ""}`);
    }
  }, [open, date, todayIso, slotsForDate, city?.id]);

  useEffect(() => {
    if (!open) return;
    setCalendarOpen(false);
    setMode(
      initialModeOverride === "express" && expressAvailable
        ? "express"
        : initialModeOverride === "schedule"
          ? "schedule"
          : deliverySelection.mode === "express" && expressAvailable
            ? "express"
            : "schedule",
    );
    let newDate =
      deliverySelection.mode !== "express" && deliverySelection.date
        ? deliverySelection.date
        : "";

    const dateIsEmptyOrToday = !newDate || newDate === todayIso;
    if (dateIsEmptyOrToday && !todayHasSlots) {
      // Today has no bookable slots — advance to the first future day that does,
      // using each candidate day's own date-filtered slot list.
      for (let i = 1; i <= 30; i++) {
        const iso = addDaysIso(todayIso, i);
        const first = firstAvailableSlot(slotsForDate(iso), false, currentHour);
        if (first) {
          setDate(iso);
          setSlot(first.label);
          return;
        }
      }
    }

    setDate(newDate);
    const dateIso = newDate || todayIso;
    const daySlots = slotsForDate(dateIso);
    // Keep the persisted slot only when it's valid for this date's slot list.
    const persisted = deliverySelection.slotLabel;
    const persistedById = deliverySelection.slotId
      ? daySlots.find((s) => s.slotId === deliverySelection.slotId)
      : undefined;
    setSlot(
      persistedById?.label ??
      (persisted && daySlots.some((s) => s.label === persisted)
        ? persisted
        : defaultSlotForDate(dateIso))
    );
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  /** Change date and reset the slot to the appropriate first-available. */
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setSlot(defaultSlotForDate(newDate || todayIso));
  };

  const selectedIso = date || todayIso;
  const isSelectedToday = selectedIso === todayIso;
  const isCustomDate = !quickDays.some((d) => d.iso === selectedIso);

  // Per-slot availability for the selected date (today filters by cutoff).
  // slotsForDate already applies same-day/next-day filtering, duplicate-label
  // preference, and the $5 same-day night surcharge fallback (as extraFee).
  const slotStates = useMemo(
    () =>
      slotsForDate(selectedIso).map((s) => {
        const unavailable = isSelectedToday && s.cutoffHour <= currentHour;
        const startH = slotStartHour(s);
        const displayFee = s.extraFee && s.extraFee > 0 ? s.extraFee : null;
        return { slot: s, unavailable, startH, displayFee };
      }),
    [slotsForDate, selectedIso, isSelectedToday, currentHour],
  );
  const hasAnyAvailableSlot = slotStates.some((s) => !s.unavailable);
  const selectedSlotState = slotStates.find((s) => s.slot.label === slot && !s.unavailable) ?? null;

  // Pending selection awaiting the "Deliver earlier?" confirmation. Set when a
  // newly picked option would move delivery to an *earlier* calendar date than
  // the committed selection; nothing is committed until the shopper confirms.
  const [pendingEarlier, setPendingEarlier] = useState<{
    selection: DeliveryPickerSelection;
    originalLine: string;
    newLine: string;
    totalChangeUsd: number;
  } | null>(null);

  /** Extra (above base district fee) charged for a committed/candidate selection. */
  const extraFeeFor = useCallback(
    (sel: { mode: string | null; date: string | null; slotLabel: string | null; slotId: string | null }): number => {
      if (sel.mode === "express") return expressSurcharge;
      if (!sel.date) return 0;
      const daySlots = slotsForDate(sel.date);
      const match =
        (sel.slotId ? daySlots.find((s) => s.slotId === sel.slotId) : undefined) ??
        (sel.slotLabel ? daySlots.find((s) => s.label === sel.slotLabel) : undefined);
      return match?.extraFee && match.extraFee > 0 ? match.extraFee : 0;
    },
    [expressSurcharge, slotsForDate],
  );

  const commitSelection = (selection: DeliveryPickerSelection) => {
    // Track delivery type changes (standard ↔ express) once per confirm.
    const prevType = deliverySelection.mode === "express" ? "express" : deliverySelection.mode ? "standard" : null;
    const nextType = selection.mode === "express" ? "express" : "standard";
    if (prevType !== nextType) {
      trackEvent({
        name: "delivery_method_selected",
        surface: "cart",
        deliveryMethod: nextType,
        deliverySource: "user",
      });
    }
    // Confirming in the picker is always an explicit shopper choice.
    deliverySelection.setSelection({ ...selection, source: "user_selected" });
    onConfirm?.(selection);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    // Use the already-memoized local-timezone today (getLocalIso(countryCode, now))
    // so that "today" comparisons and the express date payload are correct even
    // between midnight UTC and ~3 AM Beirut time.
    let selection: DeliveryPickerSelection;
    if (mode === "express") {
      selection = {
        mode: "express",
        date: todayIso,
        slotLabel: null,
        slotId: null,
        serviceType: null,
        cityId: null,
      };
    } else {
      const resolvedMode = date && date === todayIso ? "today_slot" : "schedule";
      selection = {
        mode: resolvedMode,
        date: date || todayIso,
        slotLabel: slot || null,
        // Persist the exact slot configuration the shopper saw (date-aware
        // dedup can pick different same-label variants per date) so fee
        // lookups downstream never resolve the wrong duplicate.
        slotId: selectedSlotState?.slot.slotId ?? null,
        serviceType:
          selectedSlotState && isMidnightSlot(selectedSlotState.slot, city?.id)
            ? "midnight"
            : null,
        cityId: city?.id ?? null,
      };
    }
    // "Deliver earlier?" gate: when a committed selection exists and the newly
    // picked option lands on an *earlier* calendar date (destination-local; an
    // Express ETA crossing midnight counts as tomorrow, not today), detour
    // through a confirmation instead of committing directly.
    const committedDate =
      deliverySelection.mode && deliverySelection.mode !== "express"
        ? deliverySelection.date
        : deliverySelection.mode === "express"
          ? todayIso
          : null;
    const newEffectiveDate =
      selection.mode === "express"
        ? getLocalIso(countryCode, expressDeadlineFrom(now))
        : selection.date;
    if (committedDate && newEffectiveDate < committedDate) {
      const originalLine =
        deliverySelection.mode === "express"
          ? buildExpressPromise({ quotedAt: now, countryCode: countryCode ?? null, locale: language, t }).arrival
          : buildStandardPromise({
              dateIso: deliverySelection.date ?? todayIso,
              slotLabel: deliverySelection.slotLabel ?? null,
              slots: slotsForDate(deliverySelection.date ?? todayIso),
              todayIso,
              locale: language,
              t,
            }).arrival;
      const newLine =
        selection.mode === "express"
          ? buildExpressPromise({ quotedAt: now, countryCode: countryCode ?? null, locale: language, t }).arrival
          : buildStandardPromise({
              dateIso: selection.date,
              slotLabel: selection.slotLabel,
              slots: slotsForDate(selection.date),
              todayIso,
              locale: language,
              t,
            }).arrival;
      // Base district fee is identical across options, so the exact Total
      // change is the difference of the extras (surcharge / slot fee) — the
      // same terms cartTotal itself is built from.
      const totalChangeUsd = extraFeeFor(selection) - extraFeeFor(deliverySelection);
      setPendingEarlier({ selection, originalLine, newLine, totalChangeUsd });
      trackWebEvent({
        type: "earlier_delivery_confirmation_shown",
        properties: {
          surface: "delivery_picker",
          delivery_selection_source: deliverySelection.source ?? null,
          original_date: committedDate,
          new_date: newEffectiveDate,
          same_calendar_date: false,
          total_change_usd: totalChangeUsd,
          market: countryCode ?? null,
        },
      });
      return;
    }
    commitSelection(selection);
  };

  const confirmDisabled = mode === "schedule" && (!hasAnyAvailableSlot || !selectedSlotState);

  // Secondary line inside the primary CTA: selected window (+ surcharge) or express ETA.
  const ctaDetail: ReactNode =
    mode === "express" ? (
      <>
        {t("checkout.expressDelivery.subtitle")}
        {expressSurcharge > 0 && <> · +<FormattedPrice usdValue={expressSurcharge} /></>}
      </>
    ) : selectedSlotState ? (
      <>
        {slotTimeText(selectedSlotState.slot)}
        {selectedSlotState.displayFee ? <> · +<FormattedPrice usdValue={selectedSlotState.displayFee} /></> : null}
      </>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-xl max-h-[90dvh] overflow-y-auto p-0">
        <div className="p-6 pb-0 sm:px-8 sm:pt-7">
          <DialogTitle className="text-2xl font-serif">
            {t("delivery.picker.title")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {t("delivery.picker.subtitle")}
          </DialogDescription>
        </div>

        <div className="space-y-6 p-6 pt-4 sm:space-y-8 sm:px-8 sm:pb-8 sm:pt-5">
          {/* ── 1. Delivery option ─────────────────────────────── */}
          <div className="space-y-3">
            <SectionHeading>1. {t("delivery.picker.step1")}</SectionHeading>
            <div
              role="radiogroup"
              aria-label={t("delivery.picker.step1")}
              className={`grid gap-3 sm:gap-4 ${expressAvailable ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
            >
              {expressAvailable && (
                <div className="relative">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "express"}
                    onClick={() => setMode("express")}
                    className={`flex h-full w-full items-start gap-3 rounded-xl border-2 px-4 py-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      mode === "express"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-foreground/20"
                    }`}
                    data-testid="option-express"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-primary" aria-hidden="true">
                      <Zap className="h-4 w-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-foreground">{t("checkout.expressDelivery")}</span>
                      <span className="block text-xs text-muted-foreground mt-1">{t("checkout.expressDelivery.subtitle")}</span>
                      <span className="block text-xs font-semibold text-primary mt-1">+<FormattedPrice usdValue={expressSurcharge} /></span>
                    </span>
                    <RadioDot selected={mode === "express"} />
                  </button>
                </div>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={mode === "schedule"}
                onClick={() => setMode("schedule")}
                className={`flex h-full w-full items-start gap-3 rounded-xl border-2 px-4 py-4 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  mode === "schedule"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-foreground/20"
                }`}
                data-testid="option-schedule"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-primary" aria-hidden="true">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-foreground">{t("checkout.scheduleDelivery")}</span>
                  <span className="block text-xs text-muted-foreground mt-1">{t("checkout.scheduleDeliveryDesc")}</span>
                </span>
                <RadioDot selected={mode === "schedule"} />
              </button>
            </div>
          </div>

          {mode === "schedule" && (
            <>
              {/* ── 2. Choose date ─────────────────────────────── */}
              <div className="space-y-3">
                <SectionHeading>2. {t("delivery.picker.step2")}</SectionHeading>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                  {quickDays.map((d) => {
                    const isDisabledToday = d.iso === todayIso && !todayHasSlots;
                    const isSelected = !isCustomDate && selectedIso === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        disabled={isDisabledToday}
                        aria-disabled={isDisabledToday}
                        aria-pressed={isSelected}
                        onClick={() => {
                          if (isDisabledToday) return;
                          setCalendarOpen(false);
                          handleDateChange(d.iso);
                        }}
                        className={`rounded-xl border-2 px-2.5 py-3 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:border-foreground/20"
                        } ${isDisabledToday ? "opacity-40 cursor-not-allowed" : ""}`}
                        data-testid={`quick-date-${d.iso}`}
                      >
                        <span className="block font-semibold">{d.label}</span>
                        <span className="block text-[10px] opacity-80 mt-0.5">{dayMonthShort(d.iso)}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    aria-pressed={isCustomDate}
                    aria-expanded={calendarOpen}
                    onClick={() => setCalendarOpen((prev) => !prev)}
                    className={`rounded-xl border-2 px-2.5 py-3 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isCustomDate
                        ? "border-primary bg-primary text-primary-foreground"
                        : calendarOpen
                          ? "border-primary border-dashed bg-card text-primary"
                          : "border-border border-dashed bg-card text-foreground hover:border-foreground/20"
                    }`}
                    data-testid="quick-date-other"
                  >
                    <span className="flex items-center justify-center gap-1 font-semibold leading-tight">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("delivery.picker.chooseAnotherDate")}
                    </span>
                    {isCustomDate && (
                      <span className="block text-[10px] opacity-80 mt-0.5">{dayMonthShort(selectedIso)}</span>
                    )}
                  </button>
                </div>

                {calendarOpen && (
                  <InlineCalendar
                    selectedIso={selectedIso}
                    todayIso={todayIso}
                    todaySelectable={todayHasSlots}
                    onSelect={(iso) => {
                      handleDateChange(iso);
                      // Immediate selection — no Apply button; auto-collapse to keep
                      // the popup compact. The chosen date stays visible on the
                      // "Choose another date" card (or the matching quick card).
                      setCalendarOpen(false);
                    }}
                    prevLabel={t("delivery.picker.prevMonth")}
                    nextLabel={t("delivery.picker.nextMonth")}
                  />
                )}
              </div>

              {/* ── 3. Choose time ─────────────────────────────── */}
              <div className="space-y-3">
                <SectionHeading>
                  3. {isCustomDate
                    ? <>{t("delivery.picker.step3For")} <span className="text-primary">{weekdayDayMonth(selectedIso)}</span></>
                    : t("delivery.picker.step3")}
                </SectionHeading>
                {hasAnyAvailableSlot ? (
                  <>
                    <div
                      role="radiogroup"
                      aria-label={t("delivery.picker.step3")}
                      className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2"
                    >
                    {slotStates.map(({ slot: s, unavailable, startH, displayFee }) => {
                      const isSelected = slot === s.label && !unavailable;
                      const isMidnight = isMidnightSlot(s, city?.id);
                      // Don't show the +$20 fee badge inside the pill if it is selected,
                      // because the large banner will show it.
                      const showBadge = displayFee && !(isMidnight && isSelected);
                      return (
                        <button
                          key={
                            s.slotId ??
                            `${s.label}-${s.startHour ?? "na"}-${s.endHour ?? "na"}-${s.cutoffHour}`
                          }
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          disabled={unavailable}
                          aria-disabled={unavailable}
                          onClick={() => {
                            if (!unavailable) {
                              setSlot(s.label);
                              if (isMidnight) {
                                trackWebEventOnce({
                                  type: "midnight_option_selected",
                                  properties: {
                                    city_id: city?.id ?? "unknown",
                                    date: selectedIso,
                                    slot_id: s.slotId ?? undefined
                                  }
                                }, `${city?.id ?? "unknown"}|${selectedIso}|${s.slotId ?? ""}`);
                              }
                            }
                          }}
                          className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : unavailable
                                ? "border-border bg-muted/40 cursor-not-allowed"
                                : "border-border bg-card hover:border-foreground/20"
                          }`}
                          data-testid={`slot-${s.label}`}
                        >
                          <span className="flex-1 min-w-0">
                            <span className={`flex items-center gap-1.5 font-semibold sm:whitespace-nowrap ${unavailable ? "text-muted-foreground" : "text-foreground"}`}>
                              {isMidnight && <Moon className="w-4 h-4 opacity-80" />}
                              {slotTimeText(s)}
                            </span>
                            <span className="block text-xs font-normal text-muted-foreground mt-1">
                              {t(periodKeyForStartHour(startH))}
                            </span>
                            {unavailable && (
                              <span className="block text-xs font-medium text-muted-foreground/80 mt-1">
                                {t("delivery.picker.unavailableToday")}
                              </span>
                            )}
                          </span>
                          {!unavailable && (
                            <>
                              {showBadge ? (
                                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">+<FormattedPrice usdValue={displayFee} /></span>
                              ) : null}
                              <RadioDot selected={isSelected} />
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {(() => {
                    const activeSlotState = slotStates.find(s => s.slot.label === slot && !s.unavailable);
                    if (activeSlotState && isMidnightSlot(activeSlotState.slot, city?.id)) {
                      const midnightMessage = buildMidnightDeliveryMessage(t, selectedIso, todayIso);
                      return (
                        <div className="rounded-xl bg-[#FFF8EE] text-[#1A1A1A] p-4 flex items-center justify-between mt-3" data-testid="midnight-delivery-banner">
                          <div className="flex gap-3 items-start">
                            <Moon className="w-5 h-5 mt-0.5 opacity-80" />
                            <div>
                              <p className="text-sm font-semibold leading-tight">{t("product.midnightDelivery")}</p>
                              <p className="text-xs opacity-70 mt-1 leading-tight">
                                {midnightMessage}
                              </p>
                            </div>
                          </div>
                          <div className="text-base font-semibold whitespace-nowrap pl-4">
                            +<FormattedPrice usdValue={activeSlotState.displayFee ?? 20} />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              ) : (
                <div
                    className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground"
                    role="status"
                    data-testid="slots-empty-state"
                  >
                    {t("delivery.picker.noSlots")}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="h-14 shrink-0 rounded-full px-6"
              onClick={() => onOpenChange(false)}
              data-testid="button-picker-cancel"
            >
              {t("delivery.picker.cancel")}
            </Button>
            <Button
              className="h-14 flex-1 rounded-full px-6"
              onClick={handleConfirm}
              disabled={confirmDisabled}
              data-testid="button-picker-confirm"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="min-w-0 text-left leading-snug">
                  <span className="block text-sm font-semibold">{t("delivery.picker.confirm")}</span>
                  {ctaDetail && (
                    <span className="block truncate text-xs font-normal opacity-85 mt-0.5">{ctaDetail}</span>
                  )}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>

      <DeliverEarlierDialog
        open={!!pendingEarlier}
        onOpenChange={(o) => {
          if (!o) setPendingEarlier(null);
        }}
        originalLine={pendingEarlier?.originalLine ?? ""}
        newLine={pendingEarlier?.newLine ?? ""}
        totalChangeUsd={pendingEarlier?.totalChangeUsd ?? 0}
        onConfirm={() => {
          if (!pendingEarlier) return;
          trackWebEvent({
            type: "earlier_delivery_confirmed",
            properties: {
              surface: "delivery_picker",
              new_date: pendingEarlier.selection.date,
              total_change_usd: pendingEarlier.totalChangeUsd,
              market: countryCode ?? null,
            },
          });
          const sel = pendingEarlier.selection;
          setPendingEarlier(null);
          commitSelection(sel);
        }}
        onCancel={() => {
          if (pendingEarlier) {
            trackWebEvent({
              type: "earlier_delivery_canceled",
              properties: {
                surface: "delivery_picker",
                market: countryCode ?? null,
              },
            });
          }
          // Keep scheduled delivery: original selection and totals untouched.
          setPendingEarlier(null);
        }}
      />
    </Dialog>
  );
}


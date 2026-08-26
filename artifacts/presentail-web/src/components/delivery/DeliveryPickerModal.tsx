import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, CalendarDays, Check, ChevronLeft, ChevronRight, ArrowRight, Moon, ChevronDown, AlertCircle } from "lucide-react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocationSelection, type DeliveryCity } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { KeyboardEvent, ReactNode } from "react";
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
  isSlotStillBookable,
  MIDNIGHT_FEE_USD,
  nearestSlotForHour,
  type TimeSlot,
} from "@workspace/delivery";
import { displayedSlotsForDate } from "./displayedSlots";
import { citySlotsForDate } from "./citySlotsForDate";
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

type IdentifiedTimeSlot = TimeSlot & {
  slotId?: string;
  enabled?: boolean;
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
  /** Recovery mode: do not restore or auto-pick a date/slot. */
  requireExplicitSelection?: boolean;
  /**
   * The city whose schedule the modal should show. When provided (even as
   * null), it takes precedence over the browsing city from LocationContext —
   * the checkout MUST pass its selected delivery district's city here so the
   * per-weekday schedule, midnight-slot detection, and the confirmed cityId
   * all follow the district picked at checkout, not the storefront city.
   * When omitted (e.g. product-page usage), the browsing city is used.
   */
  city?: DeliveryCity | null;
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

/** Give button-based radio groups the standard Arrow/Home/End behavior. */
function handleRadioGroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLButtonElement>('[role="radio"]')
    : null;
  if (!target) return;

  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not([disabled])'),
  );
  const currentIndex = radios.indexOf(target);
  if (currentIndex < 0 || radios.length < 2) return;

  let nextIndex: number | null = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % radios.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + radios.length) % radios.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = radios.length - 1;
  }
  if (nextIndex === null) return;

  event.preventDefault();
  const next = radios[nextIndex]!;
  next.focus();
  next.click();
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

export function DeliveryPickerModal({ open, onOpenChange, onConfirm, timeSlots: propTimeSlots, cityExpressAvailable = true, expressSurchargeUsd, initialModeOverride, requireExplicitSelection = false, city: cityProp }: Props) {
  const { t, language } = useLocale();
  const { countryCode, city: browsingCity } = useLocationSelection();
  // Distinguish "prop omitted" (undefined → browsing city) from an explicit
  // null (caller has no resolved city → flat timeSlots prop only, no
  // per-weekday schedule and no midnight-slot city detection).
  const city = cityProp !== undefined ? cityProp : browsingCity;
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
  const rawSlotsForDate = useCallback(
    (dateIso: string) =>
      citySlotsForDate(
        rawTimeSlots,
        city?.slotsByDay as Record<string, TimeSlot[]> | undefined,
        dateIso,
      ),
    [rawTimeSlots, city?.slotsByDay],
  );
  const slotsForDate = useCallback(
    (dateIso: string) =>
      sortSlots(
        displayedSlotsForDate(
          rawSlotsForDate(dateIso),
          dateIso,
          todayIso,
          tomorrowIso,
          city?.id,
        ),
      ),
    [rawSlotsForDate, todayIso, tomorrowIso, city?.id],
  );
  const persistedMidnightForDate = useCallback(
    (dateIso: string): TimeSlot | undefined => {
      if (
        deliverySelection.serviceType !== "midnight" ||
        deliverySelection.date !== dateIso ||
        deliverySelection.cityId !== city?.id ||
        !deliverySelection.slotId
      ) {
        return undefined;
      }
      const exact = rawSlotsForDate(dateIso).find((rawCandidate) => {
        const candidate = rawCandidate as IdentifiedTimeSlot;
        return (
          candidate.slotId === deliverySelection.slotId &&
          candidate.label === deliverySelection.slotLabel &&
          candidate.enabled !== false &&
          isMidnightSlot(candidate, city?.id)
        );
      }) as IdentifiedTimeSlot | undefined;
      return exact ? { ...exact, extraFee: MIDNIGHT_FEE_USD } : undefined;
    },
    [
      deliverySelection.serviceType,
      deliverySelection.date,
      deliverySelection.cityId,
      deliverySelection.slotId,
      deliverySelection.slotLabel,
      city?.id,
      rawSlotsForDate,
    ],
  );
  const slotsIncludingPersistedMidnight = useCallback(
    (dateIso: string) => {
      const displayed = slotsForDate(dateIso);
      const persisted = persistedMidnightForDate(dateIso);
      return persisted &&
        !displayed.some(
          (slot) =>
            slot.slotId === persisted.slotId && slot.label === persisted.label,
        )
        ? sortSlots([...displayed, persisted])
        : displayed;
    },
    [slotsForDate, persistedMidnightForDate],
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
  const [unavailableExpanded, setUnavailableExpanded] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

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
    setUnavailableExpanded(false);
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
      !requireExplicitSelection && deliverySelection.mode !== "express" && deliverySelection.date
        ? deliverySelection.date
        : "";

    if (requireExplicitSelection) {
      setDate("");
      setSlot("");
      return;
    }

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
    const daySlots = slotsIncludingPersistedMidnight(dateIso);
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
  }, [open, requireExplicitSelection]);  // eslint-disable-line react-hooks/exhaustive-deps

  /** Change date and reset the slot to the appropriate first-available. */
  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    setSlot(requireExplicitSelection ? "" : defaultSlotForDate(newDate || todayIso));
    setUnavailableExpanded(false);
  };

  // Recovery must require an intentional date click. Keep "no date yet"
  // distinct from today rather than using today's date as an implicit fallback.
  const selectedIso = date || (requireExplicitSelection ? "" : todayIso);
  const isSelectedToday = selectedIso === todayIso;
  const isCustomDate = !!selectedIso && !quickDays.some((d) => d.iso === selectedIso);

  // Per-slot availability for the selected date (today filters by cutoff).
  // slotsForDate already applies same-day/next-day filtering, duplicate-label
  // preference, and the $5 same-day night surcharge fallback (as extraFee).
  const slotStates = useMemo(
    () =>
      (selectedIso ? slotsIncludingPersistedMidnight(selectedIso) : []).map((s) => {
        const isPersistedMidnight =
          deliverySelection.serviceType === "midnight" &&
          deliverySelection.date === selectedIso &&
          deliverySelection.cityId === city?.id &&
          isMidnightSlot(s, city?.id) &&
          (deliverySelection.slotId
            ? deliverySelection.slotId === s.slotId
            : deliverySelection.slotLabel === s.label);
        const persistedMidnightStillActive =
          isPersistedMidnight &&
          isSlotStillBookable({
            deliveryDate: selectedIso,
            slot: s,
            cityId: city?.id,
            countryCode,
            now,
          }).bookable;
        const unavailable =
          selectedIso < todayIso
            ? !persistedMidnightStillActive
            : isSelectedToday &&
              s.cutoffHour <= currentHour &&
              !persistedMidnightStillActive;
        const startH = slotStartHour(s);
        const displayFee = s.extraFee && s.extraFee > 0 ? s.extraFee : null;
        return { slot: s, unavailable, startH, displayFee };
      }),
    [
      slotsIncludingPersistedMidnight,
      selectedIso,
      todayIso,
      isSelectedToday,
      currentHour,
      deliverySelection.serviceType,
      deliverySelection.date,
      deliverySelection.cityId,
      deliverySelection.slotId,
      deliverySelection.slotLabel,
      city?.id,
      countryCode,
      now,
    ],
  );
  const hasAnyAvailableSlot = slotStates.some((s) => !s.unavailable);
  const availableSlotStates = slotStates.filter((s) => !s.unavailable);
  const unavailableSlotStates = slotStates.filter((s) => s.unavailable);
  const nextAvailableDate = useMemo(() => {
    if (hasAnyAvailableSlot) return null;
    if (!selectedIso) return null;
    for (let i = 1; i <= 30; i++) {
      const candidate = addDaysIso(selectedIso, i);
      if (slotsForDate(candidate).length > 0) return candidate;
    }
    return null;
  }, [hasAnyAvailableSlot, selectedIso, slotsForDate]);
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
    if (requireExplicitSelection && mode === "schedule" && (!date || !selectedSlotState)) {
      return;
    }
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

  const confirmDisabled =
    mode === "schedule" &&
    ((requireExplicitSelection && !date) || !hasAnyAvailableSlot || !selectedSlotState);

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
      <DialogContent
        className="flex h-[min(680px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[680px] flex-col gap-0 overflow-hidden rounded-2xl border-[#E7E1D8] bg-[#FFFDFC] p-0 shadow-2xl sm:rounded-2xl"
        onOpenAutoFocus={() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement && active !== document.body && !active.closest('[role="dialog"]')) {
            openerRef.current = active;
          }
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          if (!opener?.isConnected || opener.hasAttribute("disabled")) return;
          event.preventDefault();
          requestAnimationFrame(() => opener.focus());
        }}
      >
        <div className="shrink-0 border-b border-border/70 px-5 pb-3 pt-5 sm:px-7 sm:pb-4 sm:pt-6">
          <DialogTitle className="pr-10 text-[23px] font-serif leading-tight sm:text-2xl">
            {t("delivery.picker.title")}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground sm:text-sm">
            {t("delivery.picker.subtitle")}
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7 sm:py-5">
          <div className="space-y-5 sm:space-y-6">
          {/* ── 1. Delivery option ─────────────────────────────── */}
          <div className="space-y-2">
            <SectionHeading>{t("delivery.picker.step1")}</SectionHeading>
            <div
              role="radiogroup"
              aria-label={t("delivery.picker.step1")}
              onKeyDown={handleRadioGroupKeyDown}
              className={`grid gap-2 ${expressAvailable ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}
            >
              {expressAvailable && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "express"}
                    onClick={() => setMode("express")}
                    className={`flex min-h-[62px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 ${
                      mode === "express"
                        ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                        : "border-border bg-card hover:border-foreground/20"
                    }`}
                    data-testid="option-express"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-primary" aria-hidden="true">
                      <Zap className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-foreground">{t("checkout.expressDelivery")}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {buildExpressPromise({ quotedAt: now, countryCode: countryCode ?? null, locale: language, t }).arrival}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-primary">+<FormattedPrice usdValue={expressSurcharge} /></span>
                    <RadioDot selected={mode === "express"} />
                  </button>
              )}
              <button
                type="button"
                role="radio"
                aria-checked={mode === "schedule"}
                onClick={() => setMode("schedule")}
                className={`flex min-h-[62px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 ${
                  mode === "schedule"
                    ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                    : "border-border bg-card hover:border-foreground/20"
                }`}
                data-testid="option-schedule"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-primary" aria-hidden="true">
                  <CalendarDays className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-foreground">{t("checkout.scheduleDelivery")}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{t("checkout.scheduleDeliveryDesc")}</span>
                </span>
                <RadioDot selected={mode === "schedule"} />
              </button>
            </div>
          </div>

          {mode === "schedule" && (
            <>
              {/* ── 2. Choose date ─────────────────────────────── */}
              <div className="space-y-2">
                <SectionHeading>{t("delivery.picker.step2")}</SectionHeading>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                        className={`flex min-h-[52px] flex-col justify-center rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                    className={`flex min-h-[52px] flex-col justify-center rounded-xl border px-2 py-2 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
              <div className="space-y-2">
                <SectionHeading>
                  {isCustomDate
                    ? <>{t("delivery.picker.step3For")} <span className="text-primary">{weekdayDayMonth(selectedIso)}</span></>
                    : t("delivery.picker.step3")}
                </SectionHeading>
                {hasAnyAvailableSlot ? (
                  <>
                    <div role="radiogroup" aria-label={t("delivery.picker.step3")} onKeyDown={handleRadioGroupKeyDown}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {availableSlotStates
                        .filter(({ slot: s }) => !isMidnightSlot(s, city?.id))
                        .map(({ slot: s, startH, displayFee }) => {
                          const isSelected = slot === s.label;
                          return (
                            <button
                              key={s.slotId ?? `${s.label}-${s.startHour ?? "na"}-${s.endHour ?? "na"}-${s.cutoffHour}`}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              onClick={() => setSlot(s.label)}
                              className={`flex min-h-[62px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 ${
                                isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/20"
                              }`}
                              data-testid={`slot-${s.label}`}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-foreground">{slotTimeText(s)}</span>
                                <span className="block text-xs font-normal text-muted-foreground">{t(periodKeyForStartHour(startH))}</span>
                              </span>
                              {displayFee ? (
                                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">+<FormattedPrice usdValue={displayFee} /></span>
                              ) : null}
                              <RadioDot selected={isSelected} />
                            </button>
                          );
                        })}
                      </div>

                    {availableSlotStates
                      .filter(({ slot: s }) => isMidnightSlot(s, city?.id))
                      .map((midnightState) => {
                        const isSelected = slot === midnightState.slot.label;
                        const midnightMessage = buildMidnightDeliveryMessage(t, selectedIso, todayIso);
                        return (
                        <button
                          key={midnightState.slot.slotId ?? `${midnightState.slot.label}-${midnightState.slot.startHour ?? "na"}-${midnightState.slot.endHour ?? "na"}`}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => {
                            setSlot(midnightState.slot.label);
                            trackWebEventOnce({
                              type: "midnight_option_selected",
                              properties: { city_id: city?.id ?? "unknown", date: selectedIso, slot_id: midnightState.slot.slotId ?? undefined },
                            }, `${city?.id ?? "unknown"}|${selectedIso}|${midnightState.slot.slotId ?? ""}`);
                          }}
                          className={`flex min-h-[62px] w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 ${
                            isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/20"
                          }`}
                          data-testid={`slot-${midnightState.slot.label}`}
                        >
                          <Moon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground">{t("product.midnightDelivery")}</span>
                            <span className="block text-xs text-muted-foreground">{slotTimeText(midnightState.slot)} · {t("delivery.picker.midnightEndsNextDay")}</span>
                            {isSelected && <span className="sr-only" data-testid="midnight-delivery-banner">{midnightMessage}</span>}
                          </span>
                          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">+<FormattedPrice usdValue={midnightState.displayFee ?? 20} /></span>
                          <RadioDot selected={isSelected} />
                        </button>
                        );
                      })}

                    {unavailableSlotStates.length > 0 && (
                      <div>
                        <button
                          type="button"
                          aria-expanded={unavailableExpanded}
                          aria-controls="unavailable-delivery-windows"
                          onClick={() => setUnavailableExpanded((expanded) => !expanded)}
                          className="mt-2 flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-testid="unavailable-slots-disclosure"
                        >
                          <span className="flex items-center gap-2">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {t("delivery.picker.unavailableCount").replace("{count}", String(unavailableSlotStates.length))}
                          </span>
                          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${unavailableExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
                        {unavailableExpanded && (
                          <div id="unavailable-delivery-windows" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {unavailableSlotStates.map(({ slot: s, startH }) => (
                              <button
                                key={s.slotId ?? `${s.label}-${s.startHour ?? "na"}-${s.endHour ?? "na"}-${s.cutoffHour}`}
                                type="button"
                                disabled
                                aria-disabled="true"
                                className="flex min-h-[52px] cursor-not-allowed items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-left text-sm opacity-65"
                                data-testid={`unavailable-slot-${s.label}`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block font-semibold text-muted-foreground">{slotTimeText(s)}</span>
                                  <span className="block text-xs text-muted-foreground">{t(periodKeyForStartHour(startH))} · {t("delivery.picker.unavailableToday")}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground" role="status" data-testid="slots-empty-state">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p>{t("delivery.picker.noSlots")}</p>
                        {nextAvailableDate && (
                          <button
                            type="button"
                            onClick={() => handleDateChange(nextAvailableDate)}
                            className="mt-2 font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            data-testid="next-available-date"
                          >
                            {t("delivery.picker.nextAvailable").replace("{date}", weekdayDayMonth(nextAvailableDate))}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/70 bg-[#FFFDFC] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="min-h-[44px] shrink-0 rounded-full border-0 px-1 text-sm font-semibold shadow-none hover:bg-transparent hover:underline"
              onClick={() => onOpenChange(false)}
              data-testid="button-picker-cancel"
            >
              {t("delivery.picker.cancel")}
            </Button>
            <Button
              className="min-h-[48px] flex-1 rounded-xl px-4"
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


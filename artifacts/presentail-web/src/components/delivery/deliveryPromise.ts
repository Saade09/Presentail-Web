import { useEffect, useMemo, useState } from "react";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import {
  expressDeadlineFrom,
  formatCountryTime,
  formatPromiseDateLabel,
  getLocalIso,
  isMidnightSlot,
  slotTimeRangeShortForLabel,
  type TimeSlot,
} from "@workspace/delivery";

/**
 * How long an express "Arrives by" quote stays valid before it is
 * re-anchored. Matches the delivery-config query staleTime (5 min) so the
 * displayed deadline refreshes on the same cadence the availability data is
 * revalidated — while never creeping forward minute-by-minute in between.
 */
export const EXPRESS_QUOTE_TTL_MS = 5 * 60 * 1000;

/**
 * The concrete delivery promise for the current cart selection.
 * `null` when no delivery selection has been made yet.
 */
export type DeliveryPromise = {
  type: "standard" | "express" | "midnight";
  /** Service line, e.g. "Standard delivery". */
  title: string;
  /** Prominent promise line, e.g. "Arrives today, 2–5 PM" / "Arrives by 11:07 AM". */
  arrival: string;
  /** Caption line, e.g. "Scheduled delivery window" / "Within 90 minutes". */
  caption: string;
  /** Compact Order Summary label, e.g. "Standard delivery · Today, 2–5 PM". */
  summary: string;
};

/** Substitute `{x}` placeholders in a translation template. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/**
 * City-scoped OS slot list shared by the Delivery Summary row and the picker
 * modal. An empty list means OS has no schedule for this city; it must never
 * be substituted with a country-wide schedule from another city.
 */
export function useCityTimeSlots(): TimeSlot[] {
  const { city } = useLocationSelection();
  return useMemo(() => {
    let raw: TimeSlot[] = [];
    if (city?.timeSlots?.length) {
      raw = city.timeSlots;
    } else if (city?.slotsByDay) {
      raw = Object.values(city.slotsByDay)
        .flat()
        .filter((s, i, arr) => arr.findIndex((t) => t.cutoffHour === s.cutoffHour) === i);
    }
    const seen = new Set<string>();
    return raw.filter((s) => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  }, [city]);
}

/**
 * Express deadline anchor: captured when express is selected (the quote
 * time) and re-anchored only when the quote goes stale — never creeping
 * forward on every render/minute while the page stays open.
 */
export function useExpressQuoteAnchor(active: boolean): Date | null {
  const [anchor, setAnchor] = useState<Date | null>(null);
  useEffect(() => {
    if (!active) {
      setAnchor(null);
      return;
    }
    setAnchor(new Date());
    const id = setInterval(() => setAnchor(new Date()), EXPRESS_QUOTE_TTL_MS);
    return () => clearInterval(id);
  }, [active]);
  return anchor;
}

/** Pure builder for the standard-delivery promise strings (unit-testable). */
export function buildStandardPromise(args: {
  dateIso: string;
  slotLabel: string | null;
  slots: TimeSlot[];
  todayIso: string;
  locale: string;
  t: (key: string) => string;
}): DeliveryPromise {
  const { dateIso, slotLabel, slots, todayIso, locale, t } = args;
  const dateLabel = formatPromiseDateLabel(
    dateIso,
    todayIso,
    t("delivery.promise.today"),
    t("delivery.promise.tomorrow"),
    locale,
  );
  const window = slotTimeRangeShortForLabel(slotLabel, slots) ?? slotLabel ?? "";
  const when = window ? `${dateLabel}, ${window}` : dateLabel;
  const title = t("delivery.promise.standardTitle");
  return {
    type: "standard",
    title,
    arrival: fill(t("delivery.promise.arrives"), { when }),
    caption: t("delivery.promise.scheduledCaption"),
    summary: `${title} · ${when}`,
  };
}

/**
 * Pure builder for the Midnight Delivery promise strings (unit-testable).
 * The arrival line says "tonight" only when the selected date is the market's
 * local today; otherwise the explicit date label is used (never device-local).
 */
export function buildMidnightPromise(args: {
  dateIso: string;
  slotLabel: string | null;
  slots: TimeSlot[];
  todayIso: string;
  locale: string;
  t: (key: string) => string;
}): DeliveryPromise {
  const { dateIso, slotLabel, slots, todayIso, locale, t } = args;
  const dateLabel =
    dateIso === todayIso
      ? t("delivery.promise.tonight")
      : formatPromiseDateLabel(
          dateIso,
          todayIso,
          t("delivery.promise.today"),
          t("delivery.promise.tomorrow"),
          locale,
        );
  const window = slotTimeRangeShortForLabel(slotLabel, slots) ?? slotLabel ?? "";
  const when = window ? `${dateLabel}, ${window}` : dateLabel;
  const title = t("delivery.promise.midnightTitle");
  return {
    type: "midnight",
    title,
    arrival: fill(t("delivery.promise.arrives"), { when }),
    caption: t("delivery.promise.midnightCaption"),
    summary: `${title} · ${when}`,
  };
}

/** Pure builder for the express-delivery promise strings (unit-testable). */
export function buildExpressPromise(args: {
  quotedAt: Date;
  countryCode: string | null;
  locale: string;
  t: (key: string) => string;
}): DeliveryPromise {
  const { quotedAt, countryCode, locale, t } = args;
  const time = formatCountryTime(expressDeadlineFrom(quotedAt), countryCode, locale);
  const title = t("delivery.promise.expressTitle");
  return {
    type: "express",
    title,
    arrival: fill(t("delivery.promise.arrivesBy"), { time }),
    caption: t("delivery.promise.within90"),
    summary: `${title} · ${t("delivery.promise.within90Short")}`,
  };
}

/**
 * The delivery promise for the current cart selection, or `null` when no
 * delivery selection exists yet. Express deadlines are computed in the
 * recipient market's timezone and anchored to the quote time.
 */
export function useDeliveryPromise(): DeliveryPromise | null {
  const { t, language } = useLocale();
  const { mode, date, slotLabel, slotId, serviceType } = useDeliverySelection();
  const { countryCode, city } = useLocationSelection();
  const slots = useCityTimeSlots();
  const quoteAnchor = useExpressQuoteAnchor(mode === "express");

  return useMemo(() => {
    if (mode === "express") {
      return buildExpressPromise({
        quotedAt: quoteAnchor ?? new Date(),
        countryCode: countryCode ?? null,
        locale: language,
        t,
      });
    }
    if (mode == null || !date) return null;
    // Midnight detection: the authoritative serviceType captured at selection
    // time, with a slot-config fallback for selections that predate it.
    const selectedSlot =
      (slotId ? slots.find((s) => s.slotId === slotId) : undefined) ??
      (slotLabel ? slots.find((s) => s.label === slotLabel) : undefined);
    const midnight =
      serviceType === "midnight" || isMidnightSlot(selectedSlot, city?.id);
    const builder = midnight ? buildMidnightPromise : buildStandardPromise;
    return builder({
      dateIso: date,
      slotLabel: slotLabel ?? null,
      slots,
      todayIso: getLocalIso(countryCode ?? null),
      locale: language,
      t,
    });
  }, [mode, date, slotLabel, slotId, serviceType, slots, countryCode, city?.id, language, t, quoteAnchor]);
}

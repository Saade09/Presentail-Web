import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  firstAvailableDay,
  getCountryHour,
  timeSlotsForCountry,
} from "@workspace/delivery";

export type DeliveryMode = "express" | "today_slot" | "schedule";

export type DeliverySelection = {
  mode: DeliveryMode | null;
  date: string | null;
  slotLabel: string | null;
  /**
   * OS-assigned stable slot ID for the selected slot configuration. Needed to
   * disambiguate duplicate-label slots (e.g. a same-day paid "Night" config vs
   * a next-day free one) so fee lookups charge the variant the shopper saw.
   */
  slotId: string | null;
};

type DeliverySelectionContextValue = DeliverySelection & {
  hasSelection: boolean;
  setSelection: (next: Partial<DeliverySelection>) => void;
  clear: () => void;
};

const STORAGE_KEY = "presentail_delivery_selection_v1";

const DeliverySelectionContext =
  createContext<DeliverySelectionContextValue | null>(null);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve the first available delivery date starting from today.
 * Uses the supplied `countryCode` for country-aware slot table and local
 * hour (Asia/Dubai for AE, Asia/Beirut for LB & CY). Falls back to LB
 * when `countryCode` is omitted — the picker modal will re-check with
 * the actual country on open, and the web Checkout page has its own
 * correction effect that runs when city time-slot data arrives.
 */
function resolveFirstAvailableDate(countryCode?: string | null): { date: string; slotLabel: string | null } {
  const today = todayIso();
  const slots = timeSlotsForCountry(countryCode);
  const h = getCountryHour(countryCode);
  const result = firstAvailableDay(today, slots, h, today);
  return {
    date: result?.iso ?? today,
    slotLabel: result?.slot.label ?? null,
  };
}

/** Read the stored country code from LocationContext's localStorage entry. */
function readStoredCountryCode(): string | null {
  try {
    const raw = window.localStorage.getItem("presentail_delivery_location_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.countryCode === "string" ? parsed.countryCode : null;
  } catch {
    return null;
  }
}

function sanitize(raw: unknown, countryCode?: string | null): DeliverySelection {
  const empty: DeliverySelection = { mode: null, date: null, slotLabel: null, slotId: null };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === "express" ||
    obj.mode === "today_slot" ||
    obj.mode === "schedule"
      ? (obj.mode as DeliveryMode)
      : null;
  let date =
    typeof obj.date === "string" && obj.date.length === 10 ? obj.date : null;
  if (date && date < todayIso()) date = null;
  let slotLabel =
    typeof obj.slotLabel === "string" && obj.slotLabel.length > 0
      ? obj.slotLabel
      : null;
  if (slotLabel) {
    const known = new Set(
      [...timeSlotsForCountry("LB"), ...timeSlotsForCountry("AE")].map(
        (s) => s.label,
      ),
    );
    if (!known.has(slotLabel)) slotLabel = null;
  }
  const slotId =
    slotLabel && typeof obj.slotId === "string" && obj.slotId.length > 0
      ? obj.slotId
      : null;
  if (!mode) return empty;
  if (mode === "express") {
    return { mode, date: todayIso(), slotLabel: null, slotId: null };
  }
  const today = todayIso();
  if (!date || date === today) {
    const slots = timeSlotsForCountry(countryCode);
    const h = getCountryHour(countryCode);
    const todayHasSlots = slots.some((s) => s.cutoffHour > h);
    if (!todayHasSlots) {
      const resolved = resolveFirstAvailableDate(countryCode);
      return {
        mode: resolved.date !== today ? "schedule" : mode,
        date: resolved.date,
        slotLabel: resolved.slotLabel,
        slotId: null,
      };
    }
    if (!date) date = today;
  }
  return { mode, date, slotLabel, slotId };
}

function readInitial(): DeliverySelection {
  if (typeof window === "undefined")
    return { mode: null, date: null, slotLabel: null, slotId: null };
  try {
    // Read the stored country so resolution uses the correct slot table and
    // timezone (Dubai for AE, Beirut for LB/CY). Falls back to LB when no
    // location is stored — the Checkout page correction effect covers AE/CY
    // when the OS city data arrives after the initial render.
    const countryCode = readStoredCountryCode();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // No stored selection for this visitor. Return null so ProductDetail can
      // detect that no window has been committed and require an explicit picker
      // interaction before Add to Cart. ScheduleInlinePanel will auto-pick a
      // slot locally but the context stays uncommitted until the user acts.
      return { mode: null, date: null, slotLabel: null, slotId: null };
    }
    const sanitized = sanitize(JSON.parse(raw), countryCode);
    return sanitized;
  } catch {
    return { mode: null, date: null, slotLabel: null, slotId: null };
  }
}

export function DeliverySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selection, setSelectionState] =
    useState<DeliverySelection>(readInitial);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      // ignore quota / disabled storage
    }
  }, [selection]);

  const setSelection = useCallback((next: Partial<DeliverySelection>) => {
    setSelectionState((prev) => ({ ...prev, ...next }));
  }, []);
  const clear = useCallback(
    () => setSelectionState({ mode: null, date: null, slotLabel: null, slotId: null }),
    [],
  );

  const value = useMemo<DeliverySelectionContextValue>(
    () => ({
      ...selection,
      hasSelection: !!selection.mode,
      setSelection,
      clear,
    }),
    [selection, setSelection, clear],
  );

  return (
    <DeliverySelectionContext.Provider value={value}>
      {children}
    </DeliverySelectionContext.Provider>
  );
}

export function useDeliverySelection(): DeliverySelectionContextValue {
  const ctx = useContext(DeliverySelectionContext);
  if (!ctx)
    throw new Error(
      "useDeliverySelection must be used within DeliverySelectionProvider",
    );
  return ctx;
}

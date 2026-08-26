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
} from "@workspace/delivery";

export type DeliveryMode = "express" | "today_slot" | "schedule";
export type DeliveryInvalidationReason = "expired" | "unavailable";

/**
 * Provenance of the active delivery selection. Drives the cart's Express
 * upsell gating: a user-chosen future date must never be "upsold away",
 * while a system-assigned one may show a quiet "Need it today?" prompt.
 *
 * - `system_default`          — auto-assigned by the app (no explicit pick).
 * - `user_selected`           — explicitly confirmed by the shopper this session.
 * - `restored_user_selection` — an explicit choice restored from storage
 *                               (refresh / navigation / login / cart restore).
 * - `system_reselected`       — the system re-picked after the stored slot
 *                               became unavailable (date passed, sold out…).
 */
export type DeliverySelectionSource =
  | "system_default"
  | "user_selected"
  | "restored_user_selection"
  | "system_reselected";

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
  /** Authoritative premium service marker captured from the selected OS slot. */
  serviceType: "midnight" | null;
  /** Canonical city where the exact OS slot was selected. */
  cityId: string | null;
  /** Who produced this selection. `null` only when no selection exists. */
  source: DeliverySelectionSource | null;
};

type DeliverySelectionContextValue = DeliverySelection & {
  hasSelection: boolean;
  setSelection: (next: Partial<DeliverySelection>) => void;
  clear: () => void;
  /** Retained across the cart/checkout handoff to explain a forced re-pick. */
  invalidationReason?: DeliveryInvalidationReason | null;
  invalidate?: (reason: DeliveryInvalidationReason) => void;
};

const STORAGE_KEY = "presentail_delivery_selection_v1";
const INVALIDATION_STORAGE_KEY = "presentail_delivery_invalidation_v1";

const DeliverySelectionContext =
  createContext<DeliverySelectionContextValue | null>(null);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

const EMPTY: DeliverySelection = {
  mode: null,
  date: null,
  slotLabel: null,
  slotId: null,
  serviceType: null,
  cityId: null,
  source: null,
};

/**
 * Map a stored source to the source of the *restored* selection:
 * an explicit choice restored from storage becomes `restored_user_selection`;
 * system-produced selections keep their system provenance. Legacy payloads
 * without a source predate source tracking — every scheduled selection then
 * required an explicit picker interaction, so they are treated as restored
 * user choices (the safe direction: never upsell them away).
 */
export function restoredSource(raw: unknown): DeliverySelectionSource {
  if (raw === "system_default" || raw === "system_reselected") return raw;
  return "restored_user_selection";
}

export function sanitize(raw: unknown, countryCode?: string | null): DeliverySelection {
  if (!raw || typeof raw !== "object") return EMPTY;
  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === "express" ||
    obj.mode === "today_slot" ||
    obj.mode === "schedule"
      ? (obj.mode as DeliveryMode)
      : null;
  let date =
    typeof obj.date === "string" && obj.date.length === 10 ? obj.date : null;
  const datePassed = !!date && date < todayIso();
  if (datePassed) date = null;
  let slotLabel =
    typeof obj.slotLabel === "string" && obj.slotLabel.length > 0
      ? obj.slotLabel
      : null;
  // Previously we filtered slotLabel against a hardcoded list of LB/AE slots.
  // We no longer do this here because OS city data provides dynamic slots
  // (like Midnight Delivery) that aren't in the flat fallback list. Validation
  // against the real OS slots happens in ProductDetail/Cart when data loads.
  const slotId =
    slotLabel && typeof obj.slotId === "string" && obj.slotId.length > 0
      ? obj.slotId
      : null;
  const serviceType =
    slotId && obj.serviceType === "midnight" ? "midnight" as const : null;
  const cityId =
    slotId && typeof obj.cityId === "string" && obj.cityId.length > 0
      ? obj.cityId
      : null;
  if (!mode) return EMPTY;
  const source = restoredSource(obj.source);
  if (mode === "express") {
    return {
      mode,
      date: todayIso(),
      slotLabel: null,
      slotId: null,
      serviceType: null,
      cityId: null,
      source,
    };
  }
  // Do not invent a date or slot from a country-wide table while the selected
  // city's OS schedule is still unavailable. City-aware consumers validate or
  // clear this restored selection when live OS location data loads.
  return { mode, date, slotLabel, slotId, serviceType, cityId, source };
}

function readInitial(): DeliverySelection {
  if (typeof window === "undefined") return EMPTY;
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
      return EMPTY;
    }
    const sanitized = sanitize(JSON.parse(raw), countryCode);
    return sanitized;
  } catch {
    return EMPTY;
  }
}

function readInitialInvalidationReason(): DeliveryInvalidationReason | null {
  if (typeof window === "undefined") return null;
  try {
    const reason = window.localStorage.getItem(INVALIDATION_STORAGE_KEY);
    return reason === "expired" || reason === "unavailable" ? reason : null;
  } catch {
    return null;
  }
}

export function DeliverySelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selection, setSelectionState] =
    useState<DeliverySelection>(readInitial);
  const [invalidationReason, setInvalidationReason] =
    useState<DeliveryInvalidationReason | null>(readInitialInvalidationReason);
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

  useEffect(() => {
    try {
      if (invalidationReason) {
        window.localStorage.setItem(INVALIDATION_STORAGE_KEY, invalidationReason);
      } else {
        window.localStorage.removeItem(INVALIDATION_STORAGE_KEY);
      }
    } catch {
      // Storage is best-effort only; in-memory recovery still works.
    }
  }, [invalidationReason]);

  const setSelection = useCallback((next: Partial<DeliverySelection>) => {
    setSelectionState((prev) => ({ ...prev, ...next }));
    setInvalidationReason(null);
  }, []);
  const clear = useCallback(() => {
    setSelectionState(EMPTY);
    setInvalidationReason(null);
  }, []);
  const invalidate = useCallback((reason: DeliveryInvalidationReason) => {
    setSelectionState(EMPTY);
    setInvalidationReason(reason);
  }, []);

  const value = useMemo<DeliverySelectionContextValue>(
    () => ({
      ...selection,
      hasSelection: !!selection.mode,
      setSelection,
      clear,
      invalidationReason,
      invalidate,
    }),
    [selection, setSelection, clear, invalidationReason, invalidate],
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

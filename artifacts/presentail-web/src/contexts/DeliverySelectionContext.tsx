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
  getBeirutHour,
  timeSlotsForCountry,
} from "@workspace/delivery";

export type DeliveryMode = "express" | "today_slot" | "schedule";

export type DeliverySelection = {
  mode: DeliveryMode | null;
  date: string | null;
  slotLabel: string | null;
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
 * Uses LB slots + Beirut hour as a conservative default when country is
 * unknown (the picker modal will re-check with the actual country on open).
 */
function resolveFirstAvailableDate(): { date: string; slotLabel: string | null } {
  const today = todayIso();
  const lbSlots = timeSlotsForCountry("LB");
  const h = getBeirutHour();
  const result = firstAvailableDay(today, lbSlots, h, today);
  return {
    date: result?.iso ?? today,
    slotLabel: result?.slot.label ?? null,
  };
}

function sanitize(raw: unknown): DeliverySelection {
  const empty: DeliverySelection = { mode: null, date: null, slotLabel: null };
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
  if (!mode) return empty;
  if (mode === "express") {
    return { mode, date: todayIso(), slotLabel: null };
  }
  const today = todayIso();
  if (!date || date === today) {
    const lbSlots = timeSlotsForCountry("LB");
    const h = getBeirutHour();
    const todayHasSlots = lbSlots.some((s) => s.cutoffHour > h);
    if (!todayHasSlots) {
      const resolved = resolveFirstAvailableDate();
      return {
        mode: resolved.date !== today ? "schedule" : mode,
        date: resolved.date,
        slotLabel: resolved.slotLabel,
      };
    }
    if (!date) date = today;
  }
  return { mode, date, slotLabel };
}

function readInitial(): DeliverySelection {
  if (typeof window === "undefined")
    return { mode: null, date: null, slotLabel: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // No persisted selection — resolve a conservative default (LB slots + Beirut
      // hour). The web checkout page re-validates with the actual country slots on
      // mount so AE/CY shoppers get the correct country-aware default.
      const resolved = resolveFirstAvailableDate();
      const today = todayIso();
      return {
        mode: resolved.date !== today ? "schedule" : "today_slot",
        date: resolved.date,
        slotLabel: resolved.slotLabel,
      };
    }
    return sanitize(JSON.parse(raw));
  } catch {
    return { mode: null, date: null, slotLabel: null };
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
    () => setSelectionState({ mode: null, date: null, slotLabel: null }),
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

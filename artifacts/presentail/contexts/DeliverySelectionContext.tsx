import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useCart } from "@/contexts/CartContext";
import {
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";

export type DeliveryMode = "express" | "today_slot" | "schedule";

export type DeliverySelection = {
  mode: DeliveryMode | null;
  date: string | null;
  slotLabel: string | null;
};

type DeliverySelectionContextValue = DeliverySelection & {
  hasSelection: boolean;
  setMode: (mode: DeliveryMode) => void;
  setDate: (date: string) => void;
  setSlotLabel: (slotLabel: string | null) => void;
  setSlot: (slot: TimeSlot | null) => void;
  setSelection: (next: Partial<DeliverySelection>) => void;
  clear: () => void;
};

const STORAGE_KEY = "@presentail/delivery-selection-v1";

const DeliverySelectionContext =
  createContext<DeliverySelectionContextValue | null>(null);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Strip stored selection of values that are no longer valid:
 *  - past dates → drop date and slot
 *  - bogus mode → drop everything
 *  - slot label not present in any known timeSlots list → drop slot
 *
 * The validation is intentionally lenient (rather than throwing) so a stale
 * persisted value can never crash the cart or checkout screens. See the
 * "product detail screen must stay defensive" gotcha in replit.md.
 */
function sanitize(raw: unknown): DeliverySelection {
  const empty: DeliverySelection = { mode: null, date: null, slotLabel: null };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === "express" || obj.mode === "today_slot" || obj.mode === "schedule"
      ? (obj.mode as DeliveryMode)
      : null;
  let date = typeof obj.date === "string" && obj.date.length === 10 ? obj.date : null;
  if (date && date < todayIso()) date = null;
  let slotLabel =
    typeof obj.slotLabel === "string" && obj.slotLabel.length > 0
      ? obj.slotLabel
      : null;
  if (slotLabel) {
    const known = new Set(
      [...timeSlotsForCountry("LB"), ...timeSlotsForCountry("AE")].map((s) => s.label),
    );
    if (!known.has(slotLabel)) slotLabel = null;
  }
  if (!mode) return empty;
  // Mode is set: only fix the trivially-invalid pieces (past date already
  // dropped above; missing date defaulted to today). The persisted slot
  // label is intentionally preserved as-is — country-aware re-validation
  // (including "today" cutoff) happens at display time in the cart and on
  // mount in checkout, where the active country is known. Forcing an
  // LB-list fallback here would silently rewrite a valid AE slot label
  // into an LB one on hydrate.
  if (mode === "express") {
    return { mode, date: todayIso(), slotLabel: null };
  }
  if (!date) date = todayIso();
  return { mode, date, slotLabel };
}

export function DeliverySelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selection, setSelectionState] = useState<DeliverySelection>({
    mode: null,
    date: null,
    slotLabel: null,
  });
  const hydrated = useRef(false);
  const pending = useRef<Partial<DeliverySelection> | null>(null);
  const { onClear: onCartClear } = useCart();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        let next: DeliverySelection = { mode: null, date: null, slotLabel: null };
        if (raw) {
          try {
            next = sanitize(JSON.parse(raw));
          } catch {
            next = { mode: null, date: null, slotLabel: null };
          }
        }
        if (pending.current) {
          next = { ...next, ...pending.current };
          pending.current = null;
        }
        hydrated.current = true;
        setSelectionState(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next = pending.current
          ? ({ mode: null, date: null, slotLabel: null, ...pending.current } as DeliverySelection)
          : { mode: null, date: null, slotLabel: null };
        pending.current = null;
        hydrated.current = true;
        setSelectionState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selection)).catch(() => {});
  }, [selection]);

  const apply = useCallback((next: Partial<DeliverySelection>) => {
    if (!hydrated.current) {
      pending.current = { ...(pending.current ?? {}), ...next };
      return;
    }
    setSelectionState((prev) => ({ ...prev, ...next }));
  }, []);

  const setMode = useCallback((mode: DeliveryMode) => apply({ mode }), [apply]);
  const setDate = useCallback((date: string) => apply({ date }), [apply]);
  const setSlotLabel = useCallback(
    (slotLabel: string | null) => apply({ slotLabel }),
    [apply],
  );
  const setSlot = useCallback(
    (slot: TimeSlot | null) => apply({ slotLabel: slot?.label ?? null }),
    [apply],
  );
  const setSelection = useCallback(
    (next: Partial<DeliverySelection>) => apply(next),
    [apply],
  );
  const clear = useCallback(() => {
    if (!hydrated.current) {
      pending.current = { mode: null, date: null, slotLabel: null };
      return;
    }
    setSelectionState({ mode: null, date: null, slotLabel: null });
  }, []);

  // Reset persisted delivery selection whenever the cart itself is cleared,
  // regardless of which screen invoked clear() — keeps the source of truth
  // in CartContext.
  useEffect(() => {
    const off = onCartClear(() => {
      if (!hydrated.current) {
        pending.current = { mode: null, date: null, slotLabel: null };
        return;
      }
      setSelectionState({ mode: null, date: null, slotLabel: null });
    });
    return off;
  }, [onCartClear]);

  const value = useMemo<DeliverySelectionContextValue>(
    () => ({
      ...selection,
      hasSelection: !!selection.mode,
      setMode,
      setDate,
      setSlotLabel,
      setSlot,
      setSelection,
      clear,
    }),
    [selection, setMode, setDate, setSlotLabel, setSlot, setSelection, clear],
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

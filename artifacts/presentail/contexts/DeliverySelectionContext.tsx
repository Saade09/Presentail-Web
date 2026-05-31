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
import { sanitize } from "@/lib/deliverySelectionSanitize";
import { type TimeSlot } from "@workspace/delivery";

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

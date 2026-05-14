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
import { timeSlotsForCountry } from "@workspace/delivery";

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
  if (!date) date = todayIso();
  return { mode, date, slotLabel };
}

function readInitial(): DeliverySelection {
  if (typeof window === "undefined")
    return { mode: null, date: null, slotLabel: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: null, date: null, slotLabel: null };
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

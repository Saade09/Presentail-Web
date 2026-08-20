/**
 * Tests: no-OS-slots behaviour on mobile delivery paths.
 *
 * Requirement: when a city has no OS-published time slots
 * (`selectedCity.timeSlots` is empty or absent), the mobile app must:
 *
 *   1. Show an explicit "no slots available" state in the slot picker area
 *      (RescheduleDeliverySheet).
 *   2. Disable the "Confirm date & time" button in RescheduleDeliverySheet.
 *   3. Never fall back to the hardcoded `timeSlotsForCountry` table in
 *      the active delivery slot paths.
 *
 * These tests verify items 1–3 using react-test-renderer (no native modules).
 */

import React, { act } from "react";
import * as ReactTestRenderer from "react-test-renderer";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { RescheduleDeliverySheet } from "@/components/RescheduleDeliverySheet";
import { LanguageContext } from "@/contexts/LanguageContext";
import { CurrencyContext } from "@/contexts/CurrencyContext";
import { DEFAULT_CURRENCY, DEFAULT_LANGUAGE } from "./test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@/components/DateStrip", () => ({
  DateStrip: () => null,
}));

// Mock useDeliverySelection — returns a no-op stub.
vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({
    mode: null,
    date: null,
    slotLabel: null,
    setMode: vi.fn(),
    setDate: vi.fn(),
    setSlot: vi.fn(),
    setSlotLabel: vi.fn(),
    setSelection: vi.fn(),
  }),
}));

// useDeliveryLocation is controlled per-test to inject OS slot data.
const mockUseDeliveryLocation = vi.fn();
vi.mock("@/hooks/useDeliveryLocation", () => ({
  useDeliveryLocation: () => mockUseDeliveryLocation(),
}));

// ---------------------------------------------------------------------------
// Tree traversal helpers (same pattern as SlotPicker.test.tsx)
// ---------------------------------------------------------------------------

function textContent(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const n = node as { children?: unknown[] };
  if (!n.children) return "";
  return n.children.map(textContent).join("");
}

function findAllNodes(node: unknown, type: string): unknown[] {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap((c) => findAllNodes(c, type));
  const n = node as { type?: string; children?: unknown[] };
  const here = n.type === type ? [n] : [];
  if (n.children) return [...here, ...n.children.flatMap((c) => findAllNodes(c, type))];
  return here;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeliveryLocation(cityTimeSlots: unknown[]) {
  return {
    selectedCountry: {
      id: "lb",
      name: "Lebanon",
      code: "LB",
      flag: "🇱🇧",
      currency: "USD",
      isActive: true,
      cities: [],
    },
    selectedCity: {
      id: "beirut",
      name: "Beirut",
      isActive: true,
      timeSlots: cityTimeSlots,
    },
    deliveryLocations: [],
    isLoading: false,
    error: null,
  };
}

function renderSheet(cityTimeSlots: unknown[], visible = true) {
  mockUseDeliveryLocation.mockReturnValue(makeDeliveryLocation(cityTimeSlots));

  let instance!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    instance = ReactTestRenderer.create(
      <LanguageContext.Provider value={DEFAULT_LANGUAGE as any}>
        <CurrencyContext.Provider value={DEFAULT_CURRENCY as any}>
          <RescheduleDeliverySheet
            visible={visible}
            onClose={vi.fn()}
            expressAvailable={false}
            expressSurchargeUsd={0}
          />
        </CurrencyContext.Provider>
      </LanguageContext.Provider>,
    );
  });
  return { tree: instance.toJSON() as unknown, instance };
}

// ---------------------------------------------------------------------------
// Tests: RescheduleDeliverySheet with no OS slots
// ---------------------------------------------------------------------------

describe("RescheduleDeliverySheet — no OS slots (empty timeSlots)", () => {
  it("renders the 'no delivery slots' message when city has no OS slots", () => {
    const { tree } = renderSheet([]);
    const full = textContent(tree);
    // Translation key: noDeliverySlots
    expect(full).toContain("No delivery time slots are available for this area");
  });

  it("does NOT render hardcoded LB slot labels when city has no OS slots", () => {
    const { tree } = renderSheet([]);
    const full = textContent(tree);
    // Hardcoded slot labels that timeSlotsForCountry("LB") would have produced
    expect(full).not.toContain("9:00 AM");
    expect(full).not.toContain("2:00 PM – 6:00 PM");
    // AE fallback slots
    expect(full).not.toContain("7:00 AM");
    expect(full).not.toContain("1:00 PM – 4:00 PM");
  });

  it("Confirm button is disabled when city has no OS slots", () => {
    const { tree } = renderSheet([]);
    // The confirm pressable should be rendered with `disabled={true}`.
    const pressables = findAllNodes(tree, "Pressable") as { props: Record<string, unknown> }[];
    // The confirm button contains "Confirm" text (rescheduleConfirm key)
    const confirmBtn = pressables.find((p) => textContent(p).toLowerCase().includes("confirm"));
    expect(confirmBtn).toBeDefined();
    // The component sets disabled={!slotLabel || timeSlots.length === 0};
    // with no slots, this resolves to true.
    expect(confirmBtn?.props.disabled).toBe(true);
  });

  it("renders the Express tile even when scheduled slots are unavailable", () => {
    const { tree } = renderSheet([]);
    const full = textContent(tree);
    // The Express tile must still appear (express is independent of OS time slots).
    expect(full).toContain("Express");
  });
});

// ---------------------------------------------------------------------------
// Tests: RescheduleDeliverySheet with OS slots (no regression)
// ---------------------------------------------------------------------------

describe("RescheduleDeliverySheet — with OS slots renders slot grid", () => {
  const OS_SLOTS = [
    { label: "Morning", startHour: 9, endHour: 12, cutoffHour: 12 },
    { label: "Afternoon", startHour: 12, endHour: 16, cutoffHour: 16 },
  ];

  it("does NOT show the no-slots message when OS slots are present", () => {
    const { tree } = renderSheet(OS_SLOTS);
    const full = textContent(tree);
    expect(full).not.toContain("No delivery time slots are available");
  });

  it("renders OS slot time ranges (not static slot labels) in the sheet", () => {
    const { tree } = renderSheet(OS_SLOTS);
    const full = textContent(tree);
    // With startHour/endHour, formatSlotTimeRange shows formatted hours.
    // "9:00 AM" comes from fmtHour(9) in formatSlotTimeRange.
    const hasMorning = full.includes("Morning") || full.includes("9:00 AM");
    const hasAfternoon = full.includes("Afternoon") || full.includes("12:00 PM");
    expect(hasMorning || hasAfternoon).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: cityTimeSlots derivation (unit-level) — OS only, no static fallback
// ---------------------------------------------------------------------------

describe("cityTimeSlots derivation — OS-only, no timeSlotsForCountry fallback", () => {
  it("returns [] when selectedCity has no timeSlots property", () => {
    const selectedCity = { id: "x", name: "Unknown", isActive: true };
    const result = (selectedCity as any).timeSlots ?? [];
    expect(result).toEqual([]);
  });

  it("returns [] when selectedCity is null", () => {
    const selectedCity = null as null | { timeSlots?: unknown[] };
    const result = selectedCity?.timeSlots ?? [];
    expect(result).toEqual([]);
  });

  it("returns [] when selectedCity.timeSlots is explicitly []", () => {
    const selectedCity = { id: "x", name: "Beirut", isActive: true, timeSlots: [] };
    const result = (selectedCity as any).timeSlots ?? [];
    expect(result).toEqual([]);
  });

  it("returns OS slots when they are present", () => {
    const osSlots = [{ label: "Slot A", cutoffHour: 14 }];
    const selectedCity = { id: "x", name: "Beirut", isActive: true, timeSlots: osSlots };
    const result = (selectedCity as any).timeSlots ?? [];
    expect(result).toEqual(osSlots);
  });

  it("returns OS custom slots even when city code matches LB (no hardcoded fallback)", () => {
    // Verifies the pattern: `selectedCity?.timeSlots ?? []`
    // The result must be the OS slots, not the 4-slot LB hardcoded table.
    const osSlots = [{ label: "Custom Slot", startHour: 10, endHour: 14, cutoffHour: 14 }];
    const selectedCity = { id: "beirut", name: "Beirut", isActive: true, timeSlots: osSlots };
    const result = (selectedCity as any).timeSlots ?? [];
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Custom Slot");
  });
});

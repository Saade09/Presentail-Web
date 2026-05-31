/**
 * Unit tests for <SlotPicker />.
 *
 * Covered scenarios
 * -----------------
 * Slot rendering
 *   - All slot labels for a given country are shown
 *   - One Pressable tile is rendered per slot
 *
 * Disabled slots on today
 *   - Slots whose cutoffHour has already passed on today are suppressed
 *     (onSelectSlot is not called when their tile is pressed)
 *   - Slots whose cutoffHour is still in the future on today are available
 *   - All slots on a future date are available regardless of localHour
 *
 * Slot selection callback
 *   - Pressing an available tile calls onSelectSlot with the full TimeSlot object
 *   - The active (selected) slot tile has the primary background colour
 *   - Inactive tiles have white background
 */

import React from "react";
import * as RTR from "react-test-renderer";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { SlotPicker, type SlotPickerColors } from "@/components/SlotPicker";
import { timeSlotsForCountry, type TimeSlot } from "@workspace/delivery";

// ---------------------------------------------------------------------------
// Helpers — replicated locally to avoid coupling to test-utils internals
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

function findPressableWithText(tree: unknown, search: string) {
  const pressables = findAllNodes(tree, "Pressable");
  return pressables.find((p) => textContent(p).includes(search)) as
    | { props: Record<string, unknown>; children?: unknown[] }
    | undefined;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COLORS: SlotPickerColors = {
  primary: "#2b1a0e",
  border: "#e0d6cc",
  mutedForeground: "#9e8977",
};

const TODAY_ISO = "2026-06-01";
const FUTURE_ISO = "2026-06-02";

// Lebanon slot table (cutoffHours: 9, 14, 18, 21)
const LB_SLOTS = timeSlotsForCountry("LB");
// UAE slot table (cutoffHours: 7, 13, 16, 20)
const AE_SLOTS = timeSlotsForCountry("AE");

function render(overrides: Partial<Parameters<typeof SlotPicker>[0]> = {}) {
  const props: Parameters<typeof SlotPicker>[0] = {
    slots: LB_SLOTS,
    selectedSlotLabel: null,
    date: FUTURE_ISO,
    todayIso: TODAY_ISO,
    localHour: 10,
    onSelectSlot: vi.fn(),
    colors: COLORS,
    ...overrides,
  };
  let instance!: RTR.ReactTestRenderer;
  act(() => {
    instance = RTR.create(<SlotPicker {...props} />);
  });
  return { tree: instance.toJSON() as unknown, instance };
}

// ---------------------------------------------------------------------------
// Tests — slot rendering
// ---------------------------------------------------------------------------

describe("SlotPicker — slot rendering", () => {
  it("renders all Lebanon slot labels", () => {
    const { tree } = render({ slots: LB_SLOTS });
    for (const s of LB_SLOTS) {
      expect(textContent(tree)).toContain(s.label);
    }
  });

  it("renders all UAE slot labels", () => {
    const { tree } = render({ slots: AE_SLOTS });
    for (const s of AE_SLOTS) {
      expect(textContent(tree)).toContain(s.label);
    }
  });

  it("renders one Pressable tile per slot", () => {
    const { tree } = render({ slots: LB_SLOTS });
    const pressables = findAllNodes(tree, "Pressable");
    expect(pressables).toHaveLength(LB_SLOTS.length);
  });

  it("renders nothing when slots array is empty", () => {
    const { tree } = render({ slots: [] });
    const pressables = findAllNodes(tree, "Pressable");
    expect(pressables).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — disabled slots on today
// ---------------------------------------------------------------------------

describe("SlotPicker — disabled slots on today", () => {
  it("past slot (cutoffHour <= localHour) does not call onSelectSlot when pressed", () => {
    // localHour=15, LB slot cutoffHour=9 → past
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: TODAY_ISO, todayIso: TODAY_ISO, localHour: 15, onSelectSlot });

    // First LB slot: "9:00 AM – 2:00 PM" (cutoffHour 9)
    const pastTile = findPressableWithText(tree, "9:00 AM");
    act(() => {
      (pastTile?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("all past slots on today are suppressed (cutoffHour 9 and 14 with localHour=15)", () => {
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: TODAY_ISO, todayIso: TODAY_ISO, localHour: 15, onSelectSlot });

    // LB slots with cutoffHour <= 15: "9:00 AM – 2:00 PM" (9) and "2:00 PM – 6:00 PM" (14)
    const pastSlots = LB_SLOTS.filter((s) => s.cutoffHour <= 15);
    expect(pastSlots.length).toBeGreaterThan(0);
    for (const s of pastSlots) {
      const tile = findPressableWithText(tree, s.label);
      act(() => {
        (tile?.props.onPress as (() => void) | undefined)?.();
      });
    }
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("available slot on today (cutoffHour > localHour) calls onSelectSlot when pressed", () => {
    // localHour=15, LB slot cutoffHour=18 → available
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: TODAY_ISO, todayIso: TODAY_ISO, localHour: 15, onSelectSlot });

    // Third LB slot: "6:00 PM – 9:00 PM" (cutoffHour 18)
    const availTile = findPressableWithText(tree, "6:00 PM – 9:00 PM");
    act(() => {
      (availTile?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onSelectSlot).toHaveBeenCalledOnce();
    expect(onSelectSlot).toHaveBeenCalledWith(LB_SLOTS[2]);
  });

  it("all slots on a future date are available even at localHour=23", () => {
    // date is tomorrow — no slots should be disabled
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: FUTURE_ISO, todayIso: TODAY_ISO, localHour: 23, onSelectSlot });

    // First LB slot (cutoffHour=9) would be "past" if today, but date is tomorrow
    const firstTile = findPressableWithText(tree, "9:00 AM – 2:00 PM");
    act(() => {
      (firstTile?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onSelectSlot).toHaveBeenCalledWith(LB_SLOTS[0]);
  });

  it("boundary: slot whose cutoffHour equals localHour exactly is disabled", () => {
    // localHour=14, LB slot cutoffHour=14 → past (>= comparison)
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: TODAY_ISO, todayIso: TODAY_ISO, localHour: 14, onSelectSlot });

    const boundaryTile = findPressableWithText(tree, "2:00 PM – 6:00 PM");
    act(() => {
      (boundaryTile?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it("boundary: slot with cutoffHour one above localHour is still available", () => {
    // localHour=13, LB slot cutoffHour=14 → still available
    const onSelectSlot = vi.fn();
    const { tree } = render({ date: TODAY_ISO, todayIso: TODAY_ISO, localHour: 13, onSelectSlot });

    const tile = findPressableWithText(tree, "2:00 PM – 6:00 PM");
    act(() => {
      (tile?.props.onPress as (() => void) | undefined)?.();
    });
    expect(onSelectSlot).toHaveBeenCalledWith(LB_SLOTS[1]);
  });
});

// ---------------------------------------------------------------------------
// Tests — slot selection callback and visual state
// ---------------------------------------------------------------------------

describe("SlotPicker — selection callback and visual feedback", () => {
  it("calls onSelectSlot with the exact TimeSlot object", () => {
    const onSelectSlot = vi.fn();
    const { tree } = render({ onSelectSlot, localHour: 8 });

    const secondSlot = LB_SLOTS[1];
    const tile = findPressableWithText(tree, secondSlot.label);
    act(() => {
      (tile?.props.onPress as (() => void) | undefined)?.();
    });

    expect(onSelectSlot).toHaveBeenCalledOnce();
    const arg = (onSelectSlot.mock.calls[0] as [TimeSlot])[0];
    expect(arg.label).toBe(secondSlot.label);
    expect(arg.cutoffHour).toBe(secondSlot.cutoffHour);
  });

  it("active slot tile has primary background colour", () => {
    const activeSlot = LB_SLOTS[1];
    const { tree } = render({ selectedSlotLabel: activeSlot.label });
    const activeTile = findPressableWithText(tree, activeSlot.label);
    expect((activeTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe(COLORS.primary);
  });

  it("inactive slot tiles have white background", () => {
    const { tree } = render({ selectedSlotLabel: LB_SLOTS[0].label });
    const inactiveTile = findPressableWithText(tree, LB_SLOTS[1].label);
    expect((inactiveTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe("#fff");
  });

  it("no slot selected: all tiles have white or dimmed background", () => {
    const { tree } = render({ selectedSlotLabel: null, date: FUTURE_ISO, localHour: 8 });
    for (const s of LB_SLOTS) {
      const tile = findPressableWithText(tree, s.label);
      const bg = (tile?.props.style as Record<string, unknown>)?.backgroundColor;
      // Neither should be the primary colour since nothing is selected
      expect(bg).not.toBe(COLORS.primary);
    }
  });
});

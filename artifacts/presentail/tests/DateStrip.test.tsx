/**
 * Unit tests for <DateStrip />.
 *
 * Covered scenarios
 * -----------------
 * Rendering
 *   - All day labels (Today / Tomorrow / weekday abbreviations) are shown
 *   - All day-of-month numbers are shown
 *
 * Today highlight
 *   - The tile for today has the primary background colour when it is selected
 *   - All other tiles have white background when a different date is selected
 *
 * Navigation / ISO output
 *   - Pressing a tile calls onSelectDate with that day's exact ISO string
 *   - Pressing today's tile from a different selection calls back with today's ISO
 */

import React from "react";
import * as RTR from "react-test-renderer";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateStrip, type DateStripColors } from "@/components/DateStrip";
import type { DeliveryDay } from "@workspace/delivery";

// ---------------------------------------------------------------------------
// Helpers — replicated locally so this test has no coupling to test-utils internals
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

const COLORS: DateStripColors = {
  primary: "#2b1a0e",
  border: "#e0d6cc",
  mutedForeground: "#9e8977",
  goldSoft: "#f0d9b5",
};

/** Fixed days array so tests never depend on the real wall-clock date. */
function makeDays(): DeliveryDay[] {
  return [
    { iso: "2026-06-01", label: "Today",    day: "Mon", date: "1", full: "Monday, June 1, 2026" },
    { iso: "2026-06-02", label: "Tomorrow", day: "Tue", date: "2", full: "Tuesday, June 2, 2026" },
    { iso: "2026-06-03", label: "Wed",      day: "Wed", date: "3", full: "Wednesday, June 3, 2026" },
    { iso: "2026-06-04", label: "Thu",      day: "Thu", date: "4", full: "Thursday, June 4, 2026" },
  ];
}

function render(props: Partial<Parameters<typeof DateStrip>[0]> = {}) {
  const days = props.days ?? makeDays();
  const selectedDate = props.selectedDate ?? days[0].iso;
  const onSelectDate = props.onSelectDate ?? vi.fn();
  let instance!: RTR.ReactTestRenderer;
  act(() => {
    instance = RTR.create(
      <DateStrip
        days={days}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        colors={COLORS}
        {...props}
      />,
    );
  });
  const tree = instance.toJSON() as unknown;
  return { tree, instance };
}

// ---------------------------------------------------------------------------
// Tests — rendering
// ---------------------------------------------------------------------------

describe("DateStrip — rendering", () => {
  it("renders all day labels", () => {
    const days = makeDays();
    const { tree } = render({ days });
    for (const d of days) {
      expect(textContent(tree)).toContain(d.label);
    }
  });

  it("renders all day-of-month numbers", () => {
    const days = makeDays();
    const { tree } = render({ days });
    for (const d of days) {
      expect(textContent(tree)).toContain(d.date);
    }
  });

  it("renders one Pressable tile per day", () => {
    const days = makeDays();
    const { tree } = render({ days });
    const pressables = findAllNodes(tree, "Pressable");
    expect(pressables).toHaveLength(days.length);
  });
});

// ---------------------------------------------------------------------------
// Tests — today highlight
// ---------------------------------------------------------------------------

describe("DateStrip — today highlight", () => {
  it("the selected day tile has the primary background colour", () => {
    const days = makeDays();
    const { tree } = render({ days, selectedDate: "2026-06-01" });
    const todayTile = findPressableWithText(tree, "Today");
    expect((todayTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe(COLORS.primary);
  });

  it("unselected day tiles have a white background", () => {
    const days = makeDays();
    const { tree } = render({ days, selectedDate: "2026-06-01" });
    const tomorrowTile = findPressableWithText(tree, "Tomorrow");
    expect((tomorrowTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe("#fff");
  });

  it("selecting a middle day highlights that tile and leaves others white", () => {
    const days = makeDays();
    const { tree } = render({ days, selectedDate: "2026-06-03" });
    const wedTile = findPressableWithText(tree, "Wed");
    const todayTile = findPressableWithText(tree, "Today");
    expect((wedTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe(COLORS.primary);
    expect((todayTile?.props.style as Record<string, unknown>)?.backgroundColor).toBe("#fff");
  });
});

// ---------------------------------------------------------------------------
// Tests — navigation / ISO output
// ---------------------------------------------------------------------------

describe("DateStrip — navigation and correct ISO output", () => {
  it("pressing a day tile calls onSelectDate with that day's ISO string", () => {
    const days = makeDays();
    const onSelectDate = vi.fn();
    const { tree } = render({ days, selectedDate: days[0].iso, onSelectDate });

    const tomorrowTile = findPressableWithText(tree, "Tomorrow");
    act(() => {
      (tomorrowTile?.props.onPress as (() => void) | undefined)?.();
    });

    expect(onSelectDate).toHaveBeenCalledOnce();
    expect(onSelectDate).toHaveBeenCalledWith("2026-06-02");
  });

  it("pressing today's tile calls onSelectDate with today's ISO", () => {
    const days = makeDays();
    const onSelectDate = vi.fn();
    const { tree } = render({ days, selectedDate: "2026-06-03", onSelectDate });

    const todayTile = findPressableWithText(tree, "Today");
    act(() => {
      (todayTile?.props.onPress as (() => void) | undefined)?.();
    });

    expect(onSelectDate).toHaveBeenCalledWith("2026-06-01");
  });

  it("pressing the third day calls onSelectDate with the third day's ISO", () => {
    const days = makeDays();
    const onSelectDate = vi.fn();
    const { tree } = render({ days, selectedDate: days[0].iso, onSelectDate });

    const thuTile = findPressableWithText(tree, "Thu");
    act(() => {
      (thuTile?.props.onPress as (() => void) | undefined)?.();
    });

    expect(onSelectDate).toHaveBeenCalledWith("2026-06-04");
  });

  it("each press fires exactly once per tap", () => {
    const days = makeDays();
    const onSelectDate = vi.fn();
    const { tree } = render({ days, selectedDate: days[0].iso, onSelectDate });

    const tomorrowTile = findPressableWithText(tree, "Tomorrow");
    act(() => {
      (tomorrowTile?.props.onPress as (() => void) | undefined)?.();
      (tomorrowTile?.props.onPress as (() => void) | undefined)?.();
    });

    expect(onSelectDate).toHaveBeenCalledTimes(2);
    expect(onSelectDate).toHaveBeenNthCalledWith(1, "2026-06-02");
    expect(onSelectDate).toHaveBeenNthCalledWith(2, "2026-06-02");
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TimeSlot } from "@workspace/delivery";
import { ScheduleInlinePanel } from "./ScheduleInlinePanel";
import { renderWithProviders } from "@/test-utils";

// jsdom does not implement window.matchMedia. Provide a configurable mock so
// individual tests can simulate mobile (matches=true) or desktop (matches=false).
function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Default to desktop (non-mobile) so existing tests are unaffected.
beforeEach(() => mockMatchMedia(false));
afterEach(() => vi.restoreAllMocks());

// Pin getCountryHour to 10 AM so time-slot availability is stable regardless
// of when the test suite runs. Without this, tests that rely on "today" having
// available slots break after 9 PM Lebanon time (all LB slots have cutoffHour
// ≤ 21).
//
// Also pin getLocalIso to the UTC calendar date so the component's todayIso and
// the test helper addDays(0) always agree, even when the test suite runs between
// 21:00 UTC and midnight UTC (= early Beirut morning of the next day), where the
// two would otherwise diverge and make most assertions about "today" wrong.
vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return {
    ...actual,
    getCountryHour: () => 10,
    getLocalIso: () => new Date().toISOString().slice(0, 10),
  };
});

const LOCALE_T: Record<string, string> = {
  "product.prevMonth": "Previous month",
  "product.nextMonth": "Next month",
  "product.calendarAria": "Open calendar",
  "checkout.deliveryDate": "Delivery date",
  "checkout.deliveryTime": "Delivery time",
  "product.midnightDelivery": "Midnight Delivery",
  "product.midnightArrivesAs": "Arrives between 11 PM {start} and 1 AM on {end}",
  "product.deliveryExtraFee": "+{fee}",
};

const locale = {
  t: (key: string) => LOCALE_T[key] ?? key,
  language: "en" as const,
  dir: "ltr" as const,
};

// Compute anchors relative to the real clock so the strip is always
// predictable: strip = [today, today+1, today+2]; anything ≥ today+10
// is definitely outside it.
function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const TODAY_ISO = addDays(0);
const TOMORROW_ISO = addDays(1);
const DAY3_ISO = addDays(2);
const FAR_DATE_ISO = addDays(30); // always outside the 3-day strip

// ---------------------------------------------------------------------------
// Synthetic chip behaviour — render-only (no interactions, no fake timers)
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — synthetic chip for out-of-strip dates", () => {
  it("renders a synthetic chip when initialDate is outside the 3-day strip", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();
  });

  it("does NOT render a synthetic chip when today is selected (in the strip)", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    // Today is in the strip → exactly one chip for TODAY_ISO, no synthetic duplicate.
    const chips = screen.getAllByTestId(`schedule-day-${TODAY_ISO}`);
    expect(chips).toHaveLength(1);
  });

  it("does NOT render a synthetic chip when tomorrow is selected (in the strip)", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        onChange={() => {}}
      />,
      { locale },
    );
    const chips = screen.getAllByTestId(`schedule-day-${TOMORROW_ISO}`);
    expect(chips).toHaveLength(1);
  });

  it("does NOT render a synthetic chip when the third strip day is selected", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={DAY3_ISO}
        onChange={() => {}}
      />,
      { locale },
    );
    const chips = screen.getAllByTestId(`schedule-day-${DAY3_ISO}`);
    expect(chips).toHaveLength(1);
  });
});

describe("ScheduleInlinePanel — Premium Midnight Delivery", () => {
  const standardSlot: TimeSlot = {
    label: "2 PM – 6 PM",
    slotId: "os-standard",
    startHour: 14,
    endHour: 18,
    cutoffHour: 12,
    nextDayEnabled: true,
  };
  const midnightSlot: TimeSlot = {
    label: "11 PM – 1 AM",
    slotId: "os-midnight-beirut",
    serviceType: "midnight",
    startHour: 23,
    endHour: 1,
    cutoffHour: 20,
    nextDayEnabled: true,
    extraFee: 13,
  };

  it("shows the exact OS slot with a $20 fee and reveals the accessible banner", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        cityId="lb-beirut"
        initialDate={TOMORROW_ISO}
        initialSlotLabel={standardSlot.label}
        initialSlotId={standardSlot.slotId}
        timeSlots={[standardSlot, midnightSlot]}
        onChange={onChange}
      />,
      { locale },
    );

    const midnightButton = screen.getByTestId(
      "schedule-slot-os-midnight-beirut",
    );
    expect(midnightButton.getAttribute("aria-pressed")).toBe("false");
    expect(midnightButton.textContent).toContain("20");
    expect(midnightButton.textContent).not.toContain("13");

    fireEvent.click(midnightButton);
    expect(midnightButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("midnight-delivery-banner")).toBeTruthy();
    expect(screen.getByText("Midnight Delivery")).toBeTruthy();
    const promiseDate = new Date(`${DAY3_ISO}T12:00:00`);
    const expectedPromiseDate = `${promiseDate.toLocaleDateString("en-US", { weekday: "short" })}, ${promiseDate.getDate()} ${promiseDate.toLocaleDateString("en-US", { month: "short" })}`;
    expect(screen.getByTestId("midnight-delivery-banner").textContent).toContain(
      `1 AM on ${expectedPromiseDate}`,
    );
    expect(screen.getByTestId("midnight-delivery-banner").textContent).not.toContain(
      "tonight",
    );
    expect(screen.getByTestId("midnight-delivery-banner").textContent).toContain(
      `11 PM on ${new Date(`${TOMORROW_ISO}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}, ${new Date(`${TOMORROW_ISO}T12:00:00`).getDate()} ${new Date(`${TOMORROW_ISO}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}`,
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          slotId: "os-midnight-beirut",
          serviceType: "midnight",
          cityId: "lb-beirut",
        }),
      ),
    );
  });

  it("uses tonight for a midnight slot selected for the storefront's current date", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        cityId="lb-beirut"
        initialDate={TODAY_ISO}
        initialSlotLabel={standardSlot.label}
        initialSlotId={standardSlot.slotId}
        timeSlots={[standardSlot, midnightSlot]}
        onChange={() => {}}
      />,
      { locale },
    );

    fireEvent.click(screen.getByTestId("schedule-slot-os-midnight-beirut"));

    const tomorrow = new Date(`${TOMORROW_ISO}T12:00:00`);
    const tomorrowLabel = `${tomorrow.toLocaleDateString("en-US", { weekday: "short" })}, ${tomorrow.getDate()} ${tomorrow.toLocaleDateString("en-US", { month: "short" })}`;
    expect(screen.getByTestId("midnight-delivery-banner").textContent).toContain(
      `Arrives between 11 PM tonight and 1 AM on ${tomorrowLabel}`,
    );
    expect(screen.getByTestId("midnight-delivery-banner").textContent).not.toContain(
      "the day before",
    );
  });

  it("never exposes a configured Midnight slot outside Beirut or Metn", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        cityId="lb-tripoli"
        initialDate={TOMORROW_ISO}
        initialSlotLabel={standardSlot.label}
        timeSlots={[standardSlot, midnightSlot]}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(
      screen.queryByTestId("schedule-slot-os-midnight-beirut"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// onChange wiring — render-only (no fake timers)
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — onChange callback", () => {
  it("calls onChange with mode='today_slot' when today is the selected date", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    // The component fires onChange immediately on mount via useEffect.
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as {
      mode: string;
      date: string;
      slotLabel: string;
    };
    expect(lastCall.mode).toBe("today_slot");
    expect(lastCall.date).toBe(TODAY_ISO);
    expect(typeof lastCall.slotLabel).toBe("string");
    expect(lastCall.slotLabel.length).toBeGreaterThan(0);
  });

  it("calls onChange with mode='schedule' when a future date is selected", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as {
      mode: string;
      date: string;
    };
    expect(lastCall.mode).toBe("schedule");
    expect(lastCall.date).toBe(FAR_DATE_ISO);
  });

  it("does not select a static country slot when OS supplies no slots", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={[]}
        onChange={onChange}
      />,
      { locale },
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId(/^schedule-slot-/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Time slot tests — controlled via the timeSlots prop so results are
// deterministic regardless of the real wall clock or local hour.
// cutoffHour=0  → always past on today  (localHour is always ≥ 0)
// cutoffHour=24 → never past            (localHour is always < 24)
// ---------------------------------------------------------------------------

const FIXED_SLOTS = [
  { label: "Morning", cutoffHour: 0 },
  { label: "Evening", cutoffHour: 24 },
];

describe("ScheduleInlinePanel — time slot rendering", () => {
  it("renders a button for each provided time slot", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.getByTestId("schedule-slot-0")).toBeTruthy();
    expect(screen.getByTestId("schedule-slot-24")).toBeTruthy();
  });

  it("disables a slot whose cutoffHour has passed when the selected date is today", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    const morningBtn = screen.getByTestId("schedule-slot-0") as HTMLButtonElement;
    expect(morningBtn.disabled).toBe(true);
  });

  it("does not disable any slot when the selected date is in the future", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    const morningBtn = screen.getByTestId("schedule-slot-0") as HTMLButtonElement;
    expect(morningBtn.disabled).toBe(false);
    const eveningBtn = screen.getByTestId("schedule-slot-24") as HTMLButtonElement;
    expect(eveningBtn.disabled).toBe(false);
  });

  it("clicking an enabled slot is reflected in the next onChange call", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Use a future date so both slots are enabled; firstAvailableSlot returns
    // "Morning" (cutoffHour=0 is always the first entry). Then click "Evening"
    // to produce a genuine state change and a new onChange emission.
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    // Clear the mount-time call so we can assert clean interaction output.
    onChange.mockClear();
    await user.click(screen.getByTestId("schedule-slot-24"));
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as {
      mode: string;
      date: string;
      slotLabel: string;
    };
    expect(lastCall.slotLabel).toBe("Evening");
    expect(lastCall.date).toBe(TOMORROW_ISO);
  });

  it("clicking a disabled slot does not trigger another onChange call", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    onChange.mockClear();
    await user.click(screen.getByTestId("schedule-slot-0"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Interaction tests — real timers so userEvent clicks don't time out
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — interactions", () => {
  it("synthetic chip disappears after a strip date is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();

    await user.click(screen.getByTestId(`schedule-day-${TODAY_ISO}`));

    expect(screen.queryByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeNull();
  });

  it("updates onChange output when the user picks a different strip date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    await user.click(screen.getByTestId(`schedule-day-${TOMORROW_ISO}`));
    const lastCall = onChange.mock.calls.at(-1)![0] as {
      mode: string;
      date: string;
    };
    expect(lastCall.mode).toBe("schedule");
    expect(lastCall.date).toBe(TOMORROW_ISO);
  });

  it("shows the CalendarPopover after clicking the calendar toggle chip", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByTestId("calendar-popover")).toBeNull();

    await user.click(screen.getByTestId("schedule-calendar-toggle"));

    expect(screen.getByTestId("calendar-popover")).toBeTruthy();
  });

  it("slot tiles with startHour/endHour do NOT render the slot name label", async () => {
    const HOUR_SLOTS = [
      { label: "Morning", cutoffHour: 0, startHour: 9, endHour: 12 },
      { label: "Afternoon", cutoffHour: 24, startHour: 12, endHour: 16 },
    ];
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        timeSlots={HOUR_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByText("Morning")).toBeNull();
    expect(screen.queryByText("Afternoon")).toBeNull();
    expect(screen.getByTestId("schedule-slot-0")).toBeTruthy();
    expect(screen.getByTestId("schedule-slot-24")).toBeTruthy();
  });

  it("sorts OS-sourced slots by startHour, not by cutoffHour", () => {
    // These slots have cutoffHour and startHour in opposite order.
    // Old sort (by cutoffHour): Evening first, Morning second → wrong display order.
    // New sort (by startHour): Morning first, Evening second → correct display order.
    const OS_SLOTS = [
      { label: "Evening", cutoffHour: 8, startHour: 18, endHour: 22 },
      { label: "Morning", cutoffHour: 20, startHour: 9, endHour: 13 },
    ];
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        timeSlots={OS_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    // schedule-slot-{cutoffHour}: Morning has cutoffHour=20, Evening has cutoffHour=8
    const morningBtn = screen.getByTestId("schedule-slot-20");
    const eveningBtn = screen.getByTestId("schedule-slot-8");
    // Morning (startHour=9) must appear before Evening (startHour=18) in the DOM.
    // DOCUMENT_POSITION_FOLLOWING (4) means morningBtn precedes eveningBtn.
    expect(
      morningBtn.compareDocumentPosition(eveningBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("pre-selects the earliest slot by startHour for a future date, not nearest to current hour", () => {
    // getCountryHour is mocked to 10. With the old sort (by cutoffHour), Evening
    // (cutoffHour=8) would be slots[0] and get pre-selected for a future date.
    // After the fix (sort by startHour), Morning (startHour=9) is slots[0].
    const OS_SLOTS = [
      { label: "Evening", cutoffHour: 8, startHour: 18, endHour: 22 },
      { label: "Morning", cutoffHour: 20, startHour: 9, endHour: 13 },
    ];
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        timeSlots={OS_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    const lastCall = onChange.mock.calls.at(-1)![0] as { slotLabel: string };
    expect(lastCall.slotLabel).toBe("Morning");
  });

  it("seeds and renders only the selected weekday's OS slots", async () => {
    const weekday = new Date(`${TOMORROW_ISO}T12:00:00`)
      .toLocaleDateString("en-US", { weekday: "long" })
      .toLowerCase();
    const onChange = vi.fn();

    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        cityId="lb-beirut"
        initialDate={TOMORROW_ISO}
        timeSlots={[
          {
            label: "Made-up flat slot",
            slotId: "flat-made-up",
            cutoffHour: 9,
            startHour: 9,
            endHour: 13,
          },
        ]}
        slotsByDay={{
          [weekday]: [
            {
              label: "OS Thursday",
              slotId: "os-thursday",
              cutoffHour: 14,
              startHour: 14,
              endHour: 18,
            },
          ],
        }}
        onChange={onChange}
      />,
      { locale },
    );

    expect(screen.queryByTestId("schedule-slot-flat-made-up")).toBeNull();
    expect(screen.getByTestId("schedule-slot-os-thursday")).toBeTruthy();
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          date: TOMORROW_ISO,
          slotLabel: "OS Thursday",
          slotId: "os-thursday",
        }),
      );
    });
  });

  it("shows the desktop popover (not the modal backdrop) when viewport is wide", async () => {
    // matchMedia already mocked to matches=false (desktop) in beforeEach.
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={() => {}}
      />,
      { locale },
    );
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    expect(screen.getByTestId("calendar-popover")).toBeTruthy();
    expect(screen.queryByTestId("calendar-modal-backdrop")).toBeNull();
  });

  it("picking a date from the CalendarPopover creates a synthetic chip and closes the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );

    // Open the calendar popover.
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    expect(screen.getByTestId("calendar-popover")).toBeTruthy();

    // Navigate forward enough months so a known far-future date is visible.
    // FAR_DATE_ISO is addDays(30) which is 1–2 months ahead.
    const farYear = parseInt(FAR_DATE_ISO.slice(0, 4));
    const farMonth = parseInt(FAR_DATE_ISO.slice(5, 7)) - 1; // 0-indexed
    const todayYear = new Date().getFullYear();
    const todayMonth = new Date().getMonth();
    const monthsAhead = (farYear - todayYear) * 12 + (farMonth - todayMonth);
    for (let i = 0; i < monthsAhead; i++) {
      await user.click(screen.getByLabelText("Next month"));
    }

    // Pick the far date from the calendar.
    await user.click(screen.getByTestId(`cal-day-${FAR_DATE_ISO}`));

    // The popover closes automatically after picking.
    expect(screen.queryByTestId("calendar-popover")).toBeNull();

    // A synthetic chip should now show the picked date.
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();

    // onChange should carry the new date.
    const lastCall = onChange.mock.calls.at(-1)![0] as {
      mode: string;
      date: string;
    };
    expect(lastCall.date).toBe(FAR_DATE_ISO);
    expect(lastCall.mode).toBe("schedule");
  });
});

// ---------------------------------------------------------------------------
// Mobile modal — viewport < 640 px (matchMedia mocked to matches=true)
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — mobile modal (viewport < 640 px)", () => {
  beforeEach(() => mockMatchMedia(true));

  it("shows the modal backdrop (not the desktop popover) when viewport is mobile", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByTestId("calendar-modal-backdrop")).toBeNull();
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    expect(screen.getByTestId("calendar-modal-backdrop")).toBeTruthy();
    expect(screen.getByTestId("calendar-popover")).toBeTruthy();
  });

  it("closes the modal when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    expect(screen.getByTestId("calendar-modal-backdrop")).toBeTruthy();

    // Click the backdrop itself (not the inner calendar).
    await user.click(screen.getByTestId("calendar-modal-backdrop"));
    expect(screen.queryByTestId("calendar-modal-backdrop")).toBeNull();
  });

  it("closes the modal when the Escape key is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    expect(screen.getByTestId("calendar-modal-backdrop")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("calendar-modal-backdrop")).toBeNull();
  });

  it("keeps the modal open when the calendar itself is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={() => {}}
      />,
      { locale },
    );
    await user.click(screen.getByTestId("schedule-calendar-toggle"));
    // Click the CalendarPopover container — should NOT close the modal.
    await user.click(screen.getByTestId("calendar-popover"));
    expect(screen.getByTestId("calendar-modal-backdrop")).toBeTruthy();
  });

  it("closes the modal and creates a synthetic chip after picking a date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        timeSlots={FIXED_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    await user.click(screen.getByTestId("schedule-calendar-toggle"));

    // Navigate forward enough months so FAR_DATE_ISO is visible.
    const farYear = parseInt(FAR_DATE_ISO.slice(0, 4));
    const farMonth = parseInt(FAR_DATE_ISO.slice(5, 7)) - 1;
    const todayYear = new Date().getFullYear();
    const todayMonth = new Date().getMonth();
    const monthsAhead = (farYear - todayYear) * 12 + (farMonth - todayMonth);
    for (let i = 0; i < monthsAhead; i++) {
      await user.click(screen.getByLabelText("Next month"));
    }
    await user.click(screen.getByTestId(`cal-day-${FAR_DATE_ISO}`));

    // Modal closes after picking.
    expect(screen.queryByTestId("calendar-modal-backdrop")).toBeNull();
    // Synthetic chip appears.
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();
    // onChange carries the picked date.
    const lastCall = onChange.mock.calls.at(-1)![0] as { mode: string; date: string };
    expect(lastCall.date).toBe(FAR_DATE_ISO);
    expect(lastCall.mode).toBe("schedule");
  });
});

// ---------------------------------------------------------------------------
// Auto-switch to tomorrow when today has no available slots
// ---------------------------------------------------------------------------
// Simulate all timeslots having passed (cutoffHour 9 < mocked localHour 10).
// The component must ignore the parent-supplied today date and default to tomorrow.

describe("ScheduleInlinePanel — auto-switch to tomorrow when today has no slots", () => {
  const PAST_SLOTS: TimeSlot[] = [{ label: "9 AM–11 AM", cutoffHour: 9, startHour: 9 }];

  it("selects tomorrow by default when parent seeds today but every slot has passed", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        timeSlots={PAST_SLOTS}
        initialDate={TODAY_ISO}
        onChange={onChange}
      />,
      { locale },
    );

    // Today's chip must not appear — no bookable slots remain.
    expect(screen.queryByTestId(`schedule-day-${TODAY_ISO}`)).toBeNull();

    // Tomorrow's chip must be present and selected.
    const tomorrowChip = screen.getByTestId(`schedule-day-${TOMORROW_ISO}`);
    expect(tomorrowChip).toBeTruthy();
    expect(tomorrowChip.getAttribute("aria-pressed")).toBe("true");

    // onChange must fire with tomorrow and mode='schedule'.
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0] as { mode: string; date: string };
    expect(lastCall.date).toBe(TOMORROW_ISO);
    expect(lastCall.mode).toBe("schedule");
  });

  it("slot chips for tomorrow are all enabled (not disabled) after the auto-switch", () => {
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        timeSlots={PAST_SLOTS}
        initialDate={TODAY_ISO}
        onChange={() => {}}
      />,
      { locale },
    );
    // After switching to tomorrow every slot is in the future → none disabled.
    const slotChips = screen.getAllByTestId(/^schedule-slot-/);
    expect(slotChips.length).toBeGreaterThan(0);
    slotChips.forEach((chip) => expect((chip as HTMLButtonElement).disabled).toBe(false));
  });

  it("ignores a stale today initialDate even when no initialDate is passed at all", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        timeSlots={PAST_SLOTS}
        onChange={onChange}
      />,
      { locale },
    );
    // With no initialDate the component should also land on tomorrow.
    expect(screen.queryByTestId(`schedule-day-${TODAY_ISO}`)).toBeNull();
    expect(screen.getByTestId(`schedule-day-${TOMORROW_ISO}`)).toBeTruthy();
    const lastCall = onChange.mock.calls.at(-1)![0] as { date: string };
    expect(lastCall.date).toBe(TOMORROW_ISO);
  });
});

// ---------------------------------------------------------------------------
// Duplicate-label slot configs — emitted slotId must match the displayed variant
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — duplicate-label slots emit the date-correct slotId", () => {
  const DUP_SLOTS: TimeSlot[] = [
    { label: "Night", slotId: "night-sameday-paid", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: true, nextDayEnabled: false, extraFee: 7 },
    { label: "Night", slotId: "night-nextday-free", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: false, nextDayEnabled: true, extraFee: 0 },
  ];

  it("emits the paid same-day variant's slotId for today", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel countryCode="LB" timeSlots={DUP_SLOTS} onChange={onChange} />,
      { locale },
    );
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as { slotLabel: string; slotId?: string };
    expect(last.slotLabel).toBe("Night");
    expect(last.slotId).toBe("night-sameday-paid");
  });

  it("emits the free next-day variant's slotId after switching to tomorrow", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel countryCode="LB" timeSlots={DUP_SLOTS} onChange={onChange} />,
      { locale },
    );
    onChange.mockClear();
    await user.click(screen.getByTestId(`schedule-day-${TOMORROW_ISO}`));
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0] as { slotLabel: string; slotId?: string };
    expect(last.slotLabel).toBe("Night");
    expect(last.slotId).toBe("night-nextday-free");
  });
});

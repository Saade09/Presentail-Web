// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleInlinePanel } from "./ScheduleInlinePanel";
import { renderWithProviders } from "@/test-utils";

// Pin getCountryHour to 10 AM so time-slot availability is stable regardless
// of when the test suite runs. Without this, tests that rely on "today" having
// available slots break after 9 PM Lebanon time (all LB slots have cutoffHour
// ≤ 21). All other exports from @workspace/delivery are passed through as-is.
vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return { ...actual, getCountryHour: () => 10 };
});

const LOCALE_T: Record<string, string> = {
  "product.prevMonth": "Previous month",
  "product.nextMonth": "Next month",
  "product.calendarAria": "Open calendar",
  "checkout.deliveryDate": "Delivery date",
  "checkout.deliveryTime": "Delivery time",
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
        onChange={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByTestId("calendar-popover")).toBeNull();

    await user.click(screen.getByTestId("schedule-calendar-toggle"));

    expect(screen.getByTestId("calendar-popover")).toBeTruthy();
  });

  it("picking a date from the CalendarPopover creates a synthetic chip and closes the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
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

// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleInlinePanel } from "./ScheduleInlinePanel";

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    t: (key: string) => {
      const strings: Record<string, string> = {
        "product.prevMonth": "Previous month",
        "product.nextMonth": "Next month",
        "product.calendarAria": "Open calendar",
        "checkout.deliveryDate": "Delivery date",
        "checkout.deliveryTime": "Delivery time",
      };
      return strings[key] ?? key;
    },
    language: "en",
    dir: "ltr",
  }),
}));

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
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();
  });

  it("does NOT render a synthetic chip when today is selected (in the strip)", () => {
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={() => {}}
      />,
    );
    // Today is in the strip → exactly one chip for TODAY_ISO, no synthetic duplicate.
    const chips = screen.getAllByTestId(`schedule-day-${TODAY_ISO}`);
    expect(chips).toHaveLength(1);
  });

  it("does NOT render a synthetic chip when tomorrow is selected (in the strip)", () => {
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TOMORROW_ISO}
        onChange={() => {}}
      />,
    );
    const chips = screen.getAllByTestId(`schedule-day-${TOMORROW_ISO}`);
    expect(chips).toHaveLength(1);
  });

  it("does NOT render a synthetic chip when the third strip day is selected", () => {
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={DAY3_ISO}
        onChange={() => {}}
      />,
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
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={onChange}
      />,
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
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        onChange={onChange}
      />,
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
// Interaction tests — real timers so userEvent clicks don't time out
// ---------------------------------------------------------------------------

describe("ScheduleInlinePanel — interactions", () => {
  it("synthetic chip disappears after a strip date is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={FAR_DATE_ISO}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeTruthy();

    await user.click(screen.getByTestId(`schedule-day-${TODAY_ISO}`));

    expect(screen.queryByTestId(`schedule-day-${FAR_DATE_ISO}`)).toBeNull();
  });

  it("updates onChange output when the user picks a different strip date", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={onChange}
      />,
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
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("calendar-popover")).toBeNull();

    await user.click(screen.getByTestId("schedule-calendar-toggle"));

    expect(screen.getByTestId("calendar-popover")).toBeTruthy();
  });

  it("picking a date from the CalendarPopover creates a synthetic chip and closes the popover", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ScheduleInlinePanel
        countryCode="LB"
        initialDate={TODAY_ISO}
        onChange={onChange}
      />,
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

// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarPopover } from "./CalendarPopover";

// Fix the reference date so the tests never depend on the real wall clock.
// 2026-05-23 is a Saturday; May 2026 has 31 days, so May 22 (Friday) and
// May 24 (Sunday) are both guaranteed to be in the same rendered month.
const TODAY_ISO = "2026-05-23";
const YESTERDAY_ISO = "2026-05-22";
const TOMORROW_ISO = "2026-05-24";
const IN_TWO_DAYS = "2026-05-25";

describe("CalendarPopover — past dates are disabled", () => {
  it("renders a disabled button for the day before todayIso", () => {
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    const yesterday = screen.getByTestId(
      `cal-day-${YESTERDAY_ISO}`,
    ) as HTMLButtonElement;
    expect(yesterday.disabled).toBe(true);
  });

  it("does NOT disable today's button", () => {
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    const today = screen.getByTestId(
      `cal-day-${TODAY_ISO}`,
    ) as HTMLButtonElement;
    expect(today.disabled).toBe(false);
  });

  it("does NOT disable a future date button", () => {
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    const future = screen.getByTestId(
      `cal-day-${TOMORROW_ISO}`,
    ) as HTMLButtonElement;
    expect(future.disabled).toBe(false);
  });
});

describe("CalendarPopover — onSelect emits the correct ISO string", () => {
  it("calls onSelect with tomorrow's ISO string when that day is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByTestId(`cal-day-${TOMORROW_ISO}`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(TOMORROW_ISO);
  });

  it("calls onSelect with the correct ISO for a date two days ahead", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByTestId(`cal-day-${IN_TWO_DAYS}`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(IN_TWO_DAYS);
  });

  it("calls onSelect with today's ISO string when today is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByTestId(`cal-day-${TODAY_ISO}`));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(TODAY_ISO);
  });

  it("does NOT call onSelect when a disabled past-date button is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={onSelect}
      />,
    );
    // userEvent respects the `disabled` attribute and won't fire a click on it,
    // but the onClick guard `!isPast && onSelect(iso)` also stops the call even
    // if the button were somehow activated.
    await user.click(screen.getByTestId(`cal-day-${YESTERDAY_ISO}`));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("CalendarPopover — initial view matches the selectedIso month", () => {
  it("opens on the selected date's month when selectedIso is provided", () => {
    // Provide a selected date three months ahead of today.
    const selectedIso = "2026-08-15";
    render(
      <CalendarPopover
        selectedIso={selectedIso}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    // The month header should read "August 2026".
    expect(screen.getByText("August 2026")).toBeTruthy();
    // Aug 15 button should be present and not disabled.
    const aug15 = screen.getByTestId("cal-day-2026-08-15") as HTMLButtonElement;
    expect(aug15.disabled).toBe(false);
  });

  it("opens on today's month when selectedIso is null", () => {
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("May 2026")).toBeTruthy();
  });
});

describe("CalendarPopover — month navigation", () => {
  it("previous-month button is disabled when viewing the current month", () => {
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    const prev = screen.getByLabelText("Previous month") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
  });

  it("previous-month button is enabled after navigating forward", async () => {
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Next month"));
    const prev = screen.getByLabelText("Previous month") as HTMLButtonElement;
    expect(prev.disabled).toBe(false);
  });

  it("navigating forward then back returns to the current month", async () => {
    const user = userEvent.setup();
    render(
      <CalendarPopover
        selectedIso={null}
        todayIso={TODAY_ISO}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByLabelText("Next month"));
    expect(screen.getByText("June 2026")).toBeTruthy();
    await user.click(screen.getByLabelText("Previous month"));
    expect(screen.getByText("May 2026")).toBeTruthy();
  });
});

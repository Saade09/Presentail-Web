// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryPickerModal } from "./DeliveryPickerModal";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Stable mocks — pin everything that varies with real time.
// ---------------------------------------------------------------------------

// Use vi.hoisted so the mutable `mockNow` reference can be updated per-test.
const { mockNow, mockDeliverySelection } = vi.hoisted(() => {
  const mockNow = vi.fn(() => new Date("2026-06-15T10:00:00"));
  const mockDeliverySelection = {
    mode: "schedule",
    date: "",
    slotLabel: null as string | null,
    slotId: null as string | null,
    serviceType: null as "midnight" | null,
    cityId: null as string | null,
  };
  return { mockNow, mockDeliverySelection };
});

vi.mock("@/lib/useNow", () => ({
  useNow: mockNow,
}));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: () => null,
}));

vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  return { ...actual, getCountryHour: () => 10 };
});

const mockSetSelection = vi.fn();

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({
    ...mockDeliverySelection,
    setSelection: mockSetSelection,
  }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({ countryCode: "LB", city: { id: "lb-beirut" } }),
}));

beforeEach(() => {
  mockSetSelection.mockClear();
  Object.assign(mockDeliverySelection, {
    mode: "schedule",
    date: "",
    slotLabel: null,
    slotId: null,
    serviceType: null,
    cityId: null,
  });
  // Restore the default stable clock so existing tests are unaffected.
  mockNow.mockReturnValue(new Date("2026-06-15T10:00:00"));
});

afterEach(() => {
  mockNow.mockReturnValue(new Date("2026-06-15T10:00:00"));
});

// ---------------------------------------------------------------------------
// OS-sourced slots where startHour and cutoffHour are in opposite order.
// Sorted by startHour → [Morning(start=9), Evening(start=18)].
// Morning is the correct first slot; Evening has a lower cutoffHour (20 vs 22)
// but a higher startHour so it must appear second after the fix.
// ---------------------------------------------------------------------------

const OS_SLOTS = [
  { label: "Evening", cutoffHour: 22, startHour: 18, endHour: 22 },
  { label: "Morning", cutoffHour: 20, startHour: 9, endHour: 13 },
];

const midnightLocale = {
  t: (key: string) =>
    key === "product.midnightDelivery"
      ? "Midnight Delivery"
      : key === "product.midnightArrivesAs"
         ? "Arrives between 11 PM {start} and 1 AM on {end}"
        : key,
  language: "en" as const,
  dir: "ltr" as const,
};

// ---------------------------------------------------------------------------
// Helper: find the Tomorrow quick-pick button.
// The `t` stub returns the i18n key, so the button's inner text is the key.
// ---------------------------------------------------------------------------
function getTomorrowButton() {
  return screen
    .getByText("checkout.day.tomorrow")
    .closest("button") as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeliveryPickerModal — default slot for future dates", () => {
  it("pre-selects the earliest slot (by startHour) when the modal opens on a future date", () => {
    // deliverySelection.date is empty → modal treats it as today by default, but
    // the slot selection uses firstAvailableSlot(sorted, isToday, 10).
    // With getCountryHour()=10 and Morning(cutoff=20 > 10), Morning is first available.
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
      />,
    );

    // Morning should be visually selected (it carries border-primary in its className).
    const morningBtn = screen.getByTestId("slot-Morning") as HTMLButtonElement;
    const eveningBtn = screen.getByTestId("slot-Evening") as HTMLButtonElement;

    expect(morningBtn.className).toContain("border-primary");
    expect(eveningBtn.className).not.toContain("border-primary");
  });

  it("resets to the earliest slot when the user switches from today to tomorrow", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
      />,
    );

    // 1. Evening is available for today (cutoff=22 > 10). Click it so it becomes selected.
    const eveningBtn = screen.getByTestId("slot-Evening") as HTMLButtonElement;
    await user.click(eveningBtn);
    expect(eveningBtn.className).toContain("border-primary");

    // 2. Click the Tomorrow quick-pick chip.
    await user.click(getTomorrowButton());

    // 3. After the date change, slot should reset to Morning (earliest by startHour).
    const morningBtn = screen.getByTestId("slot-Morning") as HTMLButtonElement;
    expect(morningBtn.className).toContain("border-primary");
    expect(eveningBtn.className).not.toContain("border-primary");
  });

  it("today's first still-available slot is preserved (existing correct behaviour)", () => {
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
      />,
    );

    // With currentHour=10 and Morning(cutoff=20 > 10), Morning is still available
    // and should be auto-selected for today.
    const morningBtn = screen.getByTestId("slot-Morning") as HTMLButtonElement;
    expect(morningBtn.className).toContain("border-primary");
  });
});

describe("DeliveryPickerModal — explicit invalid-cart recovery", () => {
  it("does not preselect Today or enable confirmation until the shopper explicitly chooses a date and slot", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
        initialModeOverride="schedule"
        requireExplicitSelection
      />,
    );

    const today = screen.getByTestId("quick-date-2026-06-15");
    expect(today.getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled).toBe(true);

    await user.click(today);
    expect((screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByTestId("slot-Morning"));
    expect((screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("DeliveryPickerModal — active prior-date Midnight selection", () => {
  const midnightOnlyToday = {
    label: "11 PM – 1 AM",
    slotId: "midnight-active",
    serviceType: "midnight" as const,
    cutoffHour: 20,
    startHour: 23,
    endHour: 1,
    sameDayEnabled: true,
    nextDayEnabled: false,
    extraFee: 20,
  };

  beforeEach(() => {
    Object.assign(mockDeliverySelection, {
      mode: "today_slot",
      date: "2026-08-14",
      slotLabel: midnightOnlyToday.label,
      slotId: midnightOnlyToday.slotId,
      serviceType: "midnight",
      cityId: "lb-beirut",
    });
  });

  it("keeps the exact same-day-only row confirmable at 00:30 the following day", () => {
    mockNow.mockReturnValue(new Date("2026-08-14T21:30:00.000Z"));
    renderWithProviders(
      <DeliveryPickerModal
        open
        onOpenChange={() => {}}
        timeSlots={[midnightOnlyToday]}
      />,
    );
    expect(screen.getByTestId(`slot-${midnightOnlyToday.label}`)).toBeTruthy();
    expect(
      (screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("disables confirmation at the exact 01:00 endpoint", () => {
    mockNow.mockReturnValue(new Date("2026-08-14T22:00:00.000Z"));
    renderWithProviders(
      <DeliveryPickerModal
        open
        onOpenChange={() => {}}
        timeSlots={[midnightOnlyToday]}
      />,
    );
    expect(
      (screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("DeliveryPickerModal — compact availability layouts", () => {
  it("keeps bookable slots visible while unavailable same-day windows stay collapsed until requested", async () => {
    const user = userEvent.setup();
    const slots = [
      { label: "Morning", cutoffHour: 9, startHour: 9, endHour: 13 },
      { label: "Afternoon", cutoffHour: 10, startHour: 14, endHour: 18 },
      { label: "Evening", cutoffHour: 22, startHour: 18, endHour: 22 },
    ];
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={slots} />);

    expect(screen.getByTestId("slot-Evening")).toBeTruthy();
    expect(screen.queryByTestId("unavailable-slot-Morning")).toBeNull();
    const disclosure = screen.getByTestId("unavailable-slots-disclosure");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");

    await user.click(disclosure);

    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByTestId("unavailable-slot-Morning") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("unavailable-slot-Afternoon") as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders every available window with Midnight Delivery as a full-width final row", () => {
    const slots = [
      { label: "Morning", cutoffHour: 20, startHour: 9, endHour: 13 },
      { label: "Afternoon", cutoffHour: 20, startHour: 14, endHour: 18 },
      { label: "Evening", cutoffHour: 20, startHour: 18, endHour: 22 },
      { label: "Late night", cutoffHour: 20, startHour: 21, endHour: 23 },
      { label: "11 PM – 1 AM", slotId: "os-midnight-beirut", serviceType: "midnight" as const, cutoffHour: 20, startHour: 23, endHour: 1, extraFee: 20 },
    ];
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={slots} />);

    for (const label of ["Morning", "Afternoon", "Evening", "Late night", "11 PM – 1 AM"]) {
      expect(screen.getByTestId(`slot-${label}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("unavailable-slots-disclosure")).toBeNull();
    const midnight = screen.getByTestId("slot-11 PM – 1 AM");
    expect(midnight.className).toContain("w-full");
    expect(midnight.textContent).toContain("delivery.picker.midnightEndsNextDay");
  });

  it("keeps each eligible Midnight configuration visible instead of only the first", () => {
    const slots = [
      { label: "Evening", cutoffHour: 20, startHour: 18, endHour: 22 },
      { label: "Midnight A", slotId: "midnight-a", serviceType: "midnight" as const, cutoffHour: 20, startHour: 23, endHour: 1, extraFee: 20 },
      { label: "Midnight B", slotId: "midnight-b", serviceType: "midnight" as const, cutoffHour: 20, startHour: 23, endHour: 1, extraFee: 30 },
    ];
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={slots} />);

    expect(screen.getByTestId("slot-Midnight A")).toBeTruthy();
    expect(screen.getByTestId("slot-Midnight B")).toBeTruthy();
    expect(screen.getAllByText("product.midnightDelivery")).toHaveLength(2);
  });

  it("uses standard radio keyboard navigation for delivery type and times", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={OS_SLOTS} />);

    const morning = screen.getByTestId("slot-Morning") as HTMLButtonElement;
    morning.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTestId("slot-Evening").getAttribute("aria-checked")).toBe("true");

    const schedule = screen.getByTestId("option-schedule") as HTMLButtonElement;
    schedule.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("option-express").getAttribute("aria-checked")).toBe("true");
  });

  it("offers the next available date without committing a fully booked date", async () => {
    const user = userEvent.setup();
    const city = {
      id: "lb-beirut",
      name: "Beirut",
      slotsByDay: {
        monday: [{ label: "Monday slot", cutoffHour: 20, startHour: 14, endHour: 18 }],
        thursday: [{ label: "Thursday slot", cutoffHour: 20, startHour: 14, endHour: 18 }],
      },
    };
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} city={city} />);

    await user.click(screen.getByTestId("quick-date-2026-06-17"));
    expect(screen.getByTestId("slots-empty-state")).toBeTruthy();
    expect((screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByTestId("next-available-date"));
    expect(screen.getByTestId("slot-Thursday slot")).toBeTruthy();
    expect((screen.getByTestId("button-picker-confirm") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("DeliveryPickerModal — Midnight Delivery helper copy", () => {
  const MIDNIGHT_SLOTS = [
    { label: "Afternoon", cutoffHour: 20, startHour: 14, endHour: 18 },
    {
      label: "11 PM – 1 AM",
      slotId: "os-midnight-beirut",
      serviceType: "midnight" as const,
      cutoffHour: 20,
      startHour: 23,
      endHour: 1,
      extraFee: 20,
    },
  ];

  it("uses tonight for the market-local current date and explicit dates thereafter", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={MIDNIGHT_SLOTS}
      />,
      { locale: midnightLocale },
    );

    await user.click(screen.getByTestId("slot-11 PM – 1 AM"));
    expect(screen.getByTestId("midnight-delivery-banner").textContent).toContain(
      "Arrives between 11 PM tonight and 1 AM on Tue, 16 Jun",
    );

    await user.click(getTomorrowButton());
    await user.click(screen.getByTestId("slot-11 PM – 1 AM"));
    expect(screen.getByTestId("midnight-delivery-banner").textContent).toContain(
      "Arrives between 11 PM on Tue, 16 Jun and 1 AM on Wed, 17 Jun",
    );
  });
});

// ---------------------------------------------------------------------------
// Midnight UTC timezone boundary
// ---------------------------------------------------------------------------

describe("DeliveryPickerModal — handleConfirm uses local Beirut date at midnight UTC", () => {
  it("emits today=2026-07-03 (Beirut local) when useNow returns 21:09 UTC on Jul 2 (= 00:09 Beirut Jul 3)", async () => {
    // 2026-07-02T21:09:00Z = 00:09 Beirut (UTC+3 DST) = already July 3 locally.
    // Before the fix, handleConfirm computed `new Date().toISOString().slice(0,10)`
    // which would have returned "2026-07-02" — sending yesterday's date to the API.
    mockNow.mockReturnValue(new Date("2026-07-02T21:09:00Z"));

    const user = userEvent.setup();
    const onConfirm = vi.fn();

    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
        onConfirm={onConfirm}
      />,
    );

    // Click the Confirm button. The t() stub returns the key as-is.
    const confirmBtn = screen.getByText("delivery.picker.confirm").closest("button") as HTMLButtonElement;
    await user.click(confirmBtn);

    // The selection date must be the Beirut-local date, NOT the UTC date.
    expect(onConfirm).toHaveBeenCalledOnce();
    const selection = onConfirm.mock.calls[0][0] as { date: string; mode: string };
    expect(selection.date).toBe("2026-07-03");
    expect(selection.date).not.toBe("2026-07-02");
  });
});

// ---------------------------------------------------------------------------
// Date-aware slot availability (sameDayEnabled / nextDayEnabled / duplicates)
// ---------------------------------------------------------------------------

describe("DeliveryPickerModal — same-day/next-day flags and duplicate labels", () => {
  const FLAGGED_SLOTS = [
    // Not deliverable same-day; only shows for tomorrow+.
    { label: "Morning", cutoffHour: 20, startHour: 9, endHour: 13, sameDayEnabled: false, nextDayEnabled: true },
    // Duplicate "Night" configs: same-day variant with a fee, next-day free variant.
    { label: "Night", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: true, nextDayEnabled: false, extraFee: 7 },
    { label: "Night", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: false, nextDayEnabled: true, extraFee: 0 },
    // Evening available both days.
    { label: "Evening", cutoffHour: 22, startHour: 18, endHour: 22, sameDayEnabled: true, nextDayEnabled: true },
  ];

  it("hides sameDayEnabled=false slots today and shows them tomorrow", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={FLAGGED_SLOTS} />,
    );

    // Today: Morning must not be rendered at all.
    expect(screen.queryByTestId("slot-Morning")).toBeNull();
    expect(screen.getByTestId("slot-Evening")).toBeTruthy();

    // Tomorrow: Morning appears; same-day-only Night config is filtered out but
    // the next-day Night variant remains.
    await user.click(getTomorrowButton());
    expect(screen.getByTestId("slot-Morning")).toBeTruthy();
    expect(screen.getAllByTestId("slot-Night")).toHaveLength(1);
  });

  it("keeps the same-day (fee) Night variant today and the free variant tomorrow", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={FLAGGED_SLOTS} />,
    );

    // Today: only the sameDayEnabled=true Night config survives → fee badge shown.
    const nightToday = screen.getByTestId("slot-Night");
    expect(nightToday.textContent).toContain("+");

    // Tomorrow: nextDayEnabled=true free variant survives → no fee badge.
    await user.click(getTomorrowButton());
    const nightTomorrow = screen.getByTestId("slot-Night");
    expect(nightTomorrow.textContent).not.toContain("+");
  });

  it("does not render nextDayEnabled=false slots tomorrow", async () => {
    const user = userEvent.setup();
    const slots = [
      { label: "Express window", cutoffHour: 20, startHour: 10, endHour: 12, sameDayEnabled: true, nextDayEnabled: false },
      { label: "Evening", cutoffHour: 22, startHour: 18, endHour: 22, sameDayEnabled: true, nextDayEnabled: true },
    ];
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={slots} />,
    );

    expect(screen.getByTestId("slot-Express window")).toBeTruthy();
    await user.click(getTomorrowButton());
    expect(screen.queryByTestId("slot-Express window")).toBeNull();
    expect(screen.getByTestId("slot-Evening")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Duplicate-label fee integrity: the confirmed selection must carry the slotId
// of the exact variant shown, so checkout fee lookups (which prefer slotId)
// can never resolve the other same-label configuration.
// ---------------------------------------------------------------------------

describe("DeliveryPickerModal — confirm carries the displayed variant's slotId", () => {
  const DUP_SLOTS = [
    { label: "Night", slotId: "night-sameday-paid", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: true, nextDayEnabled: false, extraFee: 7 },
    { label: "Night", slotId: "night-nextday-free", cutoffHour: 22, startHour: 21, endHour: 23, sameDayEnabled: false, nextDayEnabled: true, extraFee: 0 },
    { label: "Evening", slotId: "evening", cutoffHour: 22, startHour: 18, endHour: 22, sameDayEnabled: true, nextDayEnabled: true },
  ];

  it("today: confirming Night emits the paid same-day slotId", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={DUP_SLOTS} onConfirm={onConfirm} />,
    );
    await user.click(screen.getByTestId("slot-Night"));
    await user.click(screen.getByText("delivery.picker.confirm").closest("button") as HTMLButtonElement);
    const sel = onConfirm.mock.calls[0][0] as { slotLabel: string; slotId: string };
    expect(sel.slotLabel).toBe("Night");
    expect(sel.slotId).toBe("night-sameday-paid");
  });

  it("tomorrow: confirming Night emits the free next-day slotId", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={DUP_SLOTS} onConfirm={onConfirm} />,
    );
    await user.click(getTomorrowButton());
    await user.click(screen.getByTestId("slot-Night"));
    await user.click(screen.getByText("delivery.picker.confirm").closest("button") as HTMLButtonElement);
    const sel = onConfirm.mock.calls[0][0] as { slotLabel: string; slotId: string };
    expect(sel.slotLabel).toBe("Night");
    expect(sel.slotId).toBe("night-nextday-free");
  });
});

// ---------------------------------------------------------------------------
// The checkout passes its selected district's city via the `city` prop — the
// modal must show THAT city's schedule and confirm with that cityId, never
// the storefront browsing city's (a shopper browsing Beirut can deliver to
// Akkar; the mocked browsing city above is lb-beirut).
// ---------------------------------------------------------------------------

describe("DeliveryPickerModal — city prop overrides the browsing city", () => {
  // 2026-06-15 (mocked today) is a Monday.
  const DISTRICT_CITY = {
    id: "lb-akkar",
    name: "Akkar",
    slotsByDay: {
      monday: [{ label: "Akkar Afternoon", cutoffHour: 20, startHour: 14, endHour: 18 }],
      tuesday: [{ label: "Akkar Tomorrow", cutoffHour: 20, startHour: 9, endHour: 13 }],
    },
  };

  it("shows the district city's per-weekday schedule, not the browsing-city slots", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
        city={DISTRICT_CITY}
      />,
    );
    expect(screen.getByTestId("slot-Akkar Afternoon")).toBeTruthy();
    expect(screen.queryByTestId("slot-Morning")).toBeNull();
    expect(screen.queryByTestId("slot-Evening")).toBeNull();

    await user.click(getTomorrowButton());
    expect(screen.getByTestId("slot-Akkar Tomorrow")).toBeTruthy();
  });

  it("confirming emits the district city's id, not the browsing city's", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal
        open={true}
        onOpenChange={() => {}}
        timeSlots={OS_SLOTS}
        city={DISTRICT_CITY}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByTestId("slot-Akkar Afternoon"));
    await user.click(screen.getByText("delivery.picker.confirm").closest("button") as HTMLButtonElement);
    const sel = onConfirm.mock.calls[0][0] as { cityId: string | null };
    expect(sel.cityId).toBe("lb-akkar");
  });

  it("an explicit null city uses only the flat timeSlots prop", () => {
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} timeSlots={OS_SLOTS} city={null} />,
    );
    expect(screen.getByTestId("slot-Morning")).toBeTruthy();
    expect(screen.getByTestId("slot-Evening")).toBeTruthy();
  });
});

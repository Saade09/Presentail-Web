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
const { mockNow } = vi.hoisted(() => {
  const mockNow = vi.fn(() => new Date("2026-06-15T10:00:00"));
  return { mockNow };
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
    mode: "schedule",
    date: "",
    slotLabel: null,
    setSelection: mockSetSelection,
  }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({ countryCode: "LB" }),
}));

beforeEach(() => {
  mockSetSelection.mockClear();
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

const TODAY_ISO = "2026-06-15";
const TOMORROW_ISO = "2026-06-16";

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
    const morningBtn = screen.getByText("09:00 – 13:00").closest("button") as HTMLButtonElement;
    const eveningBtn = screen.getByText("18:00 – 22:00").closest("button") as HTMLButtonElement;

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
    const eveningBtn = screen.getByText("18:00 – 22:00").closest("button") as HTMLButtonElement;
    await user.click(eveningBtn);
    expect(eveningBtn.className).toContain("border-primary");

    // 2. Click the Tomorrow quick-pick chip.
    await user.click(getTomorrowButton());

    // 3. After the date change, slot should reset to Morning (earliest by startHour).
    const morningBtn = screen.getByText("09:00 – 13:00").closest("button") as HTMLButtonElement;
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
    const morningBtn = screen.getByText("09:00 – 13:00").closest("button") as HTMLButtonElement;
    expect(morningBtn.className).toContain("border-primary");
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

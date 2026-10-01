// @vitest-environment jsdom
//
// "Deliver earlier?" confirmation in the delivery picker — any pick that moves
// delivery to an earlier calendar date (e.g. tomorrow → today's Express) must
// detour through the confirmation instead of committing directly. Confirmed
// picks commit with source "user_selected"; cancel preserves the original
// selection.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeliveryPickerModal } from "./DeliveryPickerModal";
import { renderWithProviders } from "@/test-utils";

const { mockNow } = vi.hoisted(() => ({
  // 10:00 local — inside the express window; express ETA (11:30) stays today.
  mockNow: vi.fn(() => new Date("2026-06-15T10:00:00")),
}));

vi.mock("@/lib/useNow", () => ({ useNow: mockNow }));

vi.mock("@/components/FormattedPrice", () => ({
  FormattedPrice: ({ usdValue }: { usdValue: number }) => <>${usdValue}</>,
}));

vi.mock("@workspace/delivery", async (importActual) => {
  const actual = await importActual<typeof import("@workspace/delivery")>();
  // Pin express availability so the midnight-crossing test (23:30) can still
  // exercise the express path; date math (getLocalIso/expressDeadlineFrom)
  // stays real.
  return { ...actual, getCountryHour: () => 10, isExpressDeliveryAvailable: () => true };
});

vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackEvent: vi.fn(),
    trackWebEvent: vi.fn(),
  });
});

const mockSetSelection = vi.fn();
const { mockSelection } = vi.hoisted(() => ({
  mockSelection: {
    mode: "schedule" as string | null,
    date: "2026-06-16",
    slotLabel: null as string | null,
    slotId: null as string | null,
    source: "system_default" as string | null,
  },
}));

vi.mock("@/contexts/DeliverySelectionContext", () => ({
  useDeliverySelection: () => ({ ...mockSelection, setSelection: mockSetSelection }),
}));

vi.mock("@/contexts/LocationContext", () => ({
  useLocationSelection: () => ({ countryCode: "LB" }),
}));

import { trackWebEvent } from "@/lib/analytics";

const webEventsOf = (type: string) =>
  vi.mocked(trackWebEvent).mock.calls.map(([e]) => e).filter((e) => e.type === type);

beforeEach(() => {
  mockSetSelection.mockClear();
  vi.mocked(trackWebEvent).mockClear();
  mockSelection.mode = "schedule";
  mockSelection.date = "2026-06-16"; // committed: tomorrow
  mockSelection.slotLabel = null;
  mockSelection.source = "system_default";
});

async function pickExpressAndConfirm() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId("option-express"));
  await user.click(screen.getByTestId("button-picker-confirm"));
  return user;
}

describe("DeliveryPickerModal — earlier-date confirmation", () => {
  it("selecting Express while tomorrow is committed opens 'Deliver earlier?' instead of committing", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    await pickExpressAndConfirm();

    expect(screen.getByTestId("dialog-deliver-earlier")).toBeTruthy();
    expect(mockSetSelection).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(webEventsOf("earlier_delivery_confirmation_shown")).toHaveLength(1);
    // Both the complete original and new delivery lines are present.
    expect(screen.getByTestId("text-deliver-earlier-original").textContent).toBeTruthy();
    expect(screen.getByTestId("text-deliver-earlier-new").textContent).toBeTruthy();
  });

  it("'Deliver earlier' commits express with source user_selected", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
    );
    const user = await pickExpressAndConfirm();
    await user.click(screen.getByTestId("button-deliver-earlier-confirm"));

    expect(webEventsOf("earlier_delivery_confirmed")).toHaveLength(1);
    expect(mockSetSelection).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "express", source: "user_selected" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("'Keep scheduled delivery' preserves the original selection", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <DeliveryPickerModal open={true} onOpenChange={() => {}} onConfirm={onConfirm} />,
    );
    const user = await pickExpressAndConfirm();
    await user.click(screen.getByTestId("button-deliver-earlier-keep"));

    expect(webEventsOf("earlier_delivery_canceled")).toHaveLength(1);
    expect(mockSetSelection).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dialog-deliver-earlier")).toBeNull();
  });

  it("no confirmation when the committed selection is already today (same calendar date)", async () => {
    mockSelection.date = "2026-06-15";
    mockSelection.mode = "today_slot";
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} />);
    await pickExpressAndConfirm();

    expect(screen.queryByTestId("dialog-deliver-earlier")).toBeNull();
    expect(mockSetSelection).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "express", source: "user_selected" }),
    );
  });

  it("Express ETA crossing midnight does NOT count as an earlier date vs tomorrow", async () => {
    // 23:30 UTC + 90min lands on the 16th in Beirut — the express arrival date
    // equals the committed tomorrow, so no "Deliver earlier?" step is needed.
    // (getCountryHour is mocked to 10 so express stays within its window.)
    mockNow.mockReturnValue(new Date("2026-06-15T23:30:00Z"));
    renderWithProviders(<DeliveryPickerModal open={true} onOpenChange={() => {}} />);
    await pickExpressAndConfirm();
    expect(screen.queryByTestId("dialog-deliver-earlier")).toBeNull();
    expect(mockSetSelection).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "express", source: "user_selected" }),
    );
  });
});

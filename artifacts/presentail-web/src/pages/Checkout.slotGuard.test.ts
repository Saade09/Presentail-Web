import { describe, it, expect } from "vitest";
import { isPlaceOrderDisabled } from "@/lib/checkoutSubmitGuard";

// ---------------------------------------------------------------------------
// Unit tests for the Place Order / Pay button disabled guard.
//
// Key regression: when the OS delivery-slots API returns an empty array, an
// effect in Checkout.tsx clears the selected slot (setDeliverySlot("")).
// The button must be disabled whenever mode !== "express" and no slot is
// selected — regardless of whether timeSlots is empty or populated.
//
// LB-2443 / LB-2445: orders reached OS with a delivery date but an empty
// slot because the button's disabled condition did not account for a missing
// slot when timeSlots had already been cleared by the effect.
// ---------------------------------------------------------------------------

describe("isPlaceOrderDisabled — slot guard", () => {
  const BASE = {
    isProcessing: false,
    noAddress: false,
    selectedDistrict: "Beirut",
  };

  // ── Core regression: slots = [], mode = "schedule" ──

  it("is disabled when mode=schedule and no slot is selected (slots failed to load)", () => {
    // timeSlots=[] causes the slot-clear effect to run: deliverySlot becomes "".
    expect(
      isPlaceOrderDisabled({ ...BASE, deliveryMode: "schedule", deliverySlot: "" }),
    ).toBe(true);
  });

  it("is disabled when mode=schedule and deliverySlot is empty string", () => {
    expect(
      isPlaceOrderDisabled({ ...BASE, deliveryMode: "schedule", deliverySlot: "" }),
    ).toBe(true);
  });

  // ── Express orders do not require a slot ──

  it("is NOT disabled when mode=express even with an empty slot", () => {
    expect(
      isPlaceOrderDisabled({ ...BASE, deliveryMode: "express", deliverySlot: "" }),
    ).toBe(false);
  });

  // ── Normal path: slot is selected ──

  it("is NOT disabled when mode=schedule and a slot is selected", () => {
    expect(
      isPlaceOrderDisabled({
        ...BASE,
        deliveryMode: "schedule",
        deliverySlot: "10:00 AM – 12:00 PM",
      }),
    ).toBe(false);
  });

  it("is NOT disabled when mode=midnight and a slot is selected", () => {
    expect(
      isPlaceOrderDisabled({
        ...BASE,
        deliveryMode: "midnight",
        deliverySlot: "11:00 PM – 12:00 AM",
      }),
    ).toBe(false);
  });

  // ── Other disabled conditions still work ──

  it("is disabled when isProcessing=true even with a valid slot", () => {
    expect(
      isPlaceOrderDisabled({
        ...BASE,
        isProcessing: true,
        deliveryMode: "schedule",
        deliverySlot: "10:00 AM – 12:00 PM",
      }),
    ).toBe(true);
  });

  it("is disabled when no district is selected and noAddress=false", () => {
    expect(
      isPlaceOrderDisabled({
        isProcessing: false,
        noAddress: false,
        selectedDistrict: "",
        deliveryMode: "schedule",
        deliverySlot: "10:00 AM – 12:00 PM",
      }),
    ).toBe(true);
  });

  it("is NOT disabled when noAddress=true even with no district selected", () => {
    expect(
      isPlaceOrderDisabled({
        isProcessing: false,
        noAddress: true,
        selectedDistrict: "",
        deliveryMode: "schedule",
        deliverySlot: "10:00 AM – 12:00 PM",
      }),
    ).toBe(false);
  });
});

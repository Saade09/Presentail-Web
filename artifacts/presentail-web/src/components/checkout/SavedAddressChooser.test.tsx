// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SavedAddressChooser, type CheckoutSavedAddress } from "./SavedAddressChooser";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const t = (key: string) => ({
  "checkout.savedAddresses": "Saved addresses",
  "checkout.savedAddressesChoose": "Choose an address, then confirm it for this order.",
  "checkout.savedAddressUse": "Use this address",
  "checkout.savedAddressAdd": "Add address",
  "checkout.savedAddressEdit": "Edit address",
  "checkout.defaultLabel": "Default",
  "checkout.savedAddressSelected": "Currently selected",
  "checkout.savedAddressesLoading": "Loading saved addresses",
  "checkout.savedAddressesLoadError": "We couldn't load your saved addresses.",
  "checkout.savedAddressesEmpty": "No saved addresses yet",
  "checkout.savedAddressesEmptyDesc": "Add one from your account to use it at checkout.",
  "checkout.retry": "Retry",
}[key] ?? key);

const addresses: CheckoutSavedAddress[] = [
  { id: 1, label: "home", isDefault: true, district: "Beirut", addressLine: "Main street", recipientFirstName: "Maya" },
  { id: 2, label: "work", isDefault: false, district: "Tripoli", addressLine: "Market street", recipientFirstName: "Sam" },
];

function renderChooser(overrides: Partial<React.ComponentProps<typeof SavedAddressChooser>> = {}) {
  const props = {
    open: true,
    addresses,
    activeAddressId: 1,
    loading: false,
    error: false,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onRetry: vi.fn(),
    t,
    ...overrides,
  };
  render(<SavedAddressChooser {...props} />);
  return props;
}

describe("SavedAddressChooser", () => {
  it("keeps a changed radio choice temporary until confirmation", () => {
    const props = renderChooser();

    fireEvent.click(screen.getByTestId("saved-address-select-2"));
    expect(screen.getByTestId("saved-address-select-2").getAttribute("aria-checked")).toBe("true");
    expect(props.onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("saved-address-confirm"));
    expect(props.onConfirm).toHaveBeenCalledWith(addresses[1]);
  });

  it("dismisses with Escape without confirming the temporary choice", () => {
    const props = renderChooser();
    fireEvent.click(screen.getByTestId("saved-address-select-2"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });
});
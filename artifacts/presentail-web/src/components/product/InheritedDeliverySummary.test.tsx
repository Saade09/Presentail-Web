// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InheritedDeliverySummary } from "./InheritedDeliverySummary";
import { renderWithProviders } from "@/test-utils";

const LOCALE_T: Record<string, string> = {
  "product.delivery.header": "DELIVERY",
  "product.delivery.expressTitle": "Express delivery",
  "product.delivery.scheduledTitle": "Scheduled delivery",
  "product.delivery.change": "Change",
  "product.delivery.changeAria": "Change delivery method, date or time",
  "product.delivery.joinCart": "This item will join your cart's delivery.",
};

const locale = {
  t: (key: string) => LOCALE_T[key] ?? key,
  language: "en" as const,
  dir: "ltr" as const,
};

describe("InheritedDeliverySummary — compact card", () => {
  it("renders the express state with title, arrival line, join line, and fee line", () => {
    renderWithProviders(
      <InheritedDeliverySummary
        mode="express"
        detailLine="Arrives by 1:30 PM Lebanon time"
        feeLine="Express upgrade: $15 · already included"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.getByText("DELIVERY")).toBeTruthy();
    expect(screen.getByText("Express delivery")).toBeTruthy();
    expect(screen.getByText("Arrives by 1:30 PM Lebanon time")).toBeTruthy();
    expect(screen.getByText("This item will join your cart's delivery.")).toBeTruthy();
    expect(screen.getByTestId("delivery-fee-line").textContent).toBe(
      "Express upgrade: $15 · already included",
    );
  });

  it("renders the scheduled state with date · window line and free fee line", () => {
    renderWithProviders(
      <InheritedDeliverySummary
        mode="scheduled"
        detailLine="Today, 14 Aug · 6 PM–10 PM Lebanon time"
        feeLine="Delivery: Free · already included"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.getByText("Scheduled delivery")).toBeTruthy();
    expect(screen.getByText("Today, 14 Aug · 6 PM–10 PM Lebanon time")).toBeTruthy();
    expect(screen.getByTestId("delivery-fee-line").textContent).toBe(
      "Delivery: Free · already included",
    );
  });

  it("renders the paid scheduled fee line when the order-level fee is not free", () => {
    renderWithProviders(
      <InheritedDeliverySummary
        mode="scheduled"
        detailLine="Fri, 21 Aug · 9 AM–1 PM Lebanon time"
        feeLine="Delivery: $7 · already included"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.getByTestId("delivery-fee-line").textContent).toBe(
      "Delivery: $7 · already included",
    );
  });

  it("omits the fee line when none is provided", () => {
    renderWithProviders(
      <InheritedDeliverySummary
        mode="scheduled"
        detailLine="Fri, 21 Aug"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByTestId("delivery-fee-line")).toBeNull();
  });

  it("removed legacy clutter: no 'Selected in cart' badge, footer sentence, or long change label", () => {
    renderWithProviders(
      <InheritedDeliverySummary
        mode="scheduled"
        detailLine="Today, 14 Aug"
        feeLine="Delivery: Free · already included"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.queryByText(/Selected in cart/i)).toBeNull();
    expect(screen.queryByText(/same delivery window/i)).toBeNull();
    expect(screen.queryByText(/Change date or time/i)).toBeNull();
    expect(screen.getByTestId("change-delivery-btn").textContent).toBe("Change");
  });

  it("Change is keyboard-accessible with a descriptive accessible label and fires the callback", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <InheritedDeliverySummary
        mode="express"
        detailLine="Arrives by 1:30 PM Lebanon time"
        feeLine="Express upgrade: $15 · already included"
        onChangeDelivery={onChange}
      />,
      { locale },
    );
    const btn = screen.getByRole("button", {
      name: "Change delivery method, date or time",
    });
    btn.focus();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the delivery selection changes (rerender with new props)", () => {
    const { rerender } = renderWithProviders(
      <InheritedDeliverySummary
        mode="express"
        detailLine="Arrives by 1:30 PM Lebanon time"
        feeLine="Express upgrade: $15 · already included"
        onChangeDelivery={() => {}}
      />,
      { locale },
    );
    expect(screen.getByText("Express delivery")).toBeTruthy();

    rerender(
      <InheritedDeliverySummary
        mode="scheduled"
        detailLine="Tomorrow, 15 Aug · 6 PM–10 PM Lebanon time"
        feeLine="Delivery: Free · already included"
        onChangeDelivery={() => {}}
      />,
    );
    expect(screen.queryByText("Express delivery")).toBeNull();
    expect(screen.getByText("Scheduled delivery")).toBeTruthy();
    expect(screen.getByText("Tomorrow, 15 Aug · 6 PM–10 PM Lebanon time")).toBeTruthy();
  });
});

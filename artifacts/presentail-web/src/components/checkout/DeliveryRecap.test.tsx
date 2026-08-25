// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { DeliveryRecap } from "./DeliveryRecap";

describe("DeliveryRecap", () => {
  it("uses the shared standard promise for an evening same-day delivery", () => {
    renderWithProviders(
      <DeliveryRecap
        recipientFirstName="Maya"
        recipientLastName="Saleh"
        district="Beirut"
        address="Hamra"
        recipientWillProvideAddress={false}
        selfRecipient={false}
        deliveryMode="schedule"
        deliveryRowText="Today · 6 PM–9 PM"
        deliveryPromiseText="Arrives tonight, 6 PM–9 PM"
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("Arrives tonight, 6 PM–9 PM")).toBeTruthy();
    expect(screen.queryByText("Today · 6 PM–9 PM")).toBeNull();
  });
});
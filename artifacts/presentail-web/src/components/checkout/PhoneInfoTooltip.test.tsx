// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneInfoTooltip } from "./PhoneInfoTooltip";
import { renderWithProviders } from "@/test-utils";

const LOCALE_T: Record<string, string> = {
  "checkout.phoneInfoButtonLabel": "Why we need the recipient's phone number",
  "checkout.phoneInfoAskOn":
    "We'll only use this number to collect the recipient's address and coordinate delivery.",
  "checkout.phoneInfoAskOff":
    "We'll only use this number for delivery coordination.",
};

const locale = {
  t: (key: string) => LOCALE_T[key] ?? key,
  language: "en" as const,
  dir: "ltr" as const,
};

describe("PhoneInfoTooltip", () => {
  it("is closed by default and opens on click, firing onOpen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(
      <PhoneInfoTooltip askRecipientForAddress={false} onOpen={onOpen} />,
      { locale },
    );

    expect(screen.queryByTestId("tooltip-phone-info")).toBeNull();

    const button = screen.getByTestId("button-phone-info");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-label")).toBe(
      "Why we need the recipient's phone number",
    );

    await user.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tooltip-phone-info").textContent).toBe(
      "We'll only use this number for delivery coordination.",
    );
  });

  it("shows the address-collection copy when the ask-recipient toggle is ON", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PhoneInfoTooltip askRecipientForAddress={true} />,
      { locale },
    );
    await user.click(screen.getByTestId("button-phone-info"));
    expect(screen.getByTestId("tooltip-phone-info").textContent).toBe(
      "We'll only use this number to collect the recipient's address and coordinate delivery.",
    );
    // Never mentions price.
    expect(screen.getByTestId("tooltip-phone-info").textContent).not.toMatch(
      /price|\$|USD/i,
    );
  });

  it("closes on re-click and on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PhoneInfoTooltip askRecipientForAddress={false} />,
      { locale },
    );
    const button = screen.getByTestId("button-phone-info");

    await user.click(button);
    expect(screen.getByTestId("tooltip-phone-info")).toBeTruthy();
    await user.click(button);
    expect(screen.queryByTestId("tooltip-phone-info")).toBeNull();

    await user.click(button);
    expect(screen.getByTestId("tooltip-phone-info")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("tooltip-phone-info")).toBeNull();
  });

  it("anchors below the icon with an offset and renders the caret arrow", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PhoneInfoTooltip askRecipientForAddress={false} />,
      { locale },
    );
    await user.click(screen.getByTestId("button-phone-info"));

    const content = screen.getByTestId("tooltip-phone-info");
    // Radix reflects the resolved placement on the content element.
    expect(content.getAttribute("data-side")).toBe("bottom");
    expect(content.getAttribute("data-align")).toBe("start");

    // Caret arrow is rendered inside the popover, in the bubble's background color.
    const arrow = content.querySelector('[data-testid="tooltip-phone-info-arrow"]');
    expect(arrow).toBeTruthy();
    expect(arrow?.getAttribute("class") ?? "").toContain("fill-primary");
  });

  it("toggles open with the keyboard (Enter) and keeps focus on the trigger", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(
      <PhoneInfoTooltip askRecipientForAddress={false} onOpen={onOpen} />,
      { locale },
    );
    const button = screen.getByTestId("button-phone-info");
    button.focus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tooltip-phone-info")).toBeTruthy();
    expect(document.activeElement).toBe(button);
  });
});

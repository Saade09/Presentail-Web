// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const trackWebEvent = vi.fn();
vi.mock("@/lib/analytics", async (importOriginal) => {
  const { mockAnalyticsModule } = await import("@/test/analytics-mock");
  return mockAnalyticsModule(importOriginal, {
    trackWebEvent: (...args: unknown[]) => trackWebEvent(...args),
    trackEvent: vi.fn(),
  });
});

const signInWithGooglePopup = vi.fn();
const signInWithApplePopup = vi.fn();
vi.mock("@/lib/oauthPopup", () => ({
  signInWithGooglePopup: (...args: unknown[]) => signInWithGooglePopup(...args),
  signInWithApplePopup: (...args: unknown[]) => signInWithApplePopup(...args),
}));

// Keep the email modal inert — it has its own test file.
vi.mock("@/components/checkout/EmailSignInModal", () => ({
  EmailSignInModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="mock-email-modal" /> : null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean; [k: string]: unknown }>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

import { CheckoutSignInCard } from "./CheckoutSignInCard";
import { DEFAULT_AUTH } from "@/test-utils";

const login = vi.fn();

function renderCard(props: Partial<React.ComponentProps<typeof CheckoutSignInCard>> = {}) {
  return renderWithProviders(<CheckoutSignInCard {...props} />, {
    auth: { ...DEFAULT_AUTH, login },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutSignInCard", () => {
  it("renders heading, three sign-in buttons and the guest hint", () => {
    renderCard();
    expect(screen.getByText("checkoutLogin.title")).toBeTruthy();
    expect(screen.getByText("checkoutSignIn.subtitle")).toBeTruthy();
    expect(screen.getByTestId("button-checkout-signin-apple")).toBeTruthy();
    expect(screen.getByTestId("button-checkout-signin-google")).toBeTruthy();
    expect(screen.getByTestId("button-checkout-signin-email")).toBeTruthy();
    expect(screen.getByTestId("text-checkout-signin-guest-hint")).toBeTruthy();
    // No inline error initially
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
  });

  it("renders the compact mobile copy alongside the desktop copy (responsive spans)", () => {
    renderCard();
    // Mobile-only (md:hidden) compact copy
    expect(screen.getByText("checkoutSignIn.titleMobile").className).toContain("md:hidden");
    expect(screen.getByText("checkoutSignIn.subtitleMobile").className).toContain("md:hidden");
    expect(screen.getByText("checkoutSignIn.appleShort").className).toContain("md:hidden");
    expect(screen.getByText("checkoutSignIn.googleShort").className).toContain("md:hidden");
    // Desktop-only (hidden md:inline) original copy
    expect(screen.getByText("checkoutLogin.title").className).toContain("hidden md:inline");
    expect(screen.getByText("auth.continueApple").className).toContain("hidden md:inline");
    expect(screen.getByText("auth.continueGoogle").className).toContain("hidden md:inline");
  });

  it("hides the guest hint at mobile widths and keeps it for desktop", () => {
    renderCard();
    const hint = screen.getByTestId("text-checkout-signin-guest-hint");
    expect(hint.className).toContain("max-md:hidden");
    expect(hint.textContent).toContain("checkoutSignIn.guestHint");
  });

  it("renders Apple/Google as a two-column pill row on mobile with email spanning below", () => {
    renderCard();
    const grid = screen.getByTestId("button-checkout-signin-apple").parentElement!;
    // Two equal-width pills per row on mobile, three columns on desktop.
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("md:grid-cols-3");
    // The shared Button component uses whitespace-nowrap by default. The card
    // must allow translated labels to wrap within their mobile grid cells.
    expect(screen.getByTestId("button-checkout-signin-apple").className).toContain("min-w-0");
    expect(screen.getByTestId("button-checkout-signin-apple").className).toContain("max-md:whitespace-normal");
    // Email trigger becomes a full-width centered text link on mobile.
    const email = screen.getByTestId("button-checkout-signin-email");
    expect(email.className).toContain("max-md:col-span-2");
    expect(email.className).toContain("max-md:border-0");
    // Pills keep the ≥44px height class.
    expect(screen.getByTestId("button-checkout-signin-apple").className).toContain("h-11");
    expect(screen.getByTestId("button-checkout-signin-google").className).toContain("h-11");
  });

  it("Google success: signs the shopper in without navigation and fires funnel events", async () => {
    signInWithGooglePopup.mockResolvedValue({
      ok: true,
      token: "tok",
      user: { id: "1", email: "a@b.c", firstName: "A", lastName: "B" },
      provider: "google",
    });
    renderCard();
    await userEvent.click(screen.getByTestId("button-checkout-signin-google"));
    await waitFor(() => expect(login).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ email: "a@b.c" }),
      "google",
    ));
    const types = trackWebEvent.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("checkout_sign_in_method_selected");
    expect(types).toContain("checkout_auth_started");
    expect(types).toContain("checkout_auth_completed");
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
  });

  it("Apple success: signs the shopper in without navigating away from checkout", async () => {
    signInWithApplePopup.mockResolvedValue({
      ok: true,
      token: "apple-tok",
      user: { id: "2", email: "apple@example.com", firstName: "Apple", lastName: "User" },
      provider: "apple",
    });
    renderCard();

    await userEvent.click(screen.getByTestId("button-checkout-signin-apple"));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith(
        "apple-tok",
        expect.objectContaining({ email: "apple@example.com" }),
        "apple",
      ),
    );
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
  });

  it("OAuth cancel: no inline error, fires checkout_auth_cancelled", async () => {
    signInWithApplePopup.mockResolvedValue({ ok: false, cancelled: true });
    renderCard();
    await userEvent.click(screen.getByTestId("button-checkout-signin-apple"));
    await waitFor(() => {
      const types = trackWebEvent.mock.calls.map((c) => (c[0] as { type: string }).type);
      expect(types).toContain("checkout_auth_cancelled");
    });
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
    expect(login).not.toHaveBeenCalled();
  });

  it("restores every sign-in choice after Apple cancellation", async () => {
    signInWithApplePopup.mockResolvedValue({ ok: false, cancelled: true });
    renderCard();

    await userEvent.click(screen.getByTestId("button-checkout-signin-apple"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("button-checkout-signin-apple") as HTMLButtonElement).disabled,
      ).toBe(false),
    );

    expect(
      (screen.getByTestId("button-checkout-signin-google") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByTestId("button-checkout-signin-email") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByTestId("button-checkout-signin-apple").textContent).toContain(
      "auth.continueApple",
    );
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
    expect(
      trackWebEvent.mock.calls.filter(
        ([event]) => (event as { type: string }).type === "checkout_auth_cancelled",
      ),
    ).toHaveLength(1);
  });

  it("restores every sign-in choice after Google popup is abandoned without a callback", async () => {
    // Simulate the GSI callback never firing (popup silently dismissed) — the
    // bounded timeout in signInWithGooglePopup resolves as cancelled. The mock
    // stands in for the whole function so we don't need fake timers here.
    signInWithGooglePopup.mockResolvedValue({ ok: false, cancelled: true });
    renderCard();

    await userEvent.click(screen.getByTestId("button-checkout-signin-google"));
    await waitFor(() =>
      expect(
        (screen.getByTestId("button-checkout-signin-google") as HTMLButtonElement).disabled,
      ).toBe(false),
    );

    expect(
      (screen.getByTestId("button-checkout-signin-apple") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByTestId("button-checkout-signin-email") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByTestId("button-checkout-signin-google").textContent).toContain(
      "auth.continueGoogle",
    );
    expect(screen.queryByTestId("text-checkout-signin-error")).toBeNull();
    expect(
      trackWebEvent.mock.calls.filter(
        ([event]) => (event as { type: string }).type === "checkout_auth_cancelled",
      ),
    ).toHaveLength(1);
  });

  it("OAuth failure: shows a non-blocking inline error and fires checkout_auth_failed with a safe category", async () => {
    signInWithGooglePopup.mockResolvedValue({
      ok: false,
      cancelled: false,
      errorCategory: "server_rejected",
    });
    renderCard();
    await userEvent.click(screen.getByTestId("button-checkout-signin-google"));
    await waitFor(() =>
      expect(screen.getByTestId("text-checkout-signin-error")).toBeTruthy(),
    );
    const failed = trackWebEvent.mock.calls
      .map((c) => c[0] as { type: string; properties?: Record<string, unknown> })
      .find((e) => e.type === "checkout_auth_failed");
    expect(failed?.properties?.error_category).toBe("server_rejected");
    // Buttons stay usable — guest checkout was never blocked.
    expect(
      (screen.getByTestId("button-checkout-signin-google") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("email button opens the email modal and fires method_selected(email)", async () => {
    renderCard();
    await userEvent.click(screen.getByTestId("button-checkout-signin-email"));
    expect(screen.getByTestId("mock-email-modal")).toBeTruthy();
    const selected = trackWebEvent.mock.calls
      .map((c) => c[0] as { type: string; properties?: Record<string, unknown> })
      .find((e) => e.type === "checkout_sign_in_method_selected");
    expect(selected?.properties?.method).toBe("email");
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const trackWebEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackWebEvent: (...args: unknown[]) => trackWebEvent(...args),
  trackEvent: vi.fn(),
}));

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

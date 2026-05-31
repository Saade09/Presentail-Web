// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// @clerk/react/legacy is a different import path from the @clerk/react used
// by the app's own AuthContext, so renderWithProviders cannot stub it
// centrally — we must keep this mock here.
vi.mock("@clerk/react/legacy", () => ({
  useSignIn: vi.fn(),
}));

// LocaleContext is provided centrally by renderWithProviders (DEFAULT_LOCALE,
// t: key => key, dir: "ltr") — no per-file mock needed.

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/", mockSetLocation]),
  useRouter: vi.fn(() => ({ base: "" })),
}));

// Radix Dialog uses portals which are awkward in jsdom. Replace with a simple
// wrapper that renders children whenever `open` is true.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...rest}>{children}</div>
  ),
}));

// Button and Input render as standard HTML elements so CSS-in-JS variants are
// skipped and test queries can match by testid without Tailwind awareness.
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    [k: string]: unknown;
  }>) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { CheckoutLoginDialog } from "./CheckoutLoginDialog";
import { useSignIn } from "@clerk/react/legacy";

// ---------------------------------------------------------------------------
// Shared props
// ---------------------------------------------------------------------------

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onContinueAsGuest: vi.fn(),
  surface: "cart" as const,
};

// ---------------------------------------------------------------------------
// Tests: Clerk not yet loaded (isLoaded = false)
// ---------------------------------------------------------------------------

describe("CheckoutLoginDialog — Clerk sign-in unavailable (isLoaded=false)", () => {
  beforeEach(() => {
    (useSignIn as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoaded: false,
      signIn: null,
    });
    defaultProps.onOpenChange.mockClear();
    defaultProps.onContinueAsGuest.mockClear();
    mockSetLocation.mockClear();
  });

  it("shows the 'sign in unavailable' notice when Clerk has not loaded", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("text-clerk-unavailable")).toBeTruthy();
  });

  it("renders 'Checkout as Guest' as the prominent top button when Clerk is unavailable", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    // The guest button should appear before the disabled OAuth buttons in the
    // DOM — when isLoaded=false the component renders it first.
    const guestBtn = screen.getByTestId("button-checkout-as-guest");
    const appleBtn = screen.getByTestId("button-checkout-login-apple");
    expect(guestBtn.compareDocumentPosition(appleBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("OAuth buttons are rendered as disabled when Clerk is unavailable", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    const appleBtn = screen.getByTestId("button-checkout-login-apple") as HTMLButtonElement;
    const googleBtn = screen.getByTestId("button-checkout-login-google") as HTMLButtonElement;
    expect(appleBtn.disabled).toBe(true);
    expect(googleBtn.disabled).toBe(true);
  });

  it("clicking 'Checkout as Guest' calls onContinueAsGuest and closes the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-as-guest"));

    expect(defaultProps.onContinueAsGuest).toHaveBeenCalledOnce();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does NOT render the email input when Clerk is unavailable", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.queryByTestId("input-checkout-login-email")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Clerk loaded (isLoaded = true) — normal signed-out flow
// ---------------------------------------------------------------------------

describe("CheckoutLoginDialog — Clerk loaded, shopper signed out", () => {
  const mockAuthenticateWithRedirect = vi.fn();

  beforeEach(() => {
    (useSignIn as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoaded: true,
      signIn: { authenticateWithRedirect: mockAuthenticateWithRedirect },
    });
    defaultProps.onOpenChange.mockClear();
    defaultProps.onContinueAsGuest.mockClear();
    mockAuthenticateWithRedirect.mockClear();
    mockSetLocation.mockClear();
  });

  it("renders the email input when Clerk is loaded", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("input-checkout-login-email")).toBeTruthy();
  });

  it("renders the Continue button when Clerk is loaded", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("button-checkout-login-continue")).toBeTruthy();
  });

  it("OAuth buttons are enabled when Clerk is loaded", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    const appleBtn = screen.getByTestId("button-checkout-login-apple") as HTMLButtonElement;
    const googleBtn = screen.getByTestId("button-checkout-login-google") as HTMLButtonElement;
    expect(appleBtn.disabled).toBe(false);
    expect(googleBtn.disabled).toBe(false);
  });

  it("shows an email error when Continue is clicked with an invalid email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.type(screen.getByTestId("input-checkout-login-email"), "not-an-email");
    await user.click(screen.getByTestId("button-checkout-login-continue"));

    expect(screen.getByTestId("text-checkout-login-email-error")).toBeTruthy();
  });

  it("navigates to /sign-in with the email hint when Continue is clicked with a valid email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.type(screen.getByTestId("input-checkout-login-email"), "ada@example.com");
    await user.click(screen.getByTestId("button-checkout-login-continue"));

    // Dialog should close and location should be set to the sign-in page.
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSetLocation).toHaveBeenCalledWith(expect.stringContaining("/sign-in"));
    expect(mockSetLocation).toHaveBeenCalledWith(expect.stringContaining("ada%40example.com"));
  });

  it("clicking 'Checkout as Guest' calls onContinueAsGuest and closes the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-as-guest"));

    expect(defaultProps.onContinueAsGuest).toHaveBeenCalledOnce();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking the Google button calls signIn.authenticateWithRedirect with oauth_google", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-login-google"));

    expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "oauth_google" }),
    );
  });

  it("clicking the Apple button calls signIn.authenticateWithRedirect with oauth_apple", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-login-apple"));

    expect(mockAuthenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "oauth_apple" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: dialog closed (open=false) — nothing renders
// ---------------------------------------------------------------------------

describe("CheckoutLoginDialog — closed state", () => {
  beforeEach(() => {
    (useSignIn as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoaded: true,
      signIn: { authenticateWithRedirect: vi.fn() },
    });
  });

  it("renders nothing when open=false", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId("dialog-checkout-login")).toBeNull();
    expect(screen.queryByTestId("input-checkout-login-email")).toBeNull();
    expect(screen.queryByTestId("button-checkout-as-guest")).toBeNull();
  });
});

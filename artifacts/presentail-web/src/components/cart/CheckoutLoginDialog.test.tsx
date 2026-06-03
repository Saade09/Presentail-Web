// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({
    children,
    ...rest
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...rest}>{children}</div>
  ),
}));

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
// Tests: normal signed-out shopper (no Clerk dependency)
// ---------------------------------------------------------------------------

describe("CheckoutLoginDialog — normal signed-out shopper", () => {
  beforeEach(() => {
    defaultProps.onOpenChange.mockClear();
    defaultProps.onContinueAsGuest.mockClear();
    mockSetLocation.mockClear();
  });

  it("renders the email input", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("input-checkout-login-email")).toBeTruthy();
  });

  it("renders the Continue button", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("button-checkout-login-continue")).toBeTruthy();
  });

  it("renders the Apple OAuth button enabled", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    const btn = screen.getByTestId(
      "button-checkout-login-apple"
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders the Google OAuth button enabled", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    const btn = screen.getByTestId(
      "button-checkout-login-google"
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("renders the 'Checkout as Guest' button", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);
    expect(screen.getByTestId("button-checkout-as-guest")).toBeTruthy();
  });

  it("shows an email error when Continue is clicked with an invalid email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.type(
      screen.getByTestId("input-checkout-login-email"),
      "not-an-email"
    );
    await user.click(screen.getByTestId("button-checkout-login-continue"));

    expect(
      screen.getByTestId("text-checkout-login-email-error")
    ).toBeTruthy();
  });

  it("navigates to /sign-in with the email hint when Continue is clicked with a valid email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.type(
      screen.getByTestId("input-checkout-login-email"),
      "ada@example.com"
    );
    await user.click(screen.getByTestId("button-checkout-login-continue"));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("/sign-in")
    );
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("ada%40example.com")
    );
  });

  it("clicking 'Checkout as Guest' calls onContinueAsGuest and closes the dialog", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-as-guest"));

    expect(defaultProps.onContinueAsGuest).toHaveBeenCalledOnce();
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clicking the Google button navigates to /sign-in?strategy=oauth_google", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-login-google"));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("strategy=oauth_google")
    );
  });

  it("clicking the Apple button navigates to /sign-in?strategy=oauth_apple", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} />);

    await user.click(screen.getByTestId("button-checkout-login-apple"));

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockSetLocation).toHaveBeenCalledWith(
      expect.stringContaining("strategy=oauth_apple")
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: dialog closed — nothing renders
// ---------------------------------------------------------------------------

describe("CheckoutLoginDialog — closed state", () => {
  it("renders nothing when open=false", () => {
    renderWithProviders(<CheckoutLoginDialog {...defaultProps} open={false} />);
    expect(screen.queryByTestId("dialog-checkout-login")).toBeNull();
    expect(screen.queryByTestId("input-checkout-login-email")).toBeNull();
    expect(screen.queryByTestId("button-checkout-as-guest")).toBeNull();
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported so Vitest
// can hoist them before any other import in this file.
// ---------------------------------------------------------------------------

vi.mock("@/contexts/CartContext", () => ({
  useCart: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: vi.fn(),
}));

vi.mock("@/lib/useDisplayCurrency", () => ({
  useDisplayCurrency: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

// Capture the mock setter so tests can assert it was called.
const mockSetLocation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/cart", mockSetLocation]),
  // Render as a plain <a> so userEvent.click works without real routing.
  Link: ({ children, href, onClick, ...rest }: React.PropsWithChildren<{ href: string; onClick?: React.MouseEventHandler; [k: string]: unknown }>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
}));

// Replace heavy sub-components with no-ops so we only exercise Cart's logic.
vi.mock("@/components/cart/FreeDeliveryBanner", () => ({
  FreeDeliveryBanner: () => null,
}));

vi.mock("@/components/cart/CartUpsells", () => ({
  CartUpsells: () => null,
}));

vi.mock("@/components/delivery/DeliveryDateRow", () => ({
  DeliveryDateRow: () => null,
}));

// Spy on the dialog open state via its `open` prop.
const mockDialogProps: { open: boolean } = { open: false };
vi.mock("@/components/cart/CheckoutLoginDialog", () => ({
  CheckoutLoginDialog: (props: { open: boolean; onContinueAsGuest: () => void; onOpenChange: (v: boolean) => void; surface: string }) => {
    mockDialogProps.open = props.open;
    return props.open ? <div data-testid="mock-login-dialog" /> : null;
  },
}));

// ---------------------------------------------------------------------------
// Import the component under test AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Cart from "./Cart";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_ITEM = {
  product: {
    id: "p1",
    name: "Red Roses Bouquet",
    priceValue: 75,
    image: null,
    slug: "red-roses-bouquet",
  },
  quantity: 1,
};

function setupMocks({
  user = null as { id: string; email: string; firstName: string; lastName: string } | null,
  isLoading = false,
} = {}) {
  (useCart as ReturnType<typeof vi.fn>).mockReturnValue({
    items: [FAKE_ITEM],
    updateQuantity: vi.fn(),
    removeItem: vi.fn(),
    subtotal: 75,
    itemCount: 1,
  });

  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user,
    isLoading,
    token: user ? "clerk" : null,
    logout: vi.fn(),
  });

  (useLocale as ReturnType<typeof vi.fn>).mockReturnValue({
    t: (key: string) => key,
    dir: "ltr",
    lang: "en",
  });

  (useDisplayCurrency as ReturnType<typeof vi.fn>).mockReturnValue({
    formatPrice: (v: number) => `$${v}`,
  });

  mockDialogProps.open = false;
  mockSetLocation.mockClear();
}

// ---------------------------------------------------------------------------
// Tests: "Proceed to Checkout" button navigation / dialog behaviour
// ---------------------------------------------------------------------------

describe("Cart — Proceed to Checkout button", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("navigates directly to /checkout when auth is still loading (authLoading=true)", async () => {
    setupMocks({ user: null, isLoading: true });
    const user = userEvent.setup();
    render(<Cart />);

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // Should navigate without opening the login dialog.
    expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
    expect(mockDialogProps.open).toBe(false);
  });

  it("opens the login dialog when auth is loaded and shopper is signed out", async () => {
    setupMocks({ user: null, isLoading: false });
    const user = userEvent.setup();
    const { rerender } = render(<Cart />);

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // setLocation must NOT be called — the dialog should open instead.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/checkout");

    // Rerender to pick up the updated loginOpen state reflected in the mock.
    rerender(<Cart />);
    expect(screen.getByTestId("mock-login-dialog")).toBeTruthy();
  });

  it("does NOT open the login dialog and does NOT call setLocation when shopper is signed in", async () => {
    const signedInUser = { id: "u1", email: "a@b.com", firstName: "Ada", lastName: "B" };
    setupMocks({ user: signedInUser, isLoading: false });
    const user = userEvent.setup();
    render(<Cart />);

    await user.click(screen.getByTestId("link-proceed-to-checkout"));

    // handleProceed returns early for signed-in users — neither branch fires.
    expect(mockSetLocation).not.toHaveBeenCalledWith("/checkout");
    expect(mockDialogProps.open).toBe(false);
    expect(screen.queryByTestId("mock-login-dialog")).toBeNull();
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported.
// ---------------------------------------------------------------------------

vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/sign-in", mockSetLocation]),
  useRouter: vi.fn(() => ({ base: "" })),
}));

vi.mock("@/lib/authScripts", () => ({
  loadAuthScripts: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({ login: vi.fn() })),
  AuthOverrideContext: {
    Provider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  },
}));

vi.mock("@/components/auth/CompleteProfileDialog", () => ({
  CompleteProfileDialog: () => null,
}));

vi.mock("@/components/Logo", () => ({
  Logo: () => <svg data-testid="logo" />,
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
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SignInPage from "./SignIn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubFetch(response: object, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    json: async () => response,
  } as Response);
}

// ---------------------------------------------------------------------------
// Tests: onContinueEmail → goToSignUp redirect_url preservation
// ---------------------------------------------------------------------------

describe("SignIn — onContinueEmail with new email preserves redirect_url", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetLocation.mockClear();
  });

  it("navigates to /sign-up with redirect_url=/checkout when email is not registered", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?redirect_url=%2Fcheckout", href: "" },
      writable: true,
    });

    stubFetch({ ok: true, userExists: false });

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    const emailInput = screen.getByTestId("input-signin-email");
    await user.type(emailInput, "newuser@example.com");
    await user.click(screen.getByTestId("button-signin-continue"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/sign-up"),
      );
    });

    const destination = mockSetLocation.mock.calls[0][0] as string;
    const params = new URLSearchParams(destination.split("?")[1]);
    expect(params.get("redirect_url")).toBe("/checkout");
    expect(params.get("email_address")).toBe("newuser@example.com");
  });

  it("does NOT include redirect_url in sign-up URL when there is no redirect param", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "", href: "" },
      writable: true,
    });

    stubFetch({ ok: true, userExists: false });

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    const emailInput = screen.getByTestId("input-signin-email");
    await user.type(emailInput, "newuser@example.com");
    await user.click(screen.getByTestId("button-signin-continue"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/sign-up"),
      );
    });

    const destination = mockSetLocation.mock.calls[0][0] as string;
    const params = new URLSearchParams(destination.split("?")[1]);
    expect(params.get("redirect_url")).toBeNull();
  });

  it("advances to password step (does NOT call goToSignUp) when email is a known password account", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?redirect_url=%2Fcheckout", href: "" },
      writable: true,
    });

    stubFetch({ ok: true, userExists: true, passwordLoginAvailable: true });

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    const emailInput = screen.getByTestId("input-signin-email");
    await user.type(emailInput, "existing@example.com");
    await user.click(screen.getByTestId("button-signin-continue"));

    // password step is shown — goToSignUp must NOT be called
    await waitFor(() => {
      expect(screen.getByTestId("text-signin-account-found")).toBeTruthy();
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it("calls /api/auth/web-bridge with the trimmed, lowercased email", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "", href: "" },
      writable: true,
    });

    const fetchSpy = stubFetch({ ok: true, userExists: false });

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    await user.type(screen.getByTestId("input-signin-email"), "  New@Example.COM  ");
    await user.click(screen.getByTestId("button-signin-continue"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/auth/web-bridge",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.email).toBe("new@example.com");
  });

  it("shows a toast and stays on the email step when web-bridge returns a non-ok HTTP status", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const toastFn = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: toastFn } as any);

    Object.defineProperty(window, "location", {
      value: { search: "", href: "" },
      writable: true,
    });

    stubFetch({ ok: false }, false);

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    await user.type(screen.getByTestId("input-signin-email"), "someone@example.com");
    await user.click(screen.getByTestId("button-signin-continue"));

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled();
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
    expect(screen.getByTestId("input-signin-email")).toBeTruthy();
  });

  it("preserves return_to param (legacy alias) in the sign-up URL", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?return_to=%2Fcheckout", href: "" },
      writable: true,
    });

    stubFetch({ ok: true, userExists: false });

    const user = userEvent.setup();
    renderWithProviders(<SignInPage />);

    await user.type(screen.getByTestId("input-signin-email"), "newuser@example.com");
    await user.click(screen.getByTestId("button-signin-continue"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        expect.stringContaining("/sign-up"),
      );
    });

    const destination = mockSetLocation.mock.calls[0][0] as string;
    const params = new URLSearchParams(destination.split("?")[1]);
    expect(params.get("redirect_url")).toBe("/checkout");
  });
});

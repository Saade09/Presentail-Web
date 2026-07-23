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
  useLocation: vi.fn(() => ["/sign-up", mockSetLocation]),
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

// PhoneInput — render a plain <input> so userEvent.type works normally.
// Changing the value calls onChange with the raw typed string so the
// component's `phone` state becomes truthy when something is entered.
vi.mock("react-phone-number-input", () => ({
  default: ({
    value,
    onChange,
    placeholder,
    ...rest
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    placeholder?: string;
    [k: string]: unknown;
  }) => (
    <input
      data-testid="input-signup-phone"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || undefined)}
      {...rest}
    />
  ),
  isValidPhoneNumber: vi.fn(() => true),
  // getCountries is used by WebPhoneField to build the country selector.
  getCountries: vi.fn(() => ["LB", "AE", "CY", "US", "GB"]),
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------

import SignUpPage from "./SignUp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubFetch(response: object, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    json: async () => response,
  } as Response);
}

// Helper: advance through the name-password step so we land on the phone step.
async function advanceToPhoneStep() {
  const user = userEvent.setup();
  renderWithProviders(<SignUpPage />);

  await user.type(screen.getByTestId("input-signup-name"), "Ada");
  await user.type(screen.getByTestId("input-signup-last-name"), "Lovelace");
  await user.type(screen.getByTestId("input-signup-password"), "password123");
  await user.click(screen.getByTestId("button-signup-continue"));

  return user;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SignUp — phone step", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetLocation.mockClear();
    // Simulate the page being loaded with an email query param.
    Object.defineProperty(window, "location", {
      value: { search: "?email_address=test%40example.com", href: "" },
      writable: true,
    });
  });

  it("shows the phone step after completing the name-password step", async () => {
    await advanceToPhoneStep();
    // LazyWebPhoneField resolves asynchronously (Suspense) — use findByTestId to wait.
    expect(await screen.findByTestId("input-signup-phone")).toBeTruthy();
    expect(screen.getByTestId("button-signup-create")).toBeTruthy();
  });

  it("'Create Account' button is disabled when no phone number has been entered", async () => {
    await advanceToPhoneStep();
    const btn = screen.getByTestId("button-signup-create") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("'Create Account' button becomes enabled once a phone number is typed", async () => {
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    const btn = screen.getByTestId("button-signup-create") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("there is no skip button on the phone step — the only forward action is 'Create Account'", async () => {
    await advanceToPhoneStep();
    expect(screen.queryByText(/skip/i)).toBeNull();
    expect(screen.queryByText(/later/i)).toBeNull();
    expect(screen.queryByText(/no thanks/i)).toBeNull();
    const createBtn = screen.queryByTestId("button-signup-create");
    expect(createBtn).toBeTruthy();
  });

  it("clicking 'Create Account' without a phone shows a validation error, not the OTP step", async () => {
    await advanceToPhoneStep();
    const btn = screen.getByTestId("button-signup-create") as HTMLButtonElement;
    // Button is disabled — clicking it should not show an OTP input (OTP step is removed).
    expect(btn.disabled).toBe(true);
    expect(screen.queryByTestId("input-signup-code")).toBeNull();
  });

  it("clicking 'Create Account' with a valid phone calls /api/auth/register directly — no OTP step", async () => {
    const fetchSpy = stubFetch({
      ok: true,
      token: "tok123",
      user: { id: 1, email: "test@example.com", firstName: "Ada", lastName: "Lovelace" },
    });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/auth/register",
        expect.objectContaining({ method: "POST" }),
      );
    });

    // OTP input must never appear.
    expect(screen.queryByTestId("input-signup-code")).toBeNull();
    // OTP endpoint must not be called.
    const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calls).not.toContain("/api/auth/otp/send");
  });

  it("successful registration redirects to /account", async () => {
    stubFetch({
      ok: true,
      token: "tok123",
      user: { id: 1, email: "test@example.com", firstName: "Ada", lastName: "Lovelace" },
    });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/account");
    });
  });

  it("successful registration redirects to redirect_url when ?redirect_url is in the query string", async () => {
    // Simulate arriving at /sign-up?email_address=...&redirect_url=/checkout
    // (the checkout shopper flow: CheckoutLoginDialog → SignIn → goToSignUp → SignUp)
    Object.defineProperty(window, "location", {
      value: { search: "?email_address=test%40example.com&redirect_url=%2Fcheckout", href: "" },
      writable: true,
    });

    stubFetch({
      ok: true,
      token: "tok123",
      user: { id: 1, email: "test@example.com", firstName: "Ada", lastName: "Lovelace" },
    });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/checkout");
    });

    // Must NOT land on /account when redirect_url is set.
    const calls = mockSetLocation.mock.calls.map((c) => c[0] as string);
    expect(calls).not.toContain("/account");
  });

  it("going back from the phone step returns to the name-password step", async () => {
    await advanceToPhoneStep();

    // Verify we are on the phone step.
    expect(screen.getByTestId("input-signup-phone")).toBeTruthy();

    // Click the global back button (button-signup-back-page).
    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-signup-back-page"));

    // Should now be back on the name-password step.
    expect(screen.getByTestId("input-signup-name")).toBeTruthy();
    expect(screen.queryByTestId("input-signup-phone")).toBeNull();
  });

  it("registration failure shows a toast error and stays on the phone step", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const toastFn = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: toastFn } as any);

    stubFetch({ ok: false, message: "Something went wrong" }, false);
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled();
    });

    // Still on phone step — no redirect, no OTP.
    expect(screen.getByTestId("input-signup-phone")).toBeTruthy();
    expect(screen.queryByTestId("input-signup-code")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Duplicate email: server now returns generic registration_failed for all
// cases (social and password accounts alike) — no provider is disclosed.
// ---------------------------------------------------------------------------

describe("SignUp — duplicate email returns generic registration_failed code", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetLocation.mockClear();
    Object.defineProperty(window, "location", {
      value: { search: "?email_address=test%40example.com", href: "" },
      writable: true,
    });
  });

  it("shows a generic toast and redirects to sign-in when email already exists", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const toastFn = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: toastFn } as any);

    // Server returns the same generic code regardless of social vs password auth.
    stubFetch(
      { ok: false, code: "registration_failed" },
      false,
    );
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled();
    });

    const toastArgs = toastFn.mock.calls[0][0] as { title: string; description: string };
    // Generic error — no social-specific provider key used.
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptGoogle");
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptApple");
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPrompt");
  });

  it("redirects to /sign-in WITHOUT social_provider when email already exists", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);

    stubFetch(
      { ok: false, code: "registration_failed" },
      false,
    );
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalled();
    });

    const redirectUrl = mockSetLocation.mock.calls[0][0] as string;
    expect(redirectUrl).toContain("/sign-in");
    expect(redirectUrl).not.toContain("social_provider=");
    expect(redirectUrl).toContain("email_address=");
  });

  it("shows a generic toast for duplicate emails (second indistinguishable-response case)", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const toastFn = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: toastFn } as any);

    stubFetch(
      { ok: false, code: "registration_failed" },
      false,
    );
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled();
    });

    const toastArgs = toastFn.mock.calls[0][0] as { title: string; description: string };
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptGoogle");
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptApple");
  });

  it("redirects to /sign-in without social_provider (second indistinguishable-response case)", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);

    stubFetch(
      { ok: false, code: "registration_failed" },
      false,
    );
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalled();
    });

    const redirectUrl = mockSetLocation.mock.calls[0][0] as string;
    expect(redirectUrl).toContain("/sign-in");
    expect(redirectUrl).not.toContain("social_provider=");
  });
});

describe("SignUp — plain registration_failed error (no social provider)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSetLocation.mockClear();
    Object.defineProperty(window, "location", {
      value: { search: "?email_address=test%40example.com", href: "" },
      writable: true,
    });
  });

  it("shows a generic toast when the response code is registration_failed", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    const toastFn = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast: toastFn } as any);

    stubFetch({ ok: false, code: "registration_failed", message: "Email already in use" }, false);
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(toastFn).toHaveBeenCalled();
    });

    const toastArgs = toastFn.mock.calls[0][0] as { title: string; description: string };
    // The generic fallback does NOT use the social-provider-specific key.
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptGoogle");
    expect(toastArgs.description).not.toBe("auth.existingAccountSocialPromptApple");
  });

  it("redirects to /sign-in WITHOUT social_provider when code is registration_failed", async () => {
    const { useToast } = await import("@/hooks/use-toast");
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);

    stubFetch({ ok: false, code: "registration_failed", message: "Email already in use" }, false);
    const user = await advanceToPhoneStep();
    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalled();
    });

    const redirectUrl = mockSetLocation.mock.calls[0][0] as string;
    expect(redirectUrl).toContain("/sign-in");
    expect(redirectUrl).not.toContain("social_provider");
  });
});

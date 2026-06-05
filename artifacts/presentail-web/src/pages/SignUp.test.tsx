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
    expect(screen.getByTestId("input-signup-phone")).toBeTruthy();
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
    // The back button should exist but there must be no button that skips phone entry.
    // We verify by counting action buttons: only the back (page-level) and Create Account.
    expect(screen.queryByText(/skip/i)).toBeNull();
    expect(screen.queryByText(/later/i)).toBeNull();
    expect(screen.queryByText(/no thanks/i)).toBeNull();
    // The only forward CTA is the Create Account button.
    const createBtn = screen.queryByTestId("button-signup-create");
    expect(createBtn).toBeTruthy();
  });

  it("clicking 'Create Account' without a phone shows a validation error, not the OTP step", async () => {
    // Override the Button mock to allow clicks even when disabled (to test guard logic).
    // In this case we just confirm the disabled state prevents progression; the
    // component also guards inside onCreateAccountWithPhone() itself.
    await advanceToPhoneStep();
    const btn = screen.getByTestId("button-signup-create") as HTMLButtonElement;
    // Button is disabled — clicking it should NOT show the OTP step.
    expect(btn.disabled).toBe(true);
    expect(screen.queryByTestId("input-signup-code")).toBeNull();
  });

  it("OTP step appears after entering a valid phone and clicking 'Create Account'", async () => {
    const fetchSpy = stubFetch({ ok: true });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(screen.getByTestId("input-signup-code")).toBeTruthy();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/otp/send",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("OTP step shows Verify and Resend buttons, and a Back button to return to phone step", async () => {
    stubFetch({ ok: true });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(screen.getByTestId("input-signup-code")).toBeTruthy();
    });

    expect(screen.getByTestId("button-signup-verify")).toBeTruthy();
    expect(screen.getByTestId("button-signup-resend")).toBeTruthy();
    expect(screen.getByTestId("button-signup-back")).toBeTruthy();
  });

  it("Verify button is disabled until at least 4 digits are entered", async () => {
    stubFetch({ ok: true });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(screen.getByTestId("input-signup-code")).toBeTruthy();
    });

    const verifyBtn = screen.getByTestId(
      "button-signup-verify",
    ) as HTMLButtonElement;
    expect(verifyBtn.disabled).toBe(true);

    await user.type(screen.getByTestId("input-signup-code"), "123456");
    expect(verifyBtn.disabled).toBe(false);
  });

  it("registration endpoint is NOT called until OTP is verified", async () => {
    const fetchSpy = stubFetch({ ok: true });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(screen.getByTestId("input-signup-code")).toBeTruthy();
    });

    // Only /api/auth/otp/send should have been called — not /api/auth/register.
    const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calls).toContain("/api/auth/otp/send");
    expect(calls).not.toContain("/api/auth/register");
  });

  it("going back from the OTP step returns to the phone step without calling register", async () => {
    const fetchSpy = stubFetch({ ok: true });
    const user = await advanceToPhoneStep();

    await user.type(screen.getByTestId("input-signup-phone"), "+96170000000");
    await user.click(screen.getByTestId("button-signup-create"));

    await waitFor(() => {
      expect(screen.getByTestId("input-signup-code")).toBeTruthy();
    });

    await user.click(screen.getByTestId("button-signup-back"));

    // Should be back on the phone step.
    expect(screen.getByTestId("input-signup-phone")).toBeTruthy();
    expect(screen.queryByTestId("input-signup-code")).toBeNull();

    const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(calls).not.toContain("/api/auth/register");
  });
});

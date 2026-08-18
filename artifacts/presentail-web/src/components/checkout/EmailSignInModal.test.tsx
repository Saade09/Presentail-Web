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

const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/", mockSetLocation]),
  useRouter: vi.fn(() => ({ base: "" })),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div {...rest}>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    ...rest
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit";
    [k: string]: unknown;
  }>) => (
    <button type={type ?? "button"} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

import { EmailSignInModal } from "./EmailSignInModal";

const onSuccess = vi.fn();
const onContinueAsGuest = vi.fn();
const onBack = vi.fn();

function renderModal(open = true) {
  return renderWithProviders(
    <EmailSignInModal
      open={open}
      onOpenChange={vi.fn()}
      onSuccess={onSuccess}
      onContinueAsGuest={onContinueAsGuest}
      onBack={onBack}
    />,
  );
}

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("EmailSignInModal", () => {
  it("email step: no password field until the email is submitted", () => {
    renderModal();
    expect(screen.getByTestId("input-email-modal-email")).toBeTruthy();
    expect(screen.queryByTestId("input-email-modal-password")).toBeNull();
    expect(screen.getByTestId("button-email-modal-guest")).toBeTruthy();
    expect(screen.getByTestId("button-email-modal-back")).toBeTruthy();
  });

  it("invalid email shows inline validation without calling the API", async () => {
    renderModal();
    await userEvent.type(screen.getByTestId("input-email-modal-email"), "not-an-email");
    await userEvent.click(screen.getByTestId("button-email-modal-continue"));
    expect(screen.getByTestId("text-email-modal-error")).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("existing account continues to the password step", async () => {
    mockFetchOnce(200, { ok: true, userExists: true, passwordLoginAvailable: true });
    renderModal();
    await userEvent.type(screen.getByTestId("input-email-modal-email"), "a@b.com");
    await userEvent.click(screen.getByTestId("button-email-modal-continue"));
    await waitFor(() => expect(screen.getByTestId("input-email-modal-password")).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/web-bridge",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("unknown email offers account creation AND guest, forcing neither", async () => {
    mockFetchOnce(200, { ok: true, userExists: false });
    renderModal();
    await userEvent.type(screen.getByTestId("input-email-modal-email"), "new@b.com");
    await userEvent.click(screen.getByTestId("button-email-modal-continue"));
    await waitFor(() =>
      expect(screen.getByTestId("button-email-modal-create-account")).toBeTruthy(),
    );
    expect(screen.getByTestId("button-email-modal-guest")).toBeTruthy();
    expect(screen.queryByTestId("input-email-modal-password")).toBeNull();
  });

  it("login success calls onSuccess with token+user and fires checkout_auth_completed", async () => {
    mockFetchOnce(200, { ok: true, userExists: true, passwordLoginAvailable: true });
    renderModal();
    await userEvent.type(screen.getByTestId("input-email-modal-email"), "a@b.com");
    await userEvent.click(screen.getByTestId("button-email-modal-continue"));
    await waitFor(() => expect(screen.getByTestId("input-email-modal-password")).toBeTruthy());
    mockFetchOnce(200, {
      ok: true,
      token: "tok",
      user: { id: 7, email: "a@b.com", firstName: "A", lastName: "B" },
    });
    await userEvent.type(screen.getByTestId("input-email-modal-password"), "secret123");
    await userEvent.click(screen.getByTestId("button-email-modal-signin"));
    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith("tok", expect.objectContaining({ id: "7" })),
    );
    const types = trackWebEvent.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("checkout_auth_completed");
  });

  it("login failure shows an inline error and keeps the typed email", async () => {
    mockFetchOnce(200, { ok: true, userExists: true, passwordLoginAvailable: true });
    renderModal();
    await userEvent.type(screen.getByTestId("input-email-modal-email"), "a@b.com");
    await userEvent.click(screen.getByTestId("button-email-modal-continue"));
    await waitFor(() => expect(screen.getByTestId("input-email-modal-password")).toBeTruthy());
    mockFetchOnce(401, { ok: false, code: "incorrect_password" });
    await userEvent.type(screen.getByTestId("input-email-modal-password"), "wrong");
    await userEvent.click(screen.getByTestId("button-email-modal-signin"));
    await waitFor(() => expect(screen.getByTestId("text-email-modal-error")).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
    // Change-email returns to the email step with the address intact.
    await userEvent.click(screen.getByTestId("button-email-modal-change-email"));
    expect(
      (screen.getByTestId("input-email-modal-email") as HTMLInputElement).value,
    ).toBe("a@b.com");
    const failed = trackWebEvent.mock.calls
      .map((c) => c[0] as { type: string; properties?: Record<string, unknown> })
      .find((e) => e.type === "checkout_auth_failed");
    expect(failed?.properties?.error_category).toBe("invalid_credentials");
  });

  it("Continue as Guest fires checkout_continue_as_guest and invokes the callback", async () => {
    renderModal();
    await userEvent.click(screen.getByTestId("button-email-modal-guest"));
    expect(onContinueAsGuest).toHaveBeenCalled();
    const types = trackWebEvent.mock.calls.map((c) => (c[0] as { type: string }).type);
    expect(types).toContain("checkout_continue_as_guest");
  });

  it("back link invokes onBack", async () => {
    renderModal();
    await userEvent.click(screen.getByTestId("button-email-modal-back"));
    expect(onBack).toHaveBeenCalled();
  });
});

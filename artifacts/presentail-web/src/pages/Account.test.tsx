// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test-utils";

// ---------------------------------------------------------------------------
// Module mocks — declared before component imports so Vitest can hoist them.
// ---------------------------------------------------------------------------

// Capture toast so tests can assert it was called.
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: vi.fn(() => ({ toast: mockToast })),
}));

// Capture apiFetch so we can control GET /auth/me and assert PUT /auth/me.
const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// Routing — useSearch drives the active tab (empty → "profile").
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: vi.fn(() => ["/account", mockSetLocation]),
  useSearch: vi.fn(() => ""),
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [k: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Stub heavy query hooks that are not under test.
vi.mock("@/lib/queries", () => ({
  useMyOrders: vi.fn(() => ({ data: null, isLoading: false, isError: false })),
  useDeliveryLocations: vi.fn(() => ({ data: null })),
  useProducts: vi.fn(() => ({ data: null, isLoading: false })),
}));

// Stub FavoritesContext.
vi.mock("@/contexts/FavoritesContext", () => ({
  useFavorites: vi.fn(() => ({ favorites: new Set(), isLoaded: true })),
}));

// Stub LocationContext.
vi.mock("@/contexts/LocationContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/LocationContext")>();
  return {
    ...actual,
    useLocationSelection: vi.fn(() => ({
      countryCode: "LB",
      city: null,
      country: null,
      cityId: null,
      isLoading: false,
      isPickerOpen: false,
      openPicker: vi.fn(),
      closePicker: vi.fn(),
      setLocation: vi.fn(),
    })),
  };
});

// Stub all account sub-components so they don't import their own heavy trees.
vi.mock("@/components/loyalty/LoyaltyPanel", () => ({
  LoyaltyPanel: () => null,
}));
vi.mock("@/components/account/AccountOrderCard", () => ({
  AccountOrderCard: () => null,
  AccountOrderCardSkeleton: () => null,
}));
vi.mock("@/components/account/AccountShortcutCards", () => ({
  AccountShortcutCards: () => null,
}));
vi.mock("@/components/account/AccountSidebar", () => ({
  AccountSidebar: () => null,
  MobileTabStrip: () => null,
}));
vi.mock("@/components/account/DeleteAccountDialog", () => ({
  DeleteAccountDialog: () => null,
}));
vi.mock("@/components/account/EmptyState", () => ({
  EmptyState: () => null,
}));
vi.mock("@/components/account/OccasionsPanel", () => ({
  OccasionsPanel: () => null,
}));
vi.mock("@/components/account/ReferralsPanel", () => ({
  ReferralsPanel: () => null,
}));
vi.mock("@/components/ProductCard", () => ({
  ProductCard: () => null,
}));
vi.mock("@/components/CountryFlag", () => ({
  CountryFlag: () => null,
}));
vi.mock("@/components/WebPhoneField", () => ({
  WebPhoneField: () => null,
}));
vi.mock("react-phone-number-input", () => ({
  isValidPhoneNumber: vi.fn(() => true),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));

// ---------------------------------------------------------------------------
// Import the component AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Account from "./Account";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SIGNED_IN_USER = {
  id: "u1",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
};

const ME_RESPONSE = {
  ok: true,
  user: {
    id: 1,
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: null,
    gender: null,
    birthday: null,
  },
};

// ---------------------------------------------------------------------------
// Helper: render Account with a signed-in user and prime apiFetch defaults.
// ---------------------------------------------------------------------------

function renderAccount(
  authOverride: Partial<typeof SIGNED_IN_USER & { provider?: string }> = {},
) {
  // GET /auth/me resolves with the ME_RESPONSE fixture.
  // GET /loyalty/me resolves with a basic loyalty payload.
  // Any other call resolves with { ok: true }.
  mockApiFetch.mockImplementation((path: string) => {
    if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
    if (path === "/loyalty/me")
      return Promise.resolve({ ok: true, loyalty: { points: 0 } });
    return Promise.resolve({ ok: true });
  });

  return renderWithProviders(<Account />, {
    auth: {
      user: { ...SIGNED_IN_USER, ...authOverride },
      isLoading: false,
      token: "tok",
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: open the edit-name dialog and wait for its inputs to appear.
// ---------------------------------------------------------------------------

async function openEditNameDialog(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the initial GET /auth/me to settle so the button is rendered.
  await waitFor(() => {
    expect(screen.getByTestId("profile-edit-name-btn")).toBeTruthy();
  });
  await user.click(screen.getByTestId("profile-edit-name-btn"));
  await waitFor(() => {
    expect(screen.getByTestId("edit-name-first")).toBeTruthy();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Account — EditNameDialog: happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    mockToast.mockClear();
  });

  it("opens the dialog when the pencil button is clicked", async () => {
    const user = userEvent.setup();
    renderAccount();

    await openEditNameDialog(user);

    expect(screen.getByTestId("edit-name-first")).toBeTruthy();
    expect(screen.getByTestId("edit-name-last")).toBeTruthy();
    expect(screen.getByTestId("edit-name-save")).toBeTruthy();
  });

  it("pre-fills inputs with the current name values", async () => {
    const user = userEvent.setup();
    renderAccount();

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    const lastInput = screen.getByTestId("edit-name-last") as HTMLInputElement;
    expect(firstInput.value).toBe("Ada");
    expect(lastInput.value).toBe("Lovelace");
  });

  it("calls PUT /auth/me with updated names and shows success toast", async () => {
    const user = userEvent.setup();
    renderAccount();

    // Prime the PUT response.
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT")
        return Promise.resolve({ ok: true });
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    // Change first name.
    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Grace");

    // Change last name.
    const lastInput = screen.getByTestId("edit-name-last") as HTMLInputElement;
    await user.clear(lastInput);
    await user.type(lastInput, "Hopper");

    await user.click(screen.getByTestId("edit-name-save"));

    await waitFor(() => {
      // apiFetch should have been called with PUT /auth/me.
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/auth/me",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ firstName: "Grace", lastName: "Hopper" }),
        }),
      );
    });

    // Success toast should fire.
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "pi.updated.title" }),
      );
    });
  });

  it("reflects the new name in the profile panel after saving", async () => {
    const user = userEvent.setup();
    renderAccount();

    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT")
        return Promise.resolve({ ok: true });
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Grace");

    await user.click(screen.getByTestId("edit-name-save"));

    // Dialog should close; new name should appear in the profile card.
    await waitFor(() => {
      expect(screen.queryByTestId("edit-name-save")).toBeNull();
    });
    expect(screen.getByText("Grace")).toBeTruthy();
  });

  it("works identically for a Google sign-in session (provider=google)", async () => {
    const user = userEvent.setup();
    renderAccount({ provider: "google" } as any);

    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT")
        return Promise.resolve({ ok: true });
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Grace");

    await user.click(screen.getByTestId("edit-name-save"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/auth/me",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "pi.updated.title" }),
      );
    });
  });

  it("works identically for an Apple sign-in session (provider=apple)", async () => {
    const user = userEvent.setup();
    renderAccount({ provider: "apple" } as any);

    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT")
        return Promise.resolve({ ok: true });
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Grace");

    await user.click(screen.getByTestId("edit-name-save"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/auth/me",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "pi.updated.title" }),
      );
    });
  });
});

describe("Account — EditNameDialog: validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLocation.mockClear();
    mockToast.mockClear();
  });

  it("shows a validation toast and does NOT call PUT when first name is cleared", async () => {
    const user = userEvent.setup();
    renderAccount();

    // Track PUT calls specifically.
    const putSpy = vi.fn();
    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT") {
        putSpy();
        return Promise.resolve({ ok: true });
      }
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    // Clear the first name field entirely.
    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    expect(firstInput.value).toBe("");

    await user.click(screen.getByTestId("edit-name-save"));

    // Validation toast should fire.
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "pi.error.title",
          variant: "destructive",
        }),
      );
    });

    // PUT must NOT have been called.
    expect(putSpy).not.toHaveBeenCalled();
  });

  it("dialog stays open after a failed validation attempt", async () => {
    const user = userEvent.setup();
    renderAccount();

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);

    await user.click(screen.getByTestId("edit-name-save"));

    // Dialog inputs must still be visible.
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });
    expect(screen.getByTestId("edit-name-first")).toBeTruthy();
    expect(screen.getByTestId("edit-name-save")).toBeTruthy();
  });

  it("shows an error toast and keeps the dialog open when the API call fails", async () => {
    const user = userEvent.setup();
    renderAccount();

    mockApiFetch.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/auth/me" && opts?.method === "PUT")
        return Promise.reject(new Error("Server error"));
      if (path === "/auth/me") return Promise.resolve(ME_RESPONSE);
      if (path === "/loyalty/me")
        return Promise.resolve({ ok: true, loyalty: { points: 0 } });
      return Promise.resolve({ ok: true });
    });

    await openEditNameDialog(user);

    const firstInput = screen.getByTestId("edit-name-first") as HTMLInputElement;
    await user.clear(firstInput);
    await user.type(firstInput, "Grace");

    await user.click(screen.getByTestId("edit-name-save"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "pi.error.title",
          variant: "destructive",
        }),
      );
    });

    // Dialog should remain open after an API error.
    expect(screen.getByTestId("edit-name-first")).toBeTruthy();
  });
});

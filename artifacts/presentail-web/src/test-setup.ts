import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Global Clerk mock — keeps useUser / useClerk from throwing when ClerkProvider
// is absent. Tests that provide an AuthOverrideContext value in renderWithProviders
// won't see these values (the override takes precedence). Tests that need specific
// Clerk behaviour can override per-describe with vi.mocked(useUser).mockReturnValue.
vi.mock("@clerk/react", () => ({
  useUser: vi.fn(() => ({ isLoaded: true, isSignedIn: false, user: null })),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
}));

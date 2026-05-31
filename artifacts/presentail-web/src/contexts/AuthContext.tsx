import { createContext, useContext, type ReactNode } from "react";
import { useUser, useClerk } from "@clerk/react";

// Thin compatibility shim so existing components (Navbar, Account, Checkout)
// can keep importing `useAuth` from this module while we migrate to Clerk.
// All identity now flows from Clerk; there is no longer a locally-stored
// `presentail_token` in localStorage and no `login()` mutation — sign-in is
// handled by the Clerk-rendered `<SignIn />` form on `/sign-in`.
export type ShimUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
};

export type AuthContextValue = {
  user: ShimUser | null;
  // `token` is kept for backwards compatibility with callers that used it
  // as a truthy "is signed in" signal (e.g. `!!token`). It returns the
  // sentinel string `"clerk"` when signed in and `null` when not — never
  // the actual JWT (which `apiFetch` resolves on demand from Clerk).
  token: string | null;
  isLoading: boolean;
  logout: () => Promise<void>;
};

// Allows tests to inject a static auth value without needing ClerkProvider.
// Production code never sets this — it defaults to null, so useAuth falls
// through to the real Clerk hooks.
export const AuthOverrideContext = createContext<AuthContextValue | null>(null);

// AuthProvider is intentionally pass-through: ClerkProvider (mounted in
// App.tsx) is the real provider. We keep this component so callers don't
// have to change their tree structure.
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAuth(): AuthContextValue {
  const override = useContext(AuthOverrideContext);

  // Clerk hooks must be called unconditionally (rules of hooks).
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  // Return the test override when present, bypassing Clerk result.
  if (override) return override;

  const mappedUser: ShimUser | null = isSignedIn && user
    ? {
        id: user.id,
        email:
          user.primaryEmailAddress?.emailAddress ??
          user.emailAddresses[0]?.emailAddress ??
          "",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone:
          user.primaryPhoneNumber?.phoneNumber ??
          user.phoneNumbers[0]?.phoneNumber ??
          undefined,
      }
    : null;

  return {
    user: mappedUser,
    token: isSignedIn ? "clerk" : null,
    isLoading: !isLoaded,
    logout: async () => {
      await signOut();
    },
  };
}

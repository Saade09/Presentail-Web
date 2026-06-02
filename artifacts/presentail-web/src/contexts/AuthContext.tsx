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

/**
 * Map a Clerk `UserResource`-shaped object to the `ShimUser` the rest of the
 * app expects. Exported so it can be unit-tested without mounting the React hook.
 *
 * Priority for each field mirrors Clerk's own resolution order:
 *  - email: primaryEmailAddress → first address → ""
 *  - phone: primaryPhoneNumber → first number → undefined
 */
export function mapClerkUserToShimUser(user: {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses: { emailAddress: string }[];
  primaryPhoneNumber?: { phoneNumber: string } | null;
  phoneNumbers: { phoneNumber: string }[];
}): ShimUser {
  return {
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
  };
}

export type AuthContextValue = {
  user: ShimUser | null;
  // `token` is kept for backwards compatibility with callers that used it
  // as a truthy "is signed in" signal (e.g. `!!token`). It returns the
  // sentinel string `"clerk"` when signed in and `null` when not — never
  // the actual JWT (which `apiFetch` resolves on demand from Clerk).
  token: string | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  // Returns a short-lived Clerk JWT for use in Authorization headers.
  // Returns null when signed out or when Clerk is absent/failed.
  getToken: () => Promise<string | null>;
  // Clerk publicMetadata.userType — "customer" | "driver" | "team" | null.
  // Exposed so routes like CustomerOnly can gate on user type without calling
  // Clerk hooks directly (which would throw outside ClerkProvider).
  userType: string | null;
};

// Guest-mode sentinel — returned by useAuth() when no ClerkProvider is
// present or when it failed to initialise. Never blocking.
const GUEST_AUTH_VALUE: AuthContextValue = {
  user: null,
  token: null,
  isLoading: false,
  logout: async () => {},
  getToken: async () => null,
  userType: null,
};

// Single context that carries the resolved auth state. Populated by
// ClerkAuthBridge (inside ClerkProvider) or the ClerkErrorBoundary fallback
// in App.tsx (guest mode). Tests inject a static value via this context so
// they don't need ClerkProvider at all.
export const AuthOverrideContext = createContext<AuthContextValue>(GUEST_AUTH_VALUE);

// AuthProvider is intentionally pass-through: ClerkProvider (mounted in
// App.tsx) is the real provider. We keep this component so callers don't
// have to change their tree structure.
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/**
 * Reads Clerk session state and populates AuthOverrideContext for the subtree.
 * Must be rendered *inside* ClerkProvider — Clerk hooks are only safe there.
 * When ClerkProvider fails to initialise (wrong key, network error), the
 * ClerkErrorBoundary in App.tsx catches the error before this component
 * mounts and provides GUEST_AUTH_VALUE instead.
 */
export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();

  const value: AuthContextValue = {
    user: isLoaded && isSignedIn && user ? mapClerkUserToShimUser(user) : null,
    token: isLoaded && isSignedIn ? "clerk" : null,
    // Never return isLoading:true — shoppers are treated as guests immediately
    // if Clerk hasn't resolved yet (wrong key, slow network, dev env).
    // When Clerk does resolve the user state updates automatically.
    isLoading: false,
    logout: async () => {
      if (isLoaded) await clerk.signOut();
    },
    getToken: async () => {
      if (!isLoaded || !isSignedIn) return null;
      try {
        return (await clerk.session?.getToken()) ?? null;
      } catch {
        return null;
      }
    },
    userType:
      isLoaded && isSignedIn && user
        ? ((user.publicMetadata?.userType as string | null) ?? null)
        : null,
  };

  return (
    <AuthOverrideContext.Provider value={value}>
      {children}
    </AuthOverrideContext.Provider>
  );
}

/**
 * Returns current auth state. Never calls Clerk hooks directly — reads only
 * from AuthOverrideContext, which is populated by ClerkAuthBridge (when
 * Clerk is working) or GUEST_AUTH_VALUE (when Clerk is absent or failed).
 * This makes every consumer (including Checkout) completely independent of
 * Clerk's initialisation state.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthOverrideContext);
}

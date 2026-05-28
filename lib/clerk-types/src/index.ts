// Shared user-type taxonomy for all Presentail surfaces that consume Clerk
// session data. Stored on a Clerk user's `publicMetadata.userType`.
//
// - "customer": end-shopper of the storefront (Presentail web/mobile).
// - "driver":   delivery operator (separate Presentail OS surface).
// - "team":     internal staff / back-office user (Presentail OS).
//
// Importing this module also augments Clerk's global metadata typings so
// `getAuth(req).sessionClaims?.publicMetadata?.userType` and
// `useUser().user?.publicMetadata.userType` are type-safe.
export type UserType = "customer" | "driver" | "team";

export const USER_TYPES: readonly UserType[] = ["customer", "driver", "team"];

export function isUserType(value: unknown): value is UserType {
  return (
    typeof value === "string" &&
    (USER_TYPES as readonly string[]).includes(value)
  );
}

// Returns true when the user is allowed to shop on the storefront.
// Both customers and internal team members can browse, add to cart, and
// check out. Driver and unrecognised user types are redirected away.
export function canShop(userType: UserType | unknown): boolean {
  return userType === "customer" || userType === "team";
}

// Returns true when the user is an internal team/admin member.
export function isAdminUser(userType: UserType | unknown): boolean {
  return userType === "team";
}

declare global {
  interface ClerkAuthorization {
    permission: string;
    role: string;
  }

  interface UserPublicMetadata {
    userType?: UserType;
  }

  interface OrganizationPublicMetadata {
    [key: string]: unknown;
  }

  interface UserPrivateMetadata {
    [key: string]: unknown;
  }

  interface UserUnsafeMetadata {
    [key: string]: unknown;
  }
}

export {};

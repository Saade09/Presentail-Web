import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, createClerkClient } from "@clerk/express";
import { isUserType, type UserType } from "@workspace/clerk-types";

// Reads the `publicMetadata.userType` claim that Clerk embeds in the active
// session JWT (see lib/clerk-types).
function readUserTypeFromClaims(
  auth: ReturnType<typeof getAuth>,
): UserType | null {
  const claims = auth?.sessionClaims as
    | { publicMetadata?: { userType?: unknown } }
    | undefined;
  const fromClaims = claims?.publicMetadata?.userType;
  if (isUserType(fromClaims)) return fromClaims;
  return null;
}

// Resolve `userType` strictly: trust the session claim first, otherwise
// fetch the live user from Clerk (covers users created before the
// session JWT template was updated, or before `user.created` reached the
// webhook). When the live record also has no userType, lazy-tag the
// requested fallback (the first allowed role for this endpoint, which
// is "customer" on the storefront) and treat that as the resolved type.
// This means requireUserType cannot fail open: either we get a verified
// userType, or we deny with 403.
async function resolveClerkUserType(
  req: Request,
  userId: string,
  bootstrapAs: UserType | null,
): Promise<UserType | null> {
  const fromClaims = readUserTypeFromClaims(getAuth(req));
  if (fromClaims) return fromClaims;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const clerk = createClerkClient({ secretKey });
    const live = await clerk.users.getUser(userId);
    const liveType = (live.publicMetadata as { userType?: unknown })?.userType;
    if (isUserType(liveType)) return liveType;
    if (bootstrapAs) {
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { userType: bootstrapAs },
      });
      return bootstrapAs;
    }
    return null;
  } catch (err: any) {
    req.log?.warn?.(
      { err: err?.message, userId },
      "requireUserType: failed to resolve userType from Clerk",
    );
    return null;
  }
}

// Express middleware factory. Behaviour:
//   * No Clerk session on the request → pass through (legacy WP / social
//     JWT flow used by the mobile app handles its own authentication
//     downstream).
//   * Clerk session present → require `publicMetadata.userType` to be in
//     the allowed list. Missing claims are resolved against the live
//     Clerk user record; if still missing, the user is bootstrapped to
//     the first allowed role (so a brand-new customer signing in via
//     the storefront gets `userType="customer"` set the first time).
//     If the resolved type is not in the allowed list, the request is
//     rejected with 403 — there is no fail-open path.
export function requireUserType(allowed: readonly UserType[]): RequestHandler {
  const allowList = new Set<UserType>(allowed);
  const bootstrapAs = (allowed[0] ?? null) as UserType | null;
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      next();
      return;
    }
    const userType = await resolveClerkUserType(
      req,
      auth.userId,
      bootstrapAs,
    );
    if (!userType || !allowList.has(userType)) {
      res.status(403).json({
        ok: false,
        code: "wrong_user_type",
        message: "You do not have access to this resource.", // i18n-ignore
      });
      return;
    }
    next();
  };
}

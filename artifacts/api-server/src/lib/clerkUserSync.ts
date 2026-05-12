import { createClerkClient } from "@clerk/express";
import { logger as defaultLogger } from "./logger";
import { sendAlert } from "./alerts";

// Shared helper used by:
//   - the just-in-time Clerk user creation endpoint (web sign-in for an
//     existing WP shopper, before Clerk's email-code first-factor flow);
//   - the mobile registration mirror (`/auth/register`,
//     `/auth/social/google`, `/auth/social/apple`) — best-effort so that
//     anyone who registers via mobile shows up in Clerk within seconds;
//   - the in-process daily catch-up sync (lib/clerkCatchupSync.ts) that
//     picks up direct-to-WP signups so ops never has to re-run the
//     `import-customers-to-clerk` script manually.
//
// Idempotent: a duplicate-identifier response from Clerk is treated as a
// successful no-op so callers don't have to special-case it. Failures are
// logged via the supplied logger (req.log in route handlers, the singleton
// logger in workers) and never thrown — the contract is that callers can
// fire-and-forget this without blocking their main flow.

type Log = {
  warn?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
};

export type EnsureClerkUserInput = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Local `customers.id` — written to Clerk's `external_id` for correlation. */
  localCustomerId?: number | null;
  log?: Log;
};

export type EnsureClerkUserResult =
  | {
      ok: true;
      created: boolean;
      alreadyExisted: boolean;
      clerkUserId: string | null;
    }
  | {
      ok: false;
      reason: "not_configured" | "invalid_email" | "error";
      message: string;
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clerkSecret(): string | null {
  const v = process.env.CLERK_SECRET_KEY;
  if (!v || !/^sk_(test|live)_/.test(v)) return null;
  return v;
}

export function isClerkConfigured(): boolean {
  return clerkSecret() !== null;
}

/**
 * Find a Clerk user by email. Returns `null` when none exists or when
 * Clerk isn't configured. Callers MUST treat any error from this as
 * "couldn't determine" — never as "doesn't exist" — to avoid creating a
 * duplicate Clerk user under the same email if the lookup briefly fails.
 */
export async function findClerkUserByEmail(
  email: string,
  log: Log = defaultLogger,
): Promise<{ ok: true; userId: string | null } | { ok: false; message: string }> {
  const secret = clerkSecret();
  if (!secret) return { ok: true, userId: null };
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    return { ok: false, message: "invalid email" };
  }
  try {
    const clerk = createClerkClient({ secretKey: secret });
    const list = await clerk.users.getUserList({
      emailAddress: [normalized],
      limit: 1,
    });
    const first = list?.data?.[0];
    return { ok: true, userId: first?.id ?? null };
  } catch (err: any) {
    log?.warn?.(
      { err: err?.message, email: normalized },
      "clerkUserSync: lookup failed",
    );
    return { ok: false, message: err?.message ?? "Clerk lookup failed" };
  }
}

/**
 * Best-effort: create a Clerk user for the given email, OR return success
 * if a user with that email already exists in Clerk. Mirrors the field
 * mapping from `scripts/src/importCustomersToClerk.ts` exactly so that
 * just-in-time, on-register and catch-up paths produce identical Clerk
 * users:
 *   - emailAddress: [email]
 *   - firstName/lastName from the local profile
 *   - externalId: String(localCustomerId) (when available)
 *   - publicMetadata.userType = "customer"
 *   - skipPasswordRequirement: true (we don't have WP password hashes)
 */
export async function ensureClerkUserForCustomer(
  input: EnsureClerkUserInput,
): Promise<EnsureClerkUserResult> {
  const log = input.log ?? defaultLogger;
  const secret = clerkSecret();
  if (!secret) {
    return {
      ok: false,
      reason: "not_configured",
      message: "Clerk not configured",
    };
  }
  const email = input.email.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "invalid_email", message: "Invalid email" };
  }

  try {
    const clerk = createClerkClient({ secretKey: secret });
    // Look up first; Clerk returns existing user without raising. This
    // lets us report `alreadyExisted` cleanly even when the catch-path
    // race below doesn't fire.
    const existing = await clerk.users
      .getUserList({ emailAddress: [email], limit: 1 })
      .catch(() => null);
    if (existing?.data?.[0]?.id) {
      return {
        ok: true,
        created: false,
        alreadyExisted: true,
        clerkUserId: existing.data[0].id,
      };
    }

    const user = await clerk.users.createUser({
      emailAddress: [email],
      firstName: input.firstName ? input.firstName : undefined,
      lastName: input.lastName ? input.lastName : undefined,
      externalId:
        input.localCustomerId != null && Number.isFinite(input.localCustomerId)
          ? String(input.localCustomerId)
          : undefined,
      publicMetadata: { userType: "customer" },
      skipPasswordRequirement: true,
    });
    return {
      ok: true,
      created: true,
      alreadyExisted: false,
      clerkUserId: user.id,
    };
  } catch (err: any) {
    // The duplicate-identifier race: another request created the same
    // email between our list call and our create call. Treat as success.
    const errors: any[] = err?.errors ?? err?.clerkError?.errors ?? [];
    const codes = errors.map((e) => String(e?.code ?? ""));
    if (codes.some((c) => /form_identifier_exists/.test(c))) {
      return {
        ok: true,
        created: false,
        alreadyExisted: true,
        clerkUserId: null,
      };
    }
    const status = err?.status ?? err?.clerkError?.status;
    const longMsg =
      errors[0]?.longMessage ?? errors[0]?.message ?? err?.message ?? String(err);
    log?.warn?.(
      { err: longMsg, status, email },
      "clerkUserSync: ensure failed (non-fatal)",
    );
    return { ok: false, reason: "error", message: longMsg };
  }
}

/**
 * Fire-and-forget convenience used by the auth route handlers. Logs any
 * failure via the supplied logger and optionally posts a single alert to
 * Slack so ops can spot persistent breakage. NEVER throws.
 */
export function ensureClerkUserInBackground(input: EnsureClerkUserInput): void {
  const log = input.log ?? defaultLogger;
  void ensureClerkUserForCustomer(input)
    .then((res) => {
      if (!res.ok && res.reason === "error") {
        // Best-effort alert — `sendAlert` is itself best-effort and
        // silently noops when no Slack webhook is configured.
        void sendAlert({
          title: "Clerk customer mirror failed",
          body: `Failed to mirror customer ${input.email} into Clerk.`,
          severity: "warn",
          source: "clerkUserSync.ensureClerkUserInBackground",
          fields: [
            { title: "Email", value: input.email },
            { title: "Reason", value: res.message },
          ],
        }).catch(() => {});
      }
    })
    .catch((err: any) => {
      // Defensive: ensureClerkUserForCustomer already swallows errors,
      // but if the promise itself rejects we don't want an unhandled
      // rejection to kill the worker.
      log?.warn?.(
        { err: err?.message, email: input.email },
        "clerkUserSync: background ensure threw",
      );
    });
}

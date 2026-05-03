import { and, eq, isNull } from "drizzle-orm";
import { db, customersTable, type Customer } from "@workspace/db";
import { logger } from "./logger";

// ── Normalization helpers ───────────────────────────────────────────────────

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

// Best-effort E.164 normalization. We accept anything resembling a phone
// number; if the input already starts with `+` we keep it, otherwise we
// strip non-digits and prepend `+`. We do NOT guess country codes, since
// that's outside our reliability tolerance for a key used for lookup.
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length < 6) return null;
    return "+" + digits;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return "+" + digits;
}

// ── Upsert ──────────────────────────────────────────────────────────────────

export type UpsertCustomerInput = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  city?: string | null;
  source?: string | null;
  authProvider?: string | null;
  authUserId?: string | null;
  // When provided we prefer to load this row (used for authenticated flows
  // where the caller already knows the canonical customer).
  preferredCustomerId?: number | null;
};

export type UpsertCustomerResult = {
  customer: Customer;
  created: boolean;
};

// Merge new info from a checkout/profile event into a persisted customer
// row without clobbering non-empty fields. Only fills blanks and refreshes
// fields when the new value is meaningfully different.
function buildPatch(
  existing: Customer,
  input: UpsertCustomerInput,
): Partial<Customer> {
  const patch: Partial<Customer> = {};
  const setIfMissing = <K extends "firstName" | "lastName" | "country" | "city">(
    field: K,
    value: string | null | undefined,
  ) => {
    const next = typeof value === "string" ? value.trim() : value;
    if (!next) return;
    const current = (existing[field] as string | null) ?? "";
    if (!current || current.trim() === "") {
      patch[field] = next as Customer[K];
    }
  };
  setIfMissing("firstName", input.firstName ?? null);
  setIfMissing("lastName", input.lastName ?? null);
  setIfMissing("country", input.country ?? null);
  setIfMissing("city", input.city ?? null);

  const normalizedPhone = normalizePhoneE164(input.phone ?? null);
  if (normalizedPhone && !existing.phoneE164) {
    patch.phoneE164 = normalizedPhone;
  }

  // Auth linkage: never overwrite an existing different binding silently.
  if (input.authProvider && input.authUserId) {
    if (!existing.authProvider || !existing.authUserId) {
      patch.authProvider = input.authProvider;
      patch.authUserId = input.authUserId;
    }
  }

  return patch;
}

// Resolve (or create) the canonical customer row for the given identity
// signals. Prefers an explicit `preferredCustomerId` (authenticated flows),
// then email, then phone. Email is required for new customers.
export async function upsertCustomer(
  input: UpsertCustomerInput,
): Promise<UpsertCustomerResult> {
  const email = normalizeEmail(input.email ?? null);
  const phone = normalizePhoneE164(input.phone ?? null);

  // 1) Preferred id lookup (authenticated callers).
  if (input.preferredCustomerId) {
    const [row] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, input.preferredCustomerId))
      .limit(1);
    if (row) {
      const patch = buildPatch(row, input);
      if (Object.keys(patch).length === 0) {
        return { customer: row, created: false };
      }
      const [updated] = await db
        .update(customersTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(customersTable.id, row.id))
        .returning();
      return { customer: updated, created: false };
    }
  }

  // 2) Email lookup.
  let existing: Customer | null = null;
  if (email) {
    const [row] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, email))
      .limit(1);
    if (row) existing = row;
  }

  // 3) Phone lookup as fallback.
  if (!existing && phone) {
    const [row] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phoneE164, phone))
      .limit(1);
    if (row) existing = row;
  }

  if (existing) {
    const patch = buildPatch(existing, input);
    // If we found a row by phone but didn't have an email saved, fill it in.
    // (`email` is non-null in the schema, so an empty string counts as blank.)
    if (email && !existing.email) {
      patch.email = email;
    }
    if (Object.keys(patch).length === 0) {
      return { customer: existing, created: false };
    }
    const [updated] = await db
      .update(customersTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customersTable.id, existing.id))
      .returning();
    return { customer: updated, created: false };
  }

  if (!email) {
    throw new Error("upsertCustomer: email is required to create a new customer");
  }

  const insertValues = {
    email,
    phoneE164: phone,
    firstName: (input.firstName ?? "").trim(),
    lastName: (input.lastName ?? "").trim(),
    country: input.country?.trim() || null,
    city: input.city?.trim() || null,
    source: input.source?.trim() || "presentail.com",
    authProvider:
      input.authProvider && input.authUserId ? input.authProvider : null,
    authUserId:
      input.authProvider && input.authUserId ? input.authUserId : null,
  };

  // Insert. If a concurrent insert wins the race on the email unique index,
  // re-read and patch.
  try {
    const [created] = await db
      .insert(customersTable)
      .values(insertValues)
      .returning();
    return { customer: created, created: true };
  } catch (err: any) {
    if (err?.code === "23505") {
      const [row] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.email, email))
        .limit(1);
      if (row) {
        const patch = buildPatch(row, input);
        if (Object.keys(patch).length === 0) {
          return { customer: row, created: false };
        }
        const [updated] = await db
          .update(customersTable)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(customersTable.id, row.id))
          .returning();
        return { customer: updated, created: false };
      }
    }
    throw err;
  }
}

export async function getCustomerById(id: number): Promise<Customer | null> {
  const [row] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, id))
    .limit(1);
  return row ?? null;
}

export async function getCustomerByWcId(
  wcCustomerId: number,
): Promise<Customer | null> {
  const [row] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.wcCustomerId, wcCustomerId))
    .limit(1);
  return row ?? null;
}

// ── WooCommerce sync (isolated) ─────────────────────────────────────────────
// Keeping the WC sync layer in one module is what makes WooCommerce removable
// later. The order route does not call WC customer endpoints directly.

const WC_BASE = "https://presentail.com/lebanon/wp-json/wc/v3";

function wooAuth() {
  const key = process.env.WC_CONSUMER_KEY ?? "";
  const secret = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function wcFetch(path: string, options: RequestInit = {}) {
  return fetch(`${WC_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuth(),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

function randomPassword(): string {
  return (
    "wc-" +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    "-" +
    Date.now().toString(36)
  );
}

// Ensure a WooCommerce customer mirror exists for the given local row, then
// persist the resolved `wcCustomerId` back. Returns the mirror's WC id, or
// null when WooCommerce is not configured (dev mode).
export async function syncCustomerToWoo(
  customerId: number,
): Promise<number | null> {
  if (!process.env.WC_CONSUMER_KEY) return null;

  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error(`syncCustomerToWoo: customer ${customerId} not found`);
  }
  if (customer.wcCustomerId) {
    // Best-effort patch of any blanks on the WC side. Failures here are not
    // fatal — the order can still be linked to the existing mirror.
    try {
      await patchWcCustomerBlanks(customer.wcCustomerId, customer);
    } catch (err: any) {
      logger.warn(
        { err: err?.message, customerId, wcCustomerId: customer.wcCustomerId },
        "syncCustomerToWoo: WC patch failed (non-fatal)",
      );
    }
    return customer.wcCustomerId;
  }

  // Look up by email first.
  let wcId: number | null = null;
  try {
    const lookup = await wcFetch(
      `/customers?email=${encodeURIComponent(customer.email)}&per_page=1`,
    );
    if (lookup.ok) {
      const list = (await lookup.json().catch(() => [])) as any[];
      if (Array.isArray(list) && list[0]?.id) {
        wcId = Number(list[0].id);
      }
    }
  } catch (err: any) {
    logger.warn(
      { err: err?.message, customerId },
      "syncCustomerToWoo: WC email lookup failed",
    );
  }

  if (!wcId) {
    // Create. Username must be unique; derive from local part + random suffix.
    const localPart =
      customer.email.split("@")[0]?.replace(/[^a-zA-Z0-9_.-]/g, "") || "user";
    const username = `${localPart}-${Math.random().toString(36).slice(2, 8)}`;
    const createRes = await wcFetch("/customers", {
      method: "POST",
      body: JSON.stringify({
        email: customer.email,
        password: randomPassword(),
        username,
        first_name: customer.firstName,
        last_name: customer.lastName,
        billing: {
          first_name: customer.firstName,
          last_name: customer.lastName,
          email: customer.email,
          phone: customer.phoneE164 ?? "",
          country: customer.country ?? "",
          city: customer.city ?? "",
        },
      }),
    });
    const data = (await createRes.json().catch(() => ({}))) as any;
    if (!createRes.ok) {
      // If WC reports the email already exists (race), try lookup once more.
      if (createRes.status === 400 && /exists/i.test(String(data?.code ?? ""))) {
        const retry = await wcFetch(
          `/customers?email=${encodeURIComponent(customer.email)}&per_page=1`,
        );
        if (retry.ok) {
          const list = (await retry.json().catch(() => [])) as any[];
          if (Array.isArray(list) && list[0]?.id) wcId = Number(list[0].id);
        }
      }
      if (!wcId) {
        const msg =
          data?.message?.replace?.(/<[^>]*>/g, "") ?? "Failed to create WC customer mirror";
        throw new Error(`syncCustomerToWoo: ${msg} (status ${createRes.status})`);
      }
    } else {
      wcId = Number(data?.id);
    }
  }

  if (!wcId || !Number.isFinite(wcId) || wcId <= 0) {
    throw new Error("syncCustomerToWoo: WooCommerce did not return a customer id");
  }

  // Persist the link. Guard against races where another row already owns it.
  try {
    await db
      .update(customersTable)
      .set({ wcCustomerId: wcId, updatedAt: new Date() })
      .where(
        and(
          eq(customersTable.id, customer.id),
          isNull(customersTable.wcCustomerId),
        ),
      );
  } catch (err: any) {
    logger.warn(
      { err: err?.message, customerId, wcId },
      "syncCustomerToWoo: failed to persist wcCustomerId (likely race)",
    );
  }

  return wcId;
}

async function patchWcCustomerBlanks(
  wcCustomerId: number,
  customer: Customer,
): Promise<void> {
  // Read current WC fields and only fill blanks.
  const r = await wcFetch(`/customers/${wcCustomerId}`);
  if (!r.ok) return;
  const data = (await r.json().catch(() => ({}))) as any;
  const patch: Record<string, unknown> = {};
  if (!data.first_name && customer.firstName) patch.first_name = customer.firstName;
  if (!data.last_name && customer.lastName) patch.last_name = customer.lastName;
  const billingPatch: Record<string, unknown> = {};
  if (!data.billing?.phone && customer.phoneE164) billingPatch.phone = customer.phoneE164;
  if (!data.billing?.country && customer.country) billingPatch.country = customer.country;
  if (!data.billing?.city && customer.city) billingPatch.city = customer.city;
  if (Object.keys(billingPatch).length > 0) patch.billing = billingPatch;
  if (Object.keys(patch).length === 0) return;
  await wcFetch(`/customers/${wcCustomerId}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}


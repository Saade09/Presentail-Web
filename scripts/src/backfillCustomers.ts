import {
  db,
  pool,
  customersTable,
  appOrdersTable,
  type Customer,
} from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

const WC_BASE =
  process.env.WC_BASE_URL ?? "https://presentail.com/lebanon/wp-json/wc/v3";
// Note: this script operates on a single store at a time. To backfill
// customers from other stores, set WC_BASE_URL plus the matching
// WC_CONSUMER_KEY / WC_CONSUMER_SECRET before running.
const WC_KEY = process.env.WC_CONSUMER_KEY ?? "";
const WC_SECRET = process.env.WC_CONSUMER_SECRET ?? "";

if (!WC_KEY || !WC_SECRET) {
  throw new Error(
    "WC_CONSUMER_KEY and WC_CONSUMER_SECRET must be set to run the backfill",
  );
}

const wcAuth =
  "Basic " + Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString("base64");

async function wc(path: string): Promise<Response> {
  const r = await fetch(`${WC_BASE}${path}`, {
    headers: {
      Authorization: wcAuth,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailBackfill/1.0",
    },
  });
  return r;
}

async function wcJson<T>(path: string): Promise<T> {
  const r = await wc(path);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`WC ${path} failed: ${r.status} ${body.slice(0, 200)}`);
  }
  return (await r.json()) as T;
}

// WooCommerce returns HTTP 400 with code `rest_invalid_page_number` when
// requesting a page past the last one (rather than an empty array). Treat
// that as a clean end-of-list so pagination terminates without throwing.
async function fetchCustomersPage(
  page: number,
  perPage: number,
): Promise<{ batch: WcCustomer[]; totalPages: number | null; endOfList: boolean }> {
  const r = await wc(
    `/customers?per_page=${perPage}&page=${page}&orderby=id&order=asc&role=all`,
  );
  const totalPagesHeader = r.headers.get("x-wp-totalpages");
  const totalPages = totalPagesHeader ? Number(totalPagesHeader) : null;
  if (r.status === 400) {
    const body = await r.text().catch(() => "");
    if (/rest_invalid_page_number|rest_post_invalid_page_number/i.test(body)) {
      return { batch: [], totalPages, endOfList: true };
    }
    throw new Error(`WC /customers page=${page} failed: 400 ${body.slice(0, 200)}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(
      `WC /customers page=${page} failed: ${r.status} ${body.slice(0, 200)}`,
    );
  }
  const batch = (await r.json()) as WcCustomer[];
  return { batch: Array.isArray(batch) ? batch : [], totalPages, endOfList: false };
}

// ── Normalization (kept in-script to avoid leaf↔leaf imports) ───────────────

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function normalizePhoneE164(raw: string | null | undefined): string | null {
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

// ── WooCommerce types (subset) ──────────────────────────────────────────────

type WcCustomer = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    country?: string;
    city?: string;
  };
  shipping?: {
    country?: string;
    city?: string;
  };
};

type WcOrder = {
  id: number;
  customer_id?: number;
  billing?: { email?: string; phone?: string };
};

// ── Phase 1: backfill customers from WooCommerce ────────────────────────────

type UpsertOutcome = "created" | "updated" | "noop" | "skipped";

async function upsertFromWc(c: WcCustomer): Promise<UpsertOutcome> {
  const email = normalizeEmail(c.email);
  if (!email) return "skipped";
  const phone = normalizePhoneE164(c.billing?.phone);
  const firstName = (c.first_name || c.billing?.first_name || "").trim();
  const lastName = (c.last_name || c.billing?.last_name || "").trim();
  const country =
    (c.billing?.country || c.shipping?.country || "").trim() || null;
  const city = (c.billing?.city || c.shipping?.city || "").trim() || null;

  // Prefer wcCustomerId match (unique index); then fall back to email.
  let existing: Customer | undefined;
  const byWc = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.wcCustomerId, c.id))
    .limit(1);
  existing = byWc[0];
  if (!existing) {
    const byEmail = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, email))
      .limit(1);
    existing = byEmail[0];
  }

  if (existing) {
    const patch: Partial<Customer> = {};
    if (!existing.wcCustomerId) patch.wcCustomerId = c.id;
    if (!existing.firstName && firstName) patch.firstName = firstName;
    if (!existing.lastName && lastName) patch.lastName = lastName;
    if (!existing.phoneE164 && phone) patch.phoneE164 = phone;
    if (!existing.country && country) patch.country = country;
    if (!existing.city && city) patch.city = city;
    if (Object.keys(patch).length === 0) return "noop";
    await db
      .update(customersTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customersTable.id, existing.id));
    return "updated";
  }

  try {
    await db.insert(customersTable).values({
      email,
      phoneE164: phone,
      firstName,
      lastName,
      country,
      city,
      wcCustomerId: c.id,
      source: "presentail.com",
    });
    return "created";
  } catch (err: any) {
    // Race with another concurrent insert (or pre-existing row that didn't
    // come back from our lookup for some reason). Retry as a patch.
    if (err?.code === "23505") {
      const [row] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.email, email))
        .limit(1);
      if (row) {
        const patch: Partial<Customer> = {};
        if (!row.wcCustomerId) patch.wcCustomerId = c.id;
        if (!row.firstName && firstName) patch.firstName = firstName;
        if (!row.lastName && lastName) patch.lastName = lastName;
        if (!row.phoneE164 && phone) patch.phoneE164 = phone;
        if (!row.country && country) patch.country = country;
        if (!row.city && city) patch.city = city;
        if (Object.keys(patch).length === 0) return "noop";
        await db
          .update(customersTable)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(customersTable.id, row.id));
        return "updated";
      }
    }
    throw err;
  }
}

async function backfillCustomers(): Promise<void> {
  console.log(`[customers] starting backfill from ${WC_BASE}`);
  const perPage = 100;
  let page = 1;
  let seen = 0;
  let created = 0;
  let updated = 0;
  let noop = 0;
  let skipped = 0;
  let failed = 0;

  let totalPages: number | null = null;
  for (;;) {
    const { batch, totalPages: tp, endOfList } = await fetchCustomersPage(
      page,
      perPage,
    );
    if (tp != null && Number.isFinite(tp)) totalPages = tp;
    if (endOfList) break;
    if (batch.length === 0) break;

    for (const c of batch) {
      seen++;
      try {
        const r = await upsertFromWc(c);
        if (r === "created") created++;
        else if (r === "updated") updated++;
        else if (r === "noop") noop++;
        else skipped++;
      } catch (err: any) {
        failed++;
        console.error(
          `[customers] wc#${c.id} (${c.email}) failed: ${err?.message ?? err}`,
        );
      }
    }

    console.log(
      `[customers] page ${page}${totalPages ? `/${totalPages}` : ""}: +${batch.length} (seen=${seen} created=${created} updated=${updated} noop=${noop} skipped=${skipped} failed=${failed})`,
    );

    if (totalPages != null && page >= totalPages) break;
    if (batch.length < perPage) break;
    page++;
  }

  console.log(
    `[customers] done. seen=${seen} created=${created} updated=${updated} noop=${noop} skipped=${skipped} failed=${failed}`,
  );
}

// ── Phase 2: link existing app_orders rows to customers ─────────────────────

async function resolveCustomerIdFor(order: WcOrder): Promise<number | null> {
  if (order.customer_id && order.customer_id > 0) {
    const [hit] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.wcCustomerId, order.customer_id))
      .limit(1);
    if (hit) return hit.id;
  }
  const email = normalizeEmail(order.billing?.email);
  if (email) {
    const [hit] = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.email, email))
      .limit(1);
    if (hit) return hit.id;
  }
  const phone = normalizePhoneE164(order.billing?.phone);
  if (phone) {
    // Phone is non-unique; only link when there's exactly one match to
    // avoid attaching an order to the wrong household / shared number.
    const hits = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.phoneE164, phone))
      .limit(2);
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

async function linkAppOrders(): Promise<void> {
  console.log(`[orders] linking unlinked app_orders to customers…`);
  const rows = await db
    .select()
    .from(appOrdersTable)
    .where(
      and(
        isNull(appOrdersTable.customerId),
        isNotNull(appOrdersTable.wcOrderId),
      ),
    );
  console.log(`[orders] found ${rows.length} unlinked rows`);

  let linked = 0;
  let unresolved = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const r = await wc(`/orders/${row.wcOrderId}`);
      if (r.status === 404) {
        unresolved++;
        continue;
      }
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new Error(`WC /orders/${row.wcOrderId}: ${r.status} ${body.slice(0, 120)}`);
      }
      const order = (await r.json()) as WcOrder;
      const customerId = await resolveCustomerIdFor(order);
      if (customerId) {
        await db
          .update(appOrdersTable)
          .set({ customerId, updatedAt: new Date() })
          .where(eq(appOrdersTable.id, row.id));
        linked++;
      } else {
        unresolved++;
      }
    } catch (err: any) {
      failed++;
      console.error(
        `[orders] app_order ${row.appOrderId} (wc#${row.wcOrderId}) failed: ${err?.message ?? err}`,
      );
    }
  }

  console.log(
    `[orders] done. linked=${linked} unresolved=${unresolved} failed=${failed}`,
  );
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const onlyOrders = process.argv.includes("--only-orders");
  const onlyCustomers = process.argv.includes("--only-customers");
  let phase1Failed = false;
  if (!onlyOrders) {
    try {
      await backfillCustomers();
    } catch (err: any) {
      phase1Failed = true;
      console.error(
        `[customers] phase failed (continuing to order linking): ${err?.message ?? err}`,
      );
    }
  }
  if (!onlyCustomers) await linkAppOrders();
  if (phase1Failed) {
    throw new Error("Customer backfill phase reported errors; see logs above.");
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("backfill failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });

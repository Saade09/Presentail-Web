import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, appOrdersTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { getCustomerById, getCustomerByWcId } from "../lib/customers";
import { fetchOsOrderStatus } from "@workspace/presentail-os";

const router: IRouter = Router();

import { resolveStoreFromRequest, wooAuthHeader } from "../lib/wooStore";

async function wcFetch(path: string, options: RequestInit = {}, req?: { query: any; headers: any }) {
  const store = req ? resolveStoreFromRequest(req) : resolveStoreFromRequest({ query: {}, headers: {} });
  return fetch(`${store.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: wooAuthHeader(store),
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "PresentailApp/1.0",
      ...(options.headers ?? {}),
    },
  });
}

type WcLineItem = {
  name?: string;
  quantity?: number;
  total?: string;
  image?: { src?: string } | null;
};

type WcOrder = {
  id?: number;
  status?: string;
  total?: string;
  currency?: string;
  date_created_gmt?: string;
  line_items?: WcLineItem[];
};

type StoredLineItem = {
  name: string;
  quantity: number;
  priceUsdCents: number;
};

async function resolveCustomerId(
  req: Parameters<typeof authenticate>[1],
  authHeader: string | undefined,
): Promise<
  | { ok: true; customerId: number }
  | { ok: false; status: number; message: string }
> {
  const auth = await authenticate(authHeader, req);
  if (!auth.ok) return auth;
  // Priority order:
  // (a) localCustomerId claim — native JWT / web auth; look up directly.
  if (auth.localCustomerId) {
    const local = await getCustomerById(auth.localCustomerId);
    if (local) return { ok: true, customerId: local.id };
  }
  // (b) WC customer ID — mobile WordPress JWT; look up by wcCustomerId.
  const byWc = await getCustomerByWcId(auth.customerId);
  if (byWc) return { ok: true, customerId: byWc.id };
  // (c) Final fallback — local-only JWT where customerId IS the local row id.
  const byId = await getCustomerById(auth.customerId);
  if (byId) return { ok: true, customerId: byId.id };
  return { ok: false, status: 404, message: "Customer profile not found" }; // i18n-ignore
}

// GET /api/me/orders
//
// Returns every order linked to the authenticated customer's canonical
// `customers` row. Because the checkout flow (see /woo/order) resolves both
// guest and authenticated purchases through `upsertCustomer` — matching by
// email and phone — orders placed before the customer signed up are stitched
// onto the same canonical row and surface here automatically.
router.get("/me/orders", requireUserType(["customer", "team"]), async (req, res) => {
  const resolved = await resolveCustomerId(req, req.header("authorization"));
  if (!resolved.ok) {
    if (resolved.status === 401 || resolved.status === 403) {
      res.status(resolved.status).json({ ok: false, message: resolved.message });
      return;
    }
    // Customer profile not found — return an empty list rather than an error.
    res.json({ ok: true, orders: [] });
    return;
  }

  const rows = await db
    .select()
    .from(appOrdersTable)
    .where(eq(appOrdersTable.customerId, resolved.customerId))
    .orderBy(desc(appOrdersTable.createdAt));

  const osConfig = {
    apiKey: process.env.PRESENTAIL_OS_API_KEY ?? "",
    baseUrl: process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com",
    workspace: process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail",
  };

  // Best-effort enrichment from WooCommerce so the list can show status,
  // total and item summaries. WC failures are swallowed per-row — the local
  // app_orders data is still returned.
  const wcMap = new Map<number, WcOrder>();
  const store = resolveStoreFromRequest(req);

  // Live OS status map: osOrderId → live status string (fetched in parallel
  // with a 3-second timeout per order; null when unavailable).
  const osStatusMap = new Map<string, string>();

  const osOrderIds = Array.from(
    new Set(
      rows
        .map((r) => r.osOrderId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  await Promise.all([
    // WooCommerce enrichment (existing path)
    (async () => {
      if (!store.consumerKey) return;
      const wcIds = Array.from(
        new Set(
          rows
            .map((r) => r.wcOrderId)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      );
      await Promise.all(
        wcIds.map(async (id) => {
          try {
            const r = await wcFetch(`/orders/${id}`, {}, req);
            if (!r.ok) return;
            const data = (await r.json().catch(() => null)) as WcOrder | null;
            if (data) wcMap.set(id, data);
          } catch (err: any) {
            req.log?.warn?.(
              { err: err?.message, wcOrderId: id },
              "me.orders: WC fetch failed (non-fatal)",
            );
          }
        }),
      );
    })(),
    // Live OS status enrichment (new path)
    (async () => {
      if (!osConfig.apiKey || osOrderIds.length === 0) return;
      await Promise.all(
        osOrderIds.map(async (osOrderId) => {
          const result = await fetchOsOrderStatus(osConfig, osOrderId);
          if (result) osStatusMap.set(osOrderId, result.status);
          else {
            req.log?.warn?.(
              { osOrderId },
              "me.orders: OS status fetch failed (non-fatal, using stored state)",
            );
          }
        }),
      );
    })(),
  ]);

  const orders = rows.map((r) => {
    const wc = r.wcOrderId ? wcMap.get(r.wcOrderId) ?? null : null;

    // WooCommerce-linked order: enrich from WC response.
    if (wc) {
      const items = (wc.line_items ?? []).map((li) => ({
        name: String(li.name ?? ""),
        quantity: Number(li.quantity ?? 0),
        image: li.image?.src ?? null,
      }));
      return {
        appOrderId: r.appOrderId,
        wcOrderId: r.wcOrderId,
        osOrderId: r.osOrderId ?? null,
        state: r.state,
        recipientName: r.recipientName,
        deliveryDate: r.deliveryDate,
        deliverySlot: r.deliverySlot,
        createdAt: r.createdAt.toISOString(),
        status: wc.status ?? null,
        liveStatus: false,
        total: wc.total ?? null,
        currency: wc.currency ?? null,
        itemsCount: items.reduce((sum, it) => sum + (it.quantity || 0), 0) || items.length,
        items,
      };
    }

    // OS-native order (no wcOrderId or WC fetch failed): use live status when
    // available, falling back to the stored state column.
    const liveOsStatus = r.osOrderId ? (osStatusMap.get(r.osOrderId) ?? null) : null;
    const hasLiveStatus = liveOsStatus !== null;

    let items: { name: string; quantity: number; image: null }[] = [];
    if (r.lineItemsJson) {
      try {
        const parsed = JSON.parse(r.lineItemsJson) as StoredLineItem[];
        if (Array.isArray(parsed)) {
          items = parsed.map((li) => ({
            name: String(li.name ?? ""),
            quantity: Number(li.quantity ?? 0),
            image: null,
          }));
        }
      } catch {
        // Malformed JSON — fall through with empty items.
      }
    }

    const total =
      typeof r.totalUsdCents === "number" && r.totalUsdCents !== null
        ? (r.totalUsdCents / 100).toFixed(2)
        : null;

    return {
      appOrderId: r.appOrderId,
      wcOrderId: r.wcOrderId,
      osOrderId: r.osOrderId ?? null,
      state: r.state,
      recipientName: r.recipientName,
      deliveryDate: r.deliveryDate,
      deliverySlot: r.deliverySlot,
      createdAt: r.createdAt.toISOString(),
      status: liveOsStatus ?? r.state ?? null,
      liveStatus: hasLiveStatus,
      total,
      currency: total !== null ? "USD" : null,
      itemsCount: items.reduce((sum, it) => sum + (it.quantity || 0), 0) || items.length,
      items,
    };
  });

  res.json({ ok: true, orders });
});

export default router;

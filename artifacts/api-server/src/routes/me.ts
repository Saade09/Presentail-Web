import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, appOrdersTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { getCustomerByWcId } from "../lib/customers";

const router: IRouter = Router();

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

// GET /api/me/orders
//
// Returns every order linked to the authenticated customer's canonical
// `customers` row. Because the checkout flow (see /woo/order) resolves both
// guest and authenticated purchases through `upsertCustomer` — matching by
// email and phone — orders placed before the customer signed up are stitched
// onto the same canonical row and surface here automatically.
router.get("/me/orders", async (req, res) => {
  const auth = await authenticate(req.header("authorization"));
  if (!auth.ok) {
    res.status(auth.status).json({ ok: false, message: auth.message });
    return;
  }

  const local = await getCustomerByWcId(auth.customerId);
  if (!local) {
    res.json({ ok: true, orders: [] });
    return;
  }

  const rows = await db
    .select()
    .from(appOrdersTable)
    .where(eq(appOrdersTable.customerId, local.id))
    .orderBy(desc(appOrdersTable.createdAt));

  // Best-effort enrichment from WooCommerce so the list can show status,
  // total and item summaries. WC failures are swallowed per-row — the local
  // app_orders data is still returned.
  const wcMap = new Map<number, WcOrder>();
  if (process.env.WC_CONSUMER_KEY) {
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
          const r = await wcFetch(`/orders/${id}`);
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
  }

  const orders = rows.map((r) => {
    const wc = r.wcOrderId ? wcMap.get(r.wcOrderId) ?? null : null;
    const items = (wc?.line_items ?? []).map((li) => ({
      name: String(li.name ?? ""),
      quantity: Number(li.quantity ?? 0),
      image: li.image?.src ?? null,
    }));
    return {
      appOrderId: r.appOrderId,
      wcOrderId: r.wcOrderId,
      state: r.state,
      recipientName: r.recipientName,
      deliveryDate: r.deliveryDate,
      deliverySlot: r.deliverySlot,
      createdAt: r.createdAt.toISOString(),
      status: wc?.status ?? null,
      total: wc?.total ?? null,
      currency: wc?.currency ?? null,
      itemsCount: items.reduce((sum, it) => sum + (it.quantity || 0), 0) || items.length,
      items,
    };
  });

  res.json({ ok: true, orders });
});

export default router;

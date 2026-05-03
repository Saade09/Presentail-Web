import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, appOrdersTable } from "@workspace/db";
import { authenticate } from "../lib/auth";
import { sendOrderEventPush } from "../lib/orderEvents";
import {
  convertFromUsd,
  normalizeCurrency,
  roundForCurrency,
  type SupportedCurrency,
} from "../lib/fx";

const router: IRouter = Router();

// Minimal subset of the WooCommerce order response that we consume.
// Typed narrowly so we don't have to fall back to `any` in the handler.
type WcOrderResponse = {
  id?: number;
  order_key?: string;
  message?: string;
};

const WC_BASE = "https://presentail.com/lebanon/wp-json/wc/v3";

function wooAuth() {
  const key = process.env.WC_CONSUMER_KEY ?? "";
  const secret = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

async function wooFetch(path: string, options: RequestInit = {}) {
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

const CATEGORY_MAP: Record<string, string> = {
  "hand-bouquets": "hand-bouquets",
  "flower-boxes": "flower-boxes",
  "flower-vases": "flower-vases",
  bundles: "bundles",
  "lux-arrangements": "lux-arrangements",
  "dried-flowers": "dried-flowers",
  "preserved-flowers": "preserved-flowers",
  plants: "plants",
  balloons: "balloons",
  "board-games": "board-games",
  cakes: "cakes",
  chocolate: "chocolate",
  "arabic-sweets": "arabic-sweets",
  electronics: "electronics",
  "stuffed-animals": "stuffed-animals",
};

function mapCategory(cats: { id: number; name: string; slug: string }[]): string {
  for (const cat of cats) {
    const mapped = CATEGORY_MAP[cat.slug];
    if (mapped) return mapped;
  }
  return "bundles";
}

type DeliveryFilter = {
  countryCode: string | null;
  cityId: string | null;
};

function readDeliveryFilter(req: { query: any }): DeliveryFilter {
  const country = typeof req.query.countryCode === "string" ? req.query.countryCode.trim() : "";
  const city = typeof req.query.cityId === "string" ? req.query.cityId.trim() : "";
  return {
    countryCode: country ? country.toUpperCase() : null,
    cityId: city || null,
  };
}

// Read a per-product deliverability list from WooCommerce meta_data.
// Presentail OS publishes per-location availability as product meta keys:
//   _deliverable_countries / deliverable_countries  → comma-separated ISO codes
//   _deliverable_cities    / deliverable_cities     → comma-separated city ids
// A missing/empty value means the product is deliverable everywhere (the
// safe default while OS metadata is still being backfilled).
function readMetaList(meta: any[] | undefined, ...keys: string[]): string[] | null {
  if (!Array.isArray(meta)) return null;
  for (const key of keys) {
    const entry = meta.find((m) => m && m.key === key);
    if (!entry) continue;
    const raw = entry.value;
    if (raw == null || raw === "") return null;
    if (Array.isArray(raw)) {
      const list = raw.map((v) => String(v).trim()).filter(Boolean);
      return list.length ? list : null;
    }
    const list = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : null;
  }
  return null;
}

function isDeliverable(p: any, filter: DeliveryFilter): boolean {
  const countries = readMetaList(p?.meta_data, "_deliverable_countries", "deliverable_countries");
  if (countries && filter.countryCode) {
    const wanted = filter.countryCode.toUpperCase();
    if (!countries.some((c) => c.toUpperCase() === wanted)) return false;
  }
  const cities = readMetaList(p?.meta_data, "_deliverable_cities", "deliverable_cities");
  if (cities && filter.cityId) {
    if (!cities.some((c) => c === filter.cityId)) return false;
  }
  return true;
}

function transformProduct(p: any) {
  const price = parseFloat(p.price) || 0;
  const image =
    p.images?.[0]?.src ?? null;
  return {
    id: p.slug,
    wcId: p.id,
    name: p.name?.replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&#8217;/g, "'") ?? "",
    price: `$${price.toLocaleString()}`,
    priceValue: price,
    image: image ? { uri: image } : null,
    category: mapCategory(p.categories ?? []),
    inStock: p.stock_status === "instock",
    description: p.short_description
      ? p.short_description.replace(/<[^>]*>/g, "").trim()
      : undefined,
    tag: p.featured ? "Featured" : undefined,
    occasions: [],
  };
}

router.get("/woo/brands", async (_req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const r = await wooFetch("/products/brands?per_page=100");
    if (!r.ok) {
      const err = (await r.json()) as { message?: string };
      return res.status(r.status).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
    }
    const brands = (await r.json()) as any[];
    return res.json({
      ok: true,
      brands: brands.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        count: b.count,
        image: b.image?.src ?? null,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
  }
});

router.get("/woo/brand-products", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const brandSlug = String(req.query.slug ?? "");
  if (!brandSlug) return res.status(400).json({ ok: false, message: "Missing slug" });

  try {
    // Look up brand ID by slug from the brands taxonomy
    const brandRes = await wooFetch(`/products/brands?slug=${encodeURIComponent(brandSlug)}&per_page=5`);
    if (!brandRes.ok) {
      return res.status(brandRes.status).json({ ok: false, message: "Failed to lookup brand" });
    }
    const brandList = (await brandRes.json()) as any[];
    if (!brandList.length) {
      return res.json({ ok: true, products: [], count: 0 });
    }
    const brandId = brandList[0].id;

    // Fetch products filtered by brand ID
    const r = await wooFetch(
      `/products?brand=${brandId}&per_page=50&status=publish&stock_status=instock`
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to fetch brand products" });
    }
    const batch = (await r.json()) as any[];
    const filter = readDeliveryFilter(req);
    const products = batch.filter((p) => isDeliverable(p, filter)).map(transformProduct);
    return res.json({ ok: true, products, count: products.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch brand products" });
  }
});

const OCCASION_WC_CATEGORY: Record<string, number> = {
  birthday: 135,
  housewarming: 582,
  "new-job": 580,
  promotion: 581,
  "thank-you": 176,
  "love-romance": 137,
  farewell: 583,
  condolences: 405,
  anniversary: 416,
  wedding: 139,
  graduation: 196,
  newborn: 197,
  "get-well-soon": 177,
  congratulations: 138,
  colleague: 246,
  friend: 245,
  "thinking-of-you": 153,
  "im-sorry": 486,
  eid: 141,
  children: 247,
};

const OCCASION_TYPE_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "flowers", label: "Flowers & Bouquets" },
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "flower-vases", label: "Flower Vases" },
  { slug: "lux-arrangements", label: "Lux Arrangements" },
  { slug: "dried-flowers", label: "Dried Flowers" },
  { slug: "preserved-flowers", label: "Preserved Flowers" },
  { slug: "chocolate", label: "Chocolates" },
  { slug: "cakes", label: "Cakes & Sweets" },
  { slug: "arabic-sweets", label: "Arabic Sweets" },
  { slug: "balloons", label: "Balloons" },
  { slug: "electronics", label: "Electronics & Tech" },
  { slug: "stuffed-animals", label: "Stuffed Animals" },
  { slug: "board-games", label: "Board Games" },
  { slug: "plants", label: "Plants" },
  { slug: "baskets", label: "Baskets" },
  { slug: "beauty", label: "Beauty" },
  { slug: "bundles", label: "Gift Bundles" },
];

router.get("/woo/category-products", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const slug = String(req.query.slug ?? "");
  if (!slug) return res.status(400).json({ ok: false, message: "Missing slug" });
  try {
    // Resolve category slug to ID
    const catRes = await wooFetch(`/products/categories?slug=${encodeURIComponent(slug)}&per_page=5`);
    if (!catRes.ok) return res.status(catRes.status).json({ ok: false, message: "Failed to lookup category" });
    const catList = (await catRes.json()) as any[];
    if (!catList.length) return res.json({ ok: true, products: [], count: 0 });
    const catId = catList[0].id;
    const catName: string = catList[0].name ?? slug;

    const allProducts: any[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(`/products?category=${catId}&per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as any[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    const filter = readDeliveryFilter(req);
    const filtered = allProducts.filter((p) => isDeliverable(p, filter));
    return res.json({ ok: true, products: filtered.map(transformProduct), count: filtered.length, categoryName: catName });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch category products" });
  }
});

router.get("/woo/occasion-products", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const slug = String(req.query.slug ?? "");
  const categoryId = OCCASION_WC_CATEGORY[slug];
  if (!categoryId) {
    return res.json({ ok: true, groups: [] });
  }

  try {
    const allProducts: any[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(`/products?category=${categoryId}&per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as any[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const filter = readDeliveryFilter(req);
    const deliverable = allProducts.filter((p) => isDeliverable(p, filter));

    // Group products by type category (priority-ordered)
    const groups = new Map<string, { label: string; products: any[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of deliverable) {
        if (assigned.has(p.id)) continue;
        const slugs = (p.categories ?? []).map((c: any) => c.slug as string);
        if (slugs.includes(typecat.slug)) {
          if (!groups.has(typecat.slug)) {
            groups.set(typecat.slug, { label: typecat.label, products: [] });
          }
          groups.get(typecat.slug)!.products.push(transformProduct(p));
          assigned.add(p.id);
        }
      }
    }

    const result = Array.from(groups.entries()).map(([slug, g]) => ({
      slug,
      label: g.label,
      count: g.products.length,
      products: g.products.slice(0, 10),
    }));

    return res.json({ ok: true, groups: result, total: allProducts.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch occasion products" });
  }
});

router.get("/woo/products", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const allProducts: any[] = [];
    let page = 1;
    while (true) {
      const r = await wooFetch(`/products?per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as any[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    const filter = readDeliveryFilter(req);
    const products = allProducts.filter((p) => isDeliverable(p, filter)).map(transformProduct);
    return res.json({ ok: true, products, count: products.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch products" });
  }
});

// ISO-3166 alpha-2 (e.g. "LB", "AE"). We accept any 2-letter uppercase
// code and let WooCommerce reject unknown ones — keeping the list here
// in sync with the country dialer would be brittle.
const Iso2 = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/)
  .transform((s) => s.toUpperCase());

const WooOrderSchema = z.object({
  orderId: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        price: z.number().nonnegative(),
        wcId: z.number().int().positive().optional(),
      }),
    )
    .min(1),
  billing: z.object({
    firstName: z.string().min(1),
    lastName: z.string().default(""),
    email: z.string().email(),
    phone: z.string().min(1),
  }),
  recipient: z.object({
    firstName: z.string().min(1),
    lastName: z.string().default(""),
    phone: z.string().min(1),
  }),
  district: z.string().min(1),
  districtFee: z.number().nonnegative(),
  expressFee: z.number().nonnegative(),
  // Optional, defaults to LB to preserve backward compatibility with
  // older app versions that don't send these fields yet.
  billingCountry: Iso2.optional(),
  shippingCountry: Iso2.optional(),
  paymentRef: z.string().optional(),
  deliveryDetails: z.string().default(""),
  deliveryDate: z.string().default(""),
  deliverySlot: z.string().default(""),
  cardMessage: z.string().optional(),
  cardFrom: z.string().optional(),
  cardTo: z.string().optional(),
  qrLink: z.string().optional(),
  qrLabel: z.string().optional(),
  orderNotes: z.string().optional(),
  paymentMethod: z.enum(["card", "wallet", "whish", "western", "mamo", "paypal"]),
  identitySecret: z.boolean().optional(),
  // App-side identifier used to route push notifications back to the
  // buyer's device. Only honoured when the request is authenticated —
  // see the route handler for the rationale.
  appDeviceId: z.string().optional(),
  // ISO 4217 of the currency the shopper saw in-app. The server converts
  // every monetary field below from USD into this currency so the
  // WooCommerce order total matches what the customer was charged.
  currencyCode: z.string().optional(),
});

type WooOrderPayload = z.infer<typeof WooOrderSchema>;

router.post("/woo/order", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const parsed = WooOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    req.log?.warn?.(
      { issues: parsed.error.issues },
      "woo.order: invalid payload",
    );
    return res
      .status(400)
      .json({ ok: false, message: "Invalid order payload", issues: parsed.error.issues });
  }
  const body: WooOrderPayload = parsed.data;

  const paymentTitles: Record<string, string> = {
    card: "Credit / Debit Card (Stripe)",
    wallet: "Apple Pay / Google Pay (Stripe)",
    whish: "Whish Money",
    western: "Western Union",
    mamo: "Mamo (UAE Wallets)",
    paypal: "PayPal",
  };

  const recipientFullName = `${body.recipient.firstName} ${body.recipient.lastName}`.trim();
  const cardToValue = (body.cardTo && body.cardTo.trim()) || recipientFullName;

  // Format delivery date as "Friday, April 24, 2026" (human-readable for WC admin)
  const deliveryDateFormatted = body.deliveryDate
    ? new Date(`${body.deliveryDate}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Beirut",
      })
    : body.deliveryDate ?? "";

  const deliverySummary = deliveryDateFormatted && body.deliverySlot
    ? `${deliveryDateFormatted} · ${body.deliverySlot}`
    : deliveryDateFormatted || body.deliverySlot || "";

  const deliveryCombined = deliverySummary;

  // Meta keys matching WooFunnels (WFACP) custom field IDs from the checkout page
  // so values display in the right field on the WooCommerce order admin.
  const metaData = [
    // Internal app meta (underscore-prefixed = hidden in admin UI by default)
    { key: "_app_order_id", value: body.orderId },
    { key: "_source", value: "presentail-app" },

    // WFACP custom fields (must match checkout field IDs)
    { key: "card_message", value: body.cardMessage ?? "" },
    { key: "wfacp_card_message", value: body.cardMessage ?? "" },
    { key: "to_text", value: cardToValue },
    { key: "from", value: body.cardFrom ?? "" },
    { key: "delivery", value: deliveryCombined },
    { key: "secret_id", value: body.identitySecret ? "Yes" : "No" },
    { key: "qr-code", value: body.qrLink ?? "" },
    { key: "qr-label", value: body.qrLabel ?? "" },

    // Extra structured meta (visible) for ops staff
    { key: "Delivery Summary", value: deliverySummary },
    { key: "Delivery Date", value: deliveryDateFormatted },
    { key: "Delivery Time", value: body.deliverySlot ?? "" },
    { key: "Delivery District", value: body.district },
    { key: "Delivery Address", value: body.deliveryDetails },
    { key: "Recipient Name", value: recipientFullName },
    { key: "Recipient Phone", value: body.recipient.phone },

    // FunnelKit / WooFunnels checkout shortcode field IDs
    { key: "checkout_delivery_slots", value: deliverySummary },
  ];

  // Delivery meta attached to each line item so it shows under the product in WC order admin
  const lineItemDeliveryMeta = [
    { key: "Delivery Summary", value: deliverySummary },
    { key: "Delivery Date", value: deliveryDateFormatted },
    { key: "Delivery Time", value: body.deliverySlot ?? "" },
  ];

  // Resolve presented currency (sent by the app) and convert every monetary
  // amount from USD into that currency before sending to WooCommerce, so the
  // WC order total matches what Stripe / Mamo / PayPal actually charged the
  // customer. We do not rely on WC to convert.
  const presentedCurrency: SupportedCurrency = normalizeCurrency(body.currencyCode);
  const conv = async (usd: number) =>
    roundForCurrency(await convertFromUsd(usd, presentedCurrency), presentedCurrency);
  const fmt = (v: number) => v.toFixed(2);

  // Items with a WooCommerce product ID → proper line_items
  // Items without (static catalog only) → fee_lines so WC still captures them
  const lineItems = await Promise.all(
    body.items
      .filter((item) => !!item.wcId)
      .map(async (item) => {
        const unit = await conv(item.price);
        const lineTotal = unit * item.quantity;
        return {
          product_id: item.wcId,
          quantity: item.quantity,
          subtotal: fmt(lineTotal),
          total: fmt(lineTotal),
          meta_data: lineItemDeliveryMeta,
        };
      }),
  );

  const feeLines: any[] = await Promise.all(
    body.items
      .filter((item) => !item.wcId)
      .map(async (item) => {
        const lineTotal = (await conv(item.price)) * item.quantity;
        return {
          name: `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
          total: fmt(lineTotal),
          tax_status: "none",
        };
      }),
  );

  const shippingLines: any[] = [];
  const convertedDistrictFee = await conv(body.districtFee);
  if (convertedDistrictFee > 0) {
    shippingLines.push({
      method_id: "flat_rate",
      method_title: `Delivery – ${body.district}`,
      total: fmt(convertedDistrictFee),
    });
  } else {
    shippingLines.push({
      method_id: "free_shipping",
      method_title: `Free Delivery – ${body.district}`,
      total: "0.00",
    });
  }
  if (body.expressFee > 0) {
    shippingLines.push({
      method_id: "flat_rate",
      method_title: "Express Delivery Surcharge",
      total: fmt(await conv(body.expressFee)),
    });
  }

  // Surface the presented currency in admin meta for ops staff & receipts.
  metaData.push(
    { key: "Presented Currency", value: presentedCurrency },
    { key: "_presented_currency", value: presentedCurrency },
  );

  const orderPayload = {
    status: "processing",
    currency: presentedCurrency,
    payment_method: (body.paymentMethod === "card" || body.paymentMethod === "wallet") ? "stripe" : body.paymentMethod,
    payment_method_title: paymentTitles[body.paymentMethod] ?? body.paymentMethod,
    set_paid: body.paymentMethod === "card" || body.paymentMethod === "wallet",
    billing: {
      first_name: body.billing.firstName,
      last_name: body.billing.lastName,
      email: body.billing.email,
      phone: body.billing.phone,
      country: body.billingCountry ?? "LB",
    },
    shipping: {
      first_name: body.recipient.firstName,
      last_name: body.recipient.lastName,
      address_1: body.deliveryDetails,
      city: body.district,
      country: body.shippingCountry ?? "LB",
    },
    line_items: lineItems,
    fee_lines: feeLines,
    shipping_lines: shippingLines,
    customer_note: [body.orderNotes, body.cardMessage ? `Card: "${body.cardMessage}" – from ${body.cardFrom}` : ""]
      .filter(Boolean)
      .join("\n"),
    meta_data: metaData,
  };

  // Resolve the owning user from the Authorization header (if any).
  // We do NOT trust any client-supplied user id in the body — that would
  // let a malicious caller redirect another customer's order pushes to
  // their own account.
  let resolvedUserId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader);
    if (auth.ok) {
      resolvedUserId = auth.customerId;
    }
    // Silently ignore invalid tokens here — checkout supports guests, so
    // an expired/missing token must not block the order. Push routing
    // simply falls back to deviceId in that case.
  }

  try {
    const r = await wooFetch("/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });
    const data = (await r.json()) as WcOrderResponse;
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: data?.message ?? "WooCommerce order failed", data });
    }

    // Persist app↔WC mapping and fire the "confirmed" push. Both are
    // best-effort — failures must not break the customer's checkout.
    const wcOrderId = typeof data?.id === "number" ? data.id : null;
    const appUserId = resolvedUserId;
    // Only persist the app device id when the request is authenticated.
    // An unauthenticated caller could otherwise spoof another user's
    // deviceId and hijack push notifications for that order. For guest
    // checkouts we drop the device id and the order simply won't push
    // back into the buyer's app — that's the safe default.
    const rawDeviceId =
      typeof body.appDeviceId === "string" && body.appDeviceId
        ? body.appDeviceId
        : null;
    const appDeviceId = appUserId != null ? rawDeviceId : null;
    if (rawDeviceId && appUserId == null) {
      req.log?.info?.(
        { appOrderId: body.orderId },
        "woo.order: ignoring appDeviceId on unauthenticated request",
      );
    }

    (async () => {
      try {
        await db
          .insert(appOrdersTable)
          .values({
            appOrderId: body.orderId,
            wcOrderId,
            userId: appUserId,
            deviceId: appDeviceId,
            recipientName: recipientFullName || null,
            deliveryDate: body.deliveryDate ?? null,
            deliverySlot: body.deliverySlot ?? null,
            state: "confirmed",
          })
          .onConflictDoUpdate({
            target: appOrdersTable.appOrderId,
            set: {
              wcOrderId,
              userId: appUserId,
              deviceId: appDeviceId,
              recipientName: recipientFullName || null,
              deliveryDate: body.deliveryDate ?? null,
              deliverySlot: body.deliverySlot ?? null,
              state: "confirmed",
              updatedAt: new Date(),
            },
          });
      } catch (err: any) {
        req.log?.warn?.(
          { err: err?.message, appOrderId: body.orderId },
          "woo.order: failed to persist app order mapping",
        );
      }

      try {
        await sendOrderEventPush({
          state: "confirmed",
          appOrderId: body.orderId,
          userId: appUserId,
          deviceId: appDeviceId,
          recipientName: recipientFullName || null,
        });
      } catch (err: any) {
        req.log?.warn?.(
          { err: err?.message, appOrderId: body.orderId },
          "woo.order: failed to send confirmed push",
        );
      }
    })();

    return res.json({ ok: true, wcOrderId: data.id, orderKey: data.order_key });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to create order" });
  }
});

export default router;

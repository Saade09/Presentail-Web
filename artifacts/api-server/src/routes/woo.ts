import { Router, type IRouter } from "express";
import { authenticate } from "../lib/auth";
import {
  WooOrderSchema,
  attemptCreateWcOrder,
  enqueuePendingWcOrder,
  listPendingWooOrders,
  recordSuccessfulWcOrder,
} from "../lib/wooOrders";

const router: IRouter = Router();

// Narrow subsets of the WooCommerce REST responses we actually read.
// These intentionally model only the fields consumed by this route so a
// schema drift on the WC side surfaces as a typecheck error rather than
// a silent runtime mismatch.
type WcErrorResponse = { message?: string };

type WcMeta = {
  key?: string;
  // WC returns scalar or array values; keep it loose but explicit.
  value?: string | number | boolean | null | Array<string | number>;
};

type WcImage = { src?: string };

type WcProductCategory = {
  id: number;
  name: string;
  slug: string;
};

type WcProduct = {
  id: number;
  slug: string;
  name?: string;
  price?: string;
  short_description?: string;
  stock_status?: string;
  featured?: boolean;
  images?: WcImage[];
  categories?: WcProductCategory[];
  meta_data?: WcMeta[];
};

type WcBrand = {
  id: number;
  name: string;
  slug: string;
  count?: number;
  image?: WcImage | null;
};

type WcCategory = {
  id: number;
  name?: string;
  slug: string;
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
function readMetaList(meta: WcMeta[] | undefined, ...keys: string[]): string[] | null {
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

function isDeliverable(p: WcProduct, filter: DeliveryFilter): boolean {
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

function transformProduct(p: WcProduct) {
  const price = parseFloat(p.price ?? "") || 0;
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
      const err = (await r.json()) as WcErrorResponse;
      return res.status(r.status).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
    }
    const brands = (await r.json()) as WcBrand[];
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
    const brandList = (await brandRes.json()) as WcBrand[];
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
    const batch = (await r.json()) as WcProduct[];
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
    const catList = (await catRes.json()) as WcCategory[];
    if (!catList.length) return res.json({ ok: true, products: [], count: 0 });
    const catId = catList[0].id;
    const catName: string = catList[0].name ?? slug;

    const allProducts: WcProduct[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(`/products?category=${catId}&per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
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
    const allProducts: WcProduct[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(`/products?category=${categoryId}&per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const filter = readDeliveryFilter(req);
    const deliverable = allProducts.filter((p) => isDeliverable(p, filter));

    // Group products by type category (priority-ordered)
    type TransformedProduct = ReturnType<typeof transformProduct>;
    const groups = new Map<string, { label: string; products: TransformedProduct[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of deliverable) {
        if (assigned.has(p.id)) continue;
        const slugs = (p.categories ?? []).map((c) => c.slug);
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
    const allProducts: WcProduct[] = [];
    let page = 1;
    while (true) {
      const r = await wooFetch(`/products?per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
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
  const body = parsed.data;

  // Resolve the owning user from the Authorization header (if any).
  // We do NOT trust any client-supplied user id in the body — that would
  // let a malicious caller redirect another customer's order pushes to
  // their own account. Silently ignore invalid tokens here — checkout
  // supports guests, so an expired/missing token must not block the order.
  let resolvedUserId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader);
    if (auth.ok) {
      resolvedUserId = auth.customerId;
    }
  }

  const result = await attemptCreateWcOrder(body);

  if (!result.ok) {
    // Payment already succeeded but WC order creation failed. Persist the
    // payload to the reconciliation queue so the worker can keep retrying
    // without involving support — see lib/wooOrders.ts for the worker.
    await enqueuePendingWcOrder({
      body,
      paymentRef: body.paymentRef ?? null,
      userId: resolvedUserId,
      errorMessage: result.message,
      log: req.log,
    });
    req.log?.warn?.(
      {
        appOrderId: body.orderId,
        paymentRef: body.paymentRef,
        status: result.status,
        message: result.message,
      },
      "woo.order: WC create failed, queued for reconciliation",
    );
    return res
      .status(result.status)
      .json({ ok: false, message: result.message, queued: true });
  }

  // Persist app↔WC mapping and fire the "confirmed" push. Both are
  // best-effort — failures must not break the customer's checkout.
  void recordSuccessfulWcOrder({
    body,
    wcOrderId: result.wcOrderId,
    userId: resolvedUserId,
    recipientName: result.recipientName,
    log: req.log,
  });

  return res.json({
    ok: true,
    wcOrderId: result.wcOrderId,
    orderKey: result.orderKey,
  });
});

// ---------------------------------------------------------------------------
// Admin: list pending/exhausted reconciliation rows so support has a single
// view of orders that the worker couldn't recover automatically. Reuses the
// existing PUSH_ADMIN_TOKEN as the shared admin credential.
// ---------------------------------------------------------------------------
router.get("/woo/pending-orders", async (req, res) => {
  const adminToken = process.env.PUSH_ADMIN_TOKEN;
  const supplied = req.header("x-admin-token") ?? req.header("x-push-admin-token");
  if (!adminToken || !supplied || supplied !== adminToken) {
    return res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" });
  }
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "";
  const status =
    rawStatus === "pending" || rawStatus === "succeeded" || rawStatus === "exhausted"
      ? rawStatus
      : undefined;
  try {
    const rows = await listPendingWooOrders({ status });
    return res.json({
      ok: true,
      count: rows.length,
      orders: rows.map((r) => ({
        id: r.id,
        appOrderId: r.appOrderId,
        paymentRef: r.paymentRef,
        status: r.status,
        attempts: r.attempts,
        maxAttempts: r.maxAttempts,
        nextAttemptAt: r.nextAttemptAt,
        wcOrderId: r.wcOrderId,
        lastError: r.lastError,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ ok: false, message: err?.message ?? "Failed to list pending orders" });
  }
});

export default router;

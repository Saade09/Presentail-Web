import { Router, type IRouter } from "express";
import { authenticate } from "../lib/auth";
import {
  WooOrderSchema,
  attemptCreateWcOrder,
  enqueuePendingWcOrder,
  listPendingWooOrders,
  recordSuccessfulWcOrder,
} from "../lib/wooOrders";
import {
  verifyStripePayment,
  verifyMamoPayment,
  captureAndVerifyPayPalOrder,
} from "../lib/catalog";
import { consumePaymentIntent, verifyCartMatchesSnapshot } from "../lib/checkoutIntents";

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

const SUPPORTED_LANGS = ["en", "ar", "fr"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

function readLang(req: { query: any }): Lang {
  const raw = typeof req.query?.lang === "string" ? req.query.lang.toLowerCase() : "";
  return (SUPPORTED_LANGS as readonly string[]).includes(raw) ? (raw as Lang) : "en";
}

function wooAuth() {
  const key = process.env.WC_CONSUMER_KEY ?? "";
  const secret = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

// Append a `lang` query param to a Woo REST path. This is the convention used
// by WPML and Polylang to request translated content. If the WooCommerce site
// does not have a multilingual plugin installed, the parameter is harmlessly
// ignored and the response is the default-language (English) content — which
// is the desired English fallback behaviour.
function withLang(path: string, lang: Lang): string {
  if (lang === "en") return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}lang=${lang}`;
}

async function wooFetch(path: string, options: RequestInit = {}, lang: Lang = "en") {
  return fetch(`${WC_BASE}${withLang(path, lang)}`, {
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

// Translation tables for content that is hardcoded server-side (group labels,
// fallbacks). Product/brand/category names returned by WooCommerce are
// translated upstream by the multilingual plugin via the `lang` query param;
// when a translation is missing, we fall back to the English string.
const OCCASION_GROUP_LABELS: Record<string, Record<Lang, string>> = {
  flowers: { en: "Flowers & Bouquets", ar: "الأزهار والباقات", fr: "Fleurs et bouquets" },
  "hand-bouquets": { en: "Hand Bouquets", ar: "الباقات اليدوية", fr: "Bouquets à la main" },
  "flower-boxes": { en: "Flower Boxes", ar: "صناديق الأزهار", fr: "Boîtes de fleurs" },
  "flower-vases": { en: "Flower Vases", ar: "مزهريات الأزهار", fr: "Vases à fleurs" },
  "lux-arrangements": { en: "Lux Arrangements", ar: "تنسيقات فاخرة", fr: "Compositions de luxe" },
  "dried-flowers": { en: "Dried Flowers", ar: "أزهار مجففة", fr: "Fleurs séchées" },
  "preserved-flowers": { en: "Preserved Flowers", ar: "أزهار محفوظة", fr: "Fleurs préservées" },
  chocolate: { en: "Chocolates", ar: "الشوكولاتة", fr: "Chocolats" },
  cakes: { en: "Cakes & Sweets", ar: "الكعك والحلويات", fr: "Gâteaux et douceurs" },
  "arabic-sweets": { en: "Arabic Sweets", ar: "حلويات عربية", fr: "Pâtisseries orientales" },
  balloons: { en: "Balloons", ar: "البالونات", fr: "Ballons" },
  electronics: { en: "Electronics & Tech", ar: "إلكترونيات وتقنية", fr: "Électronique et tech" },
  "stuffed-animals": { en: "Stuffed Animals", ar: "الدمى المحشوة", fr: "Peluches" },
  "board-games": { en: "Board Games", ar: "ألعاب الطاولة", fr: "Jeux de société" },
  plants: { en: "Plants", ar: "النباتات", fr: "Plantes" },
  baskets: { en: "Baskets", ar: "السلال", fr: "Paniers" },
  beauty: { en: "Beauty", ar: "الجمال", fr: "Beauté" },
  bundles: { en: "Gift Bundles", ar: "حزم الهدايا", fr: "Coffrets cadeaux" },
};

function translateOccasionLabel(slug: string, fallback: string, lang: Lang): string {
  const entry = OCCASION_GROUP_LABELS[slug];
  if (!entry) return fallback;
  return entry[lang] ?? entry.en ?? fallback;
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
  const imageList = (p.images ?? [])
    .map((img) => img?.src)
    .filter((src): src is string => typeof src === "string" && src.length > 0)
    .map((src) => ({ uri: src }));
  const image = imageList[0] ?? null;
  return {
    id: p.slug,
    wcId: p.id,
    name: p.name?.replace(/&#8211;/g, "–").replace(/&amp;/g, "&").replace(/&#8217;/g, "'") ?? "",
    price: `$${price.toLocaleString()}`,
    priceValue: price,
    image,
    images: imageList,
    category: mapCategory(p.categories ?? []),
    inStock: p.stock_status === "instock",
    description: p.short_description
      ? p.short_description.replace(/<[^>]*>/g, "").trim()
      : undefined,
    tag: p.featured ? "Featured" : undefined,
    occasions: [],
  };
}

router.get("/woo/brands", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const r = await wooFetch("/products/brands?per_page=100", {}, lang);
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
  const lang = readLang(req);

  try {
    const brandRes = await wooFetch(
      `/products/brands?slug=${encodeURIComponent(brandSlug)}&per_page=5`,
      {},
      lang,
    );
    if (!brandRes.ok) {
      return res.status(brandRes.status).json({ ok: false, message: "Failed to lookup brand" });
    }
    const brandList = (await brandRes.json()) as WcBrand[];
    if (!brandList.length) {
      return res.json({ ok: true, products: [], count: 0 });
    }
    const brandId = brandList[0].id;
    const brandName = brandList[0].name;

    const r = await wooFetch(
      `/products?brand=${brandId}&per_page=50&status=publish&stock_status=instock`,
      {},
      lang,
    );
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: "Failed to fetch brand products" });
    }
    const batch = (await r.json()) as WcProduct[];
    const filter = readDeliveryFilter(req);
    const products = batch.filter((p) => isDeliverable(p, filter)).map(transformProduct);
    return res.json({ ok: true, products, count: products.length, brandName });
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
  const lang = readLang(req);
  try {
    const catRes = await wooFetch(
      `/products/categories?slug=${encodeURIComponent(slug)}&per_page=5`,
      {},
      lang,
    );
    if (!catRes.ok) return res.status(catRes.status).json({ ok: false, message: "Failed to lookup category" });
    const catList = (await catRes.json()) as WcCategory[];
    if (!catList.length) return res.json({ ok: true, products: [], count: 0 });
    const catId = catList[0].id;
    const catName: string = catList[0].name ?? slug;

    const allProducts: WcProduct[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(
        `/products?category=${catId}&per_page=100&page=${page}&status=publish&stock_status=instock`,
        {},
        lang,
      );
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
  const lang = readLang(req);

  try {
    const allProducts: WcProduct[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(
        `/products?category=${categoryId}&per_page=100&page=${page}&status=publish&stock_status=instock`,
        {},
        lang,
      );
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    const filter = readDeliveryFilter(req);
    const deliverable = allProducts.filter((p) => isDeliverable(p, filter));

    type TransformedProduct = ReturnType<typeof transformProduct>;
    const groups = new Map<string, { label: string; products: TransformedProduct[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of deliverable) {
        if (assigned.has(p.id)) continue;
        const slugs = (p.categories ?? []).map((c) => c.slug);
        if (slugs.includes(typecat.slug)) {
          if (!groups.has(typecat.slug)) {
            const label = translateOccasionLabel(typecat.slug, typecat.label, lang);
            groups.set(typecat.slug, { label, products: [] });
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

const ALL_PRODUCTS_TTL_MS = 5 * 60 * 1000;
const allProductsCache: Map<Lang, { fetchedAt: number; products: WcProduct[] }> = new Map();
const allProductsInflight: Map<Lang, Promise<WcProduct[]>> = new Map();

async function fetchAllProducts(lang: Lang): Promise<WcProduct[]> {
  const now = Date.now();
  const cached = allProductsCache.get(lang);
  if (cached && now - cached.fetchedAt < ALL_PRODUCTS_TTL_MS) {
    return cached.products;
  }
  const existing = allProductsInflight.get(lang);
  if (existing) return existing;
  const promise = (async () => {
    const collected: WcProduct[] = [];
    let page = 1;
    while (true) {
      const r = await wooFetch(
        `/products?per_page=100&page=${page}&status=publish&stock_status=instock`,
        {},
        lang,
      );
      if (!r.ok) break;
      const batch = (await r.json()) as WcProduct[];
      if (!batch.length) break;
      collected.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    allProductsCache.set(lang, { fetchedAt: Date.now(), products: collected });
    return collected;
  })().finally(() => {
    allProductsInflight.delete(lang);
  });
  allProductsInflight.set(lang, promise);
  return promise;
}

router.get("/woo/products", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const lang = readLang(req);
    const allProducts = await fetchAllProducts(lang);
    const filter = readDeliveryFilter(req);
    const products = allProducts.filter((p) => isDeliverable(p, filter)).map(transformProduct);
    return res.json({ ok: true, products, count: products.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch products" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/woo/order
//
// Security (layered defence):
//
// 1. Payment verification: The server calls the upstream PSP (Stripe, Mamo,
//    PayPal) to confirm the payment is genuinely paid/captured.
//
// 2. Intent binding (payment↔order): When a payment session is created, the
//    server stores a checkout intent that links the paymentRef (provider ID)
//    to the specific orderId. On finalization the intent is consumed (single
//    use) and the orderId must match. This prevents:
//      - Replay attacks: using a paid session for a different/higher-value order.
//      - Cross-order payment substitution.
//
// 3. Catalog prices: Product prices are re-derived from the WooCommerce catalog
//    by wcId. Client-supplied prices are ignored for all financial calculations.
//
// 4. Server-side fees: Delivery fees are computed from an authoritative
//    server-side table; client-supplied districtFee/expressFee are ignored.
// ---------------------------------------------------------------------------
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
  let resolvedUserId: number | null = null;
  const authHeader = req.header("authorization");
  if (authHeader) {
    const auth = await authenticate(authHeader);
    if (auth.ok) {
      resolvedUserId = auth.customerId;
    }
  }

  // ── Payment verification (layered) ────────────────────────────────────
  let paymentVerified = false;
  const paymentRef = body.paymentRef;

  if (body.paymentMethod === "card" || body.paymentMethod === "wallet") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Stripe session ID (paymentRef) is required for card/wallet payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding from the checkout intent.
    // This prevents replaying a paid session for a different order.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify the submitted cart matches the canonical cart snapshot
    // stored when the payment session was created. This closes the cart-
    // substitution gap: a client cannot pay for a cheap cart and submit a more
    // expensive one to /woo/order — the wcId+quantity pairs must match exactly.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot);
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted cart does not match paid-for cart snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted cart does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: STRIPE_SECRET_KEY not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Verify with Stripe that payment_status is "paid" AND that
      // the session's metadata.orderId matches (guards against Stripe-side
      // tampering and confirms the session was created for this order).
      paymentVerified = await verifyStripePayment(paymentRef, body.orderId);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: Stripe payment not confirmed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be confirmed with Stripe. Please complete payment before placing the order.",
        });
      }
    }
  } else if (body.paymentMethod === "mamo") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A Mamo payment link ID (paymentRef) is required for Mamo payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid Mamo payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify cart snapshot — submitted cart AND delivery context
    // must match the paid snapshot. Mamo charges the full total (products +
    // delivery), so a district or express substitution is also fraud.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for Mamo snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.MAMO_SECRET_KEY) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: MAMO_SECRET_KEY not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Verify with Mamo provider.
      paymentVerified = await verifyMamoPayment(paymentRef);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: Mamo payment not confirmed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be confirmed with Mamo. Please complete payment before placing the order.",
        });
      }
    }
  } else if (body.paymentMethod === "paypal") {
    if (!paymentRef) {
      return res.status(402).json({
        ok: false,
        code: "payment_reference_required",
        message: "A PayPal order ID (paymentRef) is required for PayPal payments.",
      });
    }

    // Layer 1: Verify orderId↔paymentRef binding.
    const intent = consumePaymentIntent(paymentRef, body.orderId);
    if (!intent) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: no valid PayPal payment intent found for this paymentRef+orderId pair",
      );
      return res.status(402).json({
        ok: false,
        code: "payment_intent_invalid",
        message: "No valid payment session found for this order. Please initiate checkout again.",
      });
    }

    // Layer 1b: Verify cart snapshot — submitted cart AND delivery context
    // must match the paid snapshot. PayPal charges the full total (products +
    // delivery), so a district or express substitution is also fraud.
    const cartMismatch = verifyCartMatchesSnapshot(body.items, intent.snapshot, {
      checkDelivery: true,
      submittedDistrict: body.district,
      submittedExpressDelivery: body.expressFee > 0,
    });
    if (cartMismatch) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef, reason: cartMismatch },
        "woo.order: submitted order does not match paid-for PayPal snapshot — rejecting",
      );
      return res.status(402).json({
        ok: false,
        code: "cart_mismatch",
        message: "The submitted order does not match the paid-for cart. Please initiate checkout again.",
      });
    }

    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      req.log?.warn?.(
        { appOrderId: body.orderId, paymentRef },
        "woo.order: PayPal credentials not configured, recording order without set_paid",
      );
    } else {
      // Layer 2: Capture + verify with PayPal provider.
      paymentVerified = await captureAndVerifyPayPalOrder(paymentRef);
      if (!paymentVerified) {
        req.log?.warn?.(
          { appOrderId: body.orderId, paymentRef },
          "woo.order: PayPal payment capture/verification failed — rejecting order",
        );
        return res.status(402).json({
          ok: false,
          code: "payment_not_confirmed",
          message: "Payment could not be captured with PayPal. Please complete payment before placing the order.",
        });
      }
    }
  }
  // whish / western: offline payments — paymentVerified stays false,
  // WC order will be created with set_paid: false (pending payment).

  const result = await attemptCreateWcOrder(body, { paymentVerified });

  if (!result.ok) {
    // Payment already succeeded but WC order creation failed. Persist the
    // payload to the reconciliation queue so the worker can keep retrying.
    await enqueuePendingWcOrder({
      body,
      paymentRef: body.paymentRef ?? null,
      userId: resolvedUserId,
      errorMessage: result.message,
      paymentVerified,
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
// Admin: list pending/exhausted reconciliation rows.
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

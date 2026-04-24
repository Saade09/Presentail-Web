import { Router, type IRouter } from "express";

const router: IRouter = Router();

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
      const err = await r.json();
      return res.status(r.status).json({ ok: false, message: err?.message ?? "Failed to fetch brands" });
    }
    const brands: any[] = await r.json();
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
    const brandList: any[] = await brandRes.json();
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
    const batch: any[] = await r.json();
    const products = batch.map(transformProduct);
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
    const catList: any[] = await catRes.json();
    if (!catList.length) return res.json({ ok: true, products: [], count: 0 });
    const catId = catList[0].id;
    const catName: string = catList[0].name ?? slug;

    const allProducts: any[] = [];
    let page = 1;
    while (allProducts.length < 200) {
      const r = await wooFetch(`/products?category=${catId}&per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch: any[] = await r.json();
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return res.json({ ok: true, products: allProducts.map(transformProduct), count: allProducts.length, categoryName: catName });
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
      const batch: any[] = await r.json();
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    // Group products by type category (priority-ordered)
    const groups = new Map<string, { label: string; products: any[] }>();
    const assigned = new Set<number>();

    for (const typecat of OCCASION_TYPE_CATEGORIES) {
      for (const p of allProducts) {
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

router.get("/woo/products", async (_req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  try {
    const allProducts: any[] = [];
    let page = 1;
    while (true) {
      const r = await wooFetch(`/products?per_page=100&page=${page}&status=publish&stock_status=instock`);
      if (!r.ok) break;
      const batch: any[] = await r.json();
      if (!batch.length) break;
      allProducts.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    const products = allProducts.map(transformProduct);
    return res.json({ ok: true, products, count: products.length });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to fetch products" });
  }
});

type WooOrderPayload = {
  orderId: string;
  items: { name: string; quantity: number; price: number; wcId?: number }[];
  billing: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  recipient: {
    firstName: string;
    lastName: string;
    phone: string;
  };
  district: string;
  districtFee: number;
  expressFee: number;
  deliveryDetails: string;
  deliveryDate: string;
  deliverySlot: string;
  cardMessage?: string;
  cardFrom?: string;
  cardTo?: string;
  qrLink?: string;
  qrLabel?: string;
  orderNotes?: string;
  paymentMethod: "card" | "whish" | "western" | "mamo" | "paypal";
  identitySecret?: boolean;
};

router.post("/woo/order", async (req, res) => {
  if (!process.env.WC_CONSUMER_KEY) {
    return res.status(503).json({ ok: false, message: "WooCommerce not configured" });
  }
  const body = req.body as WooOrderPayload;
  if (!body.items?.length || !body.billing) {
    return res.status(400).json({ ok: false, message: "Missing required fields" });
  }

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
  ];

  // Delivery meta attached to each line item so it shows under the product in WC order admin
  const lineItemDeliveryMeta = [
    { key: "Delivery Summary", value: deliverySummary },
    { key: "Delivery Date", value: deliveryDateFormatted },
    { key: "Delivery Time", value: body.deliverySlot ?? "" },
  ];

  // Items with a WooCommerce product ID → proper line_items
  // Items without (static catalog only) → fee_lines so WC still captures them
  const lineItems = body.items
    .filter((item) => !!item.wcId)
    .map((item) => ({
      product_id: item.wcId,
      quantity: item.quantity,
      meta_data: lineItemDeliveryMeta,
    }));

  const feeLines: any[] = body.items
    .filter((item) => !item.wcId)
    .map((item) => ({
      name: `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
      total: (item.price * item.quantity).toFixed(2),
      tax_status: "none",
    }));

  const shippingLines: any[] = [];
  if (body.districtFee > 0) {
    shippingLines.push({
      method_id: "flat_rate",
      method_title: `Delivery – ${body.district}`,
      total: body.districtFee.toFixed(2),
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
      total: body.expressFee.toFixed(2),
    });
  }

  const orderPayload = {
    status: "processing",
    payment_method: (body.paymentMethod === "card" || body.paymentMethod === "wallet") ? "stripe" : body.paymentMethod,
    payment_method_title: paymentTitles[body.paymentMethod] ?? body.paymentMethod,
    set_paid: body.paymentMethod === "card" || body.paymentMethod === "wallet",
    billing: {
      first_name: body.billing.firstName,
      last_name: body.billing.lastName,
      email: body.billing.email,
      phone: body.billing.phone,
      country: "LB",
    },
    shipping: {
      first_name: body.recipient.firstName,
      last_name: body.recipient.lastName,
      address_1: body.deliveryDetails,
      city: body.district,
      country: "LB",
    },
    line_items: lineItems,
    fee_lines: feeLines,
    shipping_lines: shippingLines,
    customer_note: [body.orderNotes, body.cardMessage ? `Card: "${body.cardMessage}" – from ${body.cardFrom}` : ""]
      .filter(Boolean)
      .join("\n"),
    meta_data: metaData,
  };

  try {
    const r = await wooFetch("/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, message: data?.message ?? "WooCommerce order failed", data });
    }
    return res.json({ ok: true, wcOrderId: data.id, orderKey: data.order_key });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message ?? "Failed to create order" });
  }
});

export default router;

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
  orderNotes?: string;
  paymentMethod: "card" | "whish" | "western";
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
    card: "Credit / Debit Card (App)",
    whish: "Whish Money",
    western: "Western Union",
  };

  const metaData = [
    { key: "_app_order_id", value: body.orderId },
    { key: "delivery_date", value: body.deliveryDate },
    { key: "delivery_slot", value: body.deliverySlot },
    { key: "delivery_district", value: body.district },
    { key: "delivery_address", value: body.deliveryDetails },
    { key: "recipient_name", value: `${body.recipient.firstName} ${body.recipient.lastName}` },
    { key: "recipient_phone", value: body.recipient.phone },
    { key: "card_message", value: body.cardMessage ?? "" },
    { key: "card_from", value: body.cardFrom ?? "" },
    { key: "card_to", value: body.cardTo ?? "" },
    { key: "identity_secret", value: body.identitySecret ? "Yes" : "No" },
    { key: "order_notes", value: body.orderNotes ?? "" },
    { key: "source", value: "presentail-app" },
  ];

  // Items with a WooCommerce product ID → proper line_items
  // Items without (static catalog only) → fee_lines so WC still captures them
  const lineItems = body.items
    .filter((item) => !!item.wcId)
    .map((item) => ({
      product_id: item.wcId,
      quantity: item.quantity,
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
      method_title: `Delivery – ${body.district}`,
      total: body.districtFee.toFixed(2),
    });
  }
  if (body.expressFee > 0) {
    shippingLines.push({
      method_title: "Express Delivery Surcharge",
      total: body.expressFee.toFixed(2),
    });
  }

  const orderPayload = {
    status: "processing",
    payment_method: body.paymentMethod === "card" ? "stripe" : body.paymentMethod,
    payment_method_title: paymentTitles[body.paymentMethod] ?? body.paymentMethod,
    set_paid: body.paymentMethod === "card",
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

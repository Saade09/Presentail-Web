/**
 * One-shot script: re-submit all LB orders with numeric suffix > 2676
 * (i.e. LB-2677 and above) to Presentail OS.
 *
 * Usage:
 *   node scripts/src/resendOrdersToOs.mjs
 *
 * Required env vars:
 *   DATABASE_URL             — Postgres connection string
 *   PRESENTAIL_OS_API_KEY    — OS API key
 *   PRESENTAIL_OS_API_URL    — defaults to https://os.presentail.com
 *   PRESENTAIL_OS_WORKSPACE  — defaults to "presentail"
 */

import pg from "pg";

const { Client } = pg;

const DB_URL   = process.env.DATABASE_URL;
const API_KEY  = process.env.PRESENTAIL_OS_API_KEY ?? "";
const BASE_URL = (process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com").replace(/\/$/, "");
const WORKSPACE = process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail";

if (!DB_URL)  { console.error("❌ DATABASE_URL is not set"); process.exit(1); }
if (!API_KEY) { console.error("❌ PRESENTAIL_OS_API_KEY is not set"); process.exit(1); }

function splitName(full) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Unknown", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts.pop();
  return { first: parts.join(" "), last };
}

function mapPaymentMethod(pm) {
  switch ((pm ?? "").toLowerCase()) {
    case "card":
    case "apple_pay":
    case "google_pay":
    case "wallet":         return "stripe";
    case "whish":          return "whish";
    case "western":
    case "western-union":  return "western-union";
    case "mamo":           return "mamo";
    case "paypal":         return "paypal";
    default:               return pm ?? "stripe";
  }
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  // Fetch all target orders
  const { rows: orders } = await client.query(`
    SELECT
      a.id, a.app_order_id, a.store_key,
      a.sender_name, a.sender_email, a.sender_phone,
      a.recipient_name, a.recipient_phone,
      a.delivery_district, a.delivery_address,
      a.delivery_date, a.delivery_slot, a.delivery_city_id,
      a.delivery_country_code,
      a.payment_method, a.currency_code,
      a.total_usd_cents,
      a.delivery_service_type,
      a.os_order_id,
      a.state,
      a.whatsapp_opt_in
    FROM app_orders a
    WHERE a.app_order_id ~ '^LB-[0-9]+$'
      AND CAST(substring(a.app_order_id FROM 4) AS integer) > 2676
    ORDER BY a.id ASC
  `);

  // Fetch line items for all target orders in one query
  const { rows: itemRows } = await client.query(`
    SELECT
      a.app_order_id,
      (item->>'name')           AS item_name,
      (item->>'quantity')::int  AS quantity,
      (item->>'priceUsdCents')::int AS price_usd_cents,
      item->>'osSlug'           AS os_slug
    FROM app_orders a,
      jsonb_array_elements(a.line_items_json::jsonb) AS item
    WHERE a.app_order_id ~ '^LB-[0-9]+$'
      AND CAST(substring(a.app_order_id FROM 4) AS integer) > 2676
    ORDER BY a.id ASC
  `);

  await client.end();

  // Group items by order
  const itemsByOrder = {};
  for (const r of itemRows) {
    if (!itemsByOrder[r.app_order_id]) itemsByOrder[r.app_order_id] = [];
    itemsByOrder[r.app_order_id].push({
      productId:   r.os_slug || r.item_name,
      productName: r.item_name,
      quantity:    r.quantity,
      priceUsd:    r.price_usd_cents / 100,
    });
  }

  const headers = {
    "Content-Type":  "application/json",
    "Accept":        "application/json",
    "User-Agent":    "PresentailApp/1.0",
    "Authorization": `Bearer ${API_KEY}`,
    "x-api-key":     API_KEY,
  };

  console.log(`\nResending ${orders.length} orders to OS...\n`);

  let succeeded = 0;
  let failed    = 0;

  for (const o of orders) {
    const sender   = splitName(o.sender_name);
    const recip    = splitName(o.recipient_name);
    const items    = itemsByOrder[o.app_order_id] ?? [];
    const totalUsd = (o.total_usd_cents ?? 0) / 100;
    const isExpress  = (o.delivery_service_type ?? "") === "express"
                    || (o.delivery_slot ?? "").toLowerCase() === "express";
    const isMidnight = (o.delivery_service_type ?? "") === "midnight";

    const payload = {
      workspace:  WORKSPACE,
      appOrderId: o.app_order_id,
      items,
      feeItems: [],
      billing: {
        firstName:   sender.first,
        lastName:    sender.last,
        email:       o.sender_email  ?? "",
        phone:       o.sender_phone  ?? "",
        countryCode: o.delivery_country_code ?? "LB",
      },
      recipient: {
        firstName: recip.first,
        lastName:  recip.last,
        phone:     o.recipient_phone ?? "",
      },
      delivery: {
        district:    o.delivery_district   ?? "",
        cityId:      o.delivery_city_id    ?? undefined,
        countryCode: o.delivery_country_code ?? "LB",
        address:     o.delivery_address    ?? "",
        date:        o.delivery_date       ?? undefined,
        slot:        isExpress ? "Express" : (o.delivery_slot ?? undefined),
        isExpress,
        noAddress:   !o.delivery_address,
        feeUsd:              0,
        expressSurchargeUsd: 0,
        slotFeeUsd:          0,
      },
      delivery_type: isExpress ? "express" : isMidnight ? "midnight" : "standard",
      payment: {
        method:      mapPaymentMethod(o.payment_method),
        verified:    o.state === "confirmed",
        currencyCode: o.currency_code ?? "USD",
        totalUsd,
      },
      whatsapp_opt_in: o.whatsapp_opt_in === true || o.whatsapp_opt_in === "t",
      platform: "web",
    };

    const url = `${BASE_URL}/api/orders?workspace=${WORKSPACE}`;
    let res;
    try {
      res = await fetch(url, {
        method:  "POST",
        headers,
        body:    JSON.stringify(payload),
      });
    } catch (err) {
      console.log(`❌ ${o.app_order_id} — network error: ${err.message}`);
      failed++;
      continue;
    }

    let body;
    try { body = await res.json(); } catch { body = {}; }

    if (res.ok) {
      const osId = body?.order_id ?? body?.id ?? "(no id returned)";
      console.log(`✅ ${o.app_order_id} → OS id: ${osId}`);
      succeeded++;
    } else {
      const errMsg = body?.error ?? body?.message ?? JSON.stringify(body).slice(0, 120);
      console.log(`❌ ${o.app_order_id} → HTTP ${res.status}: ${errMsg}`);
      failed++;
    }

    // Brief pause between requests to avoid hammering OS
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`Done: ${succeeded} succeeded, ${failed} failed out of ${orders.length} total`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

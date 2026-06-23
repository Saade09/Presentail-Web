/**
 * ordersSheet.ts — append a new order row to the Presentail Orders Google Sheet.
 *
 * Uses a Google Service Account (GOOGLE_SERVICE_ACCOUNT_JSON) to obtain a
 * short-lived OAuth2 access token via a signed JWT, then calls the Sheets
 * REST API to append a row.  No third-party OAuth library is needed — the
 * standard `crypto` module handles RS256 signing.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON key downloaded from GCP console
 *   ORDERS_SHEET_ID              — spreadsheet ID from the sheet URL
 *
 * Both vars are optional at startup; if either is missing every call is a
 * silent no-op so orders still complete normally.
 */

import { createSign } from "crypto";
import { logger } from "./logger.js";

const SHEET_ID = process.env.ORDERS_SHEET_ID ?? "";
const SA_JSON_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";

// Row headers — must match the order of values in buildRow().
export const SHEET_HEADERS = [
  "Order ID",
  "Date",
  "Platform",
  "Store",
  "Sender Name",
  "Sender Email",
  "Sender Phone",
  "Recipient Name",
  "Recipient Phone",
  "District",
  "Delivery Address",
  "Delivery Date",
  "Delivery Slot",
  "Items",
  "Total (USD)",
  "Payment Method",
  "Coupon Code",
  "Card Message",
  "OS Order ID",
];

export type OrderSheetRow = {
  appOrderId: string;
  createdAt: Date;
  platform?: string | null;
  storeKey?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  senderPhone?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryDistrict?: string | null;
  deliveryAddress?: string | null;
  deliveryDate?: string | null;
  deliverySlot?: string | null;
  lineItemsJson?: string | null;
  totalUsdCents?: number | null;
  paymentMethod?: string | null;
  couponCode?: string | null;
  cardMessage?: string | null;
  osOrderId?: string | null;
};

// ── JWT / token helpers ───────────────────────────────────────────────────────

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

function base64url(buf: Buffer | string): string {
  const b64 = typeof buf === "string" ? Buffer.from(buf).toString("base64") : buf.toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.expiresAt > now + 60) {
    return _cachedToken.token;
  }

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  // GCP private keys use \n-escaped newlines in JSON — restore them.
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const signature = base64url(sign.sign(pem));

  const jwt = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

// ── Row builder ───────────────────────────────────────────────────────────────

function buildRow(row: OrderSheetRow): string[] {
  let itemsSummary = "";
  if (row.lineItemsJson) {
    try {
      const items = JSON.parse(row.lineItemsJson) as Array<{
        name: string;
        quantity: number;
        priceUsdCents: number;
      }>;
      itemsSummary = items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ");
    } catch {
      itemsSummary = row.lineItemsJson;
    }
  }

  const totalUsd =
    row.totalUsdCents != null
      ? (row.totalUsdCents / 100).toFixed(2)
      : "";

  return [
    row.appOrderId,
    row.createdAt.toISOString(),
    row.platform ?? "",
    row.storeKey ?? "",
    row.senderName ?? "",
    row.senderEmail ?? "",
    row.senderPhone ?? "",
    row.recipientName ?? "",
    row.recipientPhone ?? "",
    row.deliveryDistrict ?? "",
    row.deliveryAddress ?? "",
    row.deliveryDate ?? "",
    row.deliverySlot ?? "",
    itemsSummary,
    totalUsd,
    row.paymentMethod ?? "",
    row.couponCode ?? "",
    row.cardMessage ?? "",
    row.osOrderId ?? "",
  ];
}

// ── Public API ────────────────────────────────────────────────────────────────

let _saKey: ServiceAccountKey | null = null;
let _parsed = false;

function getServiceAccount(): ServiceAccountKey | null {
  if (_parsed) return _saKey;
  _parsed = true;
  if (!SA_JSON_RAW) return null;
  try {
    _saKey = JSON.parse(SA_JSON_RAW) as ServiceAccountKey;
    if (!_saKey.client_email || !_saKey.private_key) {
      logger.warn("ordersSheet: GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
      _saKey = null;
    }
  } catch {
    logger.warn("ordersSheet: failed to parse GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  return _saKey;
}

/**
 * Ensure the header row exists in the sheet. Called once on first append.
 * If the first row already has content we assume headers are present.
 */
async function ensureHeaders(token: string): Promise<void> {
  const checkUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:A1`;
  const checkRes = await fetch(checkUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!checkRes.ok) return; // best-effort
  const data = (await checkRes.json()) as { values?: string[][] };
  if (data.values?.length) return; // headers already present

  const appendUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:S1:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [SHEET_HEADERS] }),
  });
}

let _headersEnsured = false;

/**
 * Append one order row to the sheet. Best-effort: any error is logged
 * as WARN and never propagated — orders must complete even if Sheets is down.
 */
export async function appendOrderToSheet(row: OrderSheetRow): Promise<void> {
  const sa = getServiceAccount();
  if (!sa || !SHEET_ID) {
    // Silently skip when not configured.
    return;
  }

  try {
    const token = await getAccessToken(sa);

    if (!_headersEnsured) {
      await ensureHeaders(token);
      _headersEnsured = true;
    }

    const values = buildRow(row);
    const appendUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1:append` +
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const res = await fetch(appendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "ordersSheet: append failed");
    } else {
      logger.info({ appOrderId: row.appOrderId }, "ordersSheet: row appended");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "ordersSheet: unexpected error, skipping");
  }
}

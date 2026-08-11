/**
 * Standalone diagnostic — calls the CyberSource capture-context endpoint
 * directly using env var credentials. No gate, no middleware.
 * Usage: node artifacts/api-server/scripts/test-cs-capture-context.mjs
 */
import crypto from "node:crypto";

const REQUIRED = [
  "CYBERSOURCE_MERCHANT_ID",
  "CYBERSOURCE_API_KEY_ID",
  "CYBERSOURCE_SHARED_SECRET_KEY",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env vars:", missing.join(", "));
  process.exit(1);
}

const merchantId    = process.env.CYBERSOURCE_MERCHANT_ID;
const apiKeyId      = process.env.CYBERSOURCE_API_KEY_ID;
const sharedSecret  = process.env.CYBERSOURCE_SHARED_SECRET_KEY;
const rawEnv        = (process.env.CYBERSOURCE_ENV ?? "").toLowerCase();
const isProduction  = /prod/.test(rawEnv);
const baseUrl = isProduction
  ? (process.env.CYBERSOURCE_BASE_URL_PROD ?? "https://api.cybersource.com")
  : (process.env.CYBERSOURCE_BASE_URL_TEST ?? "https://apitest.cybersource.com");

console.log("=== CyberSource capture-context diagnostic ===");
console.log("environment :", isProduction ? "production" : "test");
console.log("baseUrl     :", baseUrl.slice(0, 8) + "****" + baseUrl.slice(-12));
console.log("merchantId  :", merchantId.slice(0, 4) + "****");
console.log("apiKeyId    :", apiKeyId.slice(0, 6) + "****");
console.log("");

const path   = "/up/v1/capture-contexts";
const method = "POST";

const body = {
  clientVersion: process.env.CYBERSOURCE_CLIENT_VERSION ?? "0.23",
  locale: process.env.CYBERSOURCE_LOCALE ?? "en_US",
  country: process.env.CYBERSOURCE_MERCHANT_COUNTRY ?? "LB",
  targetOrigins: ["https://presentail.com"],
  allowedCardNetworks: ["VISA", "MASTERCARD", "AMEX"],
  allowedPaymentTypes: ["PANENTRY"],
  orderInformation: {
    amountDetails: { totalAmount: "1.00", currency: "USD" },
  },
};

const serialised = JSON.stringify(body);

// ── HTTP Signature ────────────────────────────────────────────────────────────
const gmtDate = new Date().toUTCString();
const digest  = "SHA-256=" + crypto.createHash("sha256").update(serialised).digest("base64");

const signTarget = [
  `host: ${new URL(baseUrl).host}`,
  `date: ${gmtDate}`,
  `(request-target): ${method.toLowerCase()} ${path}`,
  `digest: ${digest}`,
  `v-c-merchant-id: ${merchantId}`,
].join("\n");

const sig = crypto
  .createHmac("sha256", Buffer.from(sharedSecret, "base64"))
  .update(signTarget)
  .digest("base64");

const signatureHeader = [
  `keyid="${apiKeyId}"`,
  `algorithm="HmacSHA256"`,
  `headers="host date (request-target) digest v-c-merchant-id"`,
  `signature="${sig}"`,
].join(", ");

const headers = {
  "Host":            new URL(baseUrl).host,
  "Date":            gmtDate,
  "Digest":          digest,
  "v-c-merchant-id": merchantId,
  "Signature":       signatureHeader,
  "Content-Type":    "application/json;charset=utf-8",
  "Accept":          "application/hal+json;charset=utf-8",
};

console.log(">>> POST", baseUrl + path);
console.log(">>> body:", JSON.stringify(body, null, 2));
console.log("");

try {
  const res = await fetch(baseUrl + path, { method, headers, body: serialised });
  const raw = await res.text();

  console.log("<<< STATUS :", res.status);
  console.log("<<< BODY (unmodified):");
  console.log(raw);
  console.log("");

  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (parsed) {
    console.log("<<< PARSED JSON:");
    console.log(JSON.stringify(parsed, null, 2));
  }
} catch (err) {
  console.error("Network error:", err.message);
  process.exit(1);
}

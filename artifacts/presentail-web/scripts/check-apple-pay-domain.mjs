#!/usr/bin/env node
// Verify that the Apple Pay merchant domain association file is reachable,
// looks like a valid Apple domain association blob, and contains a cert that
// has not expired.
//
// Usage: node check-apple-pay-domain.mjs <base-url-or-full-path>
//
// Accepts either:
//   - A base URL:  http://localhost:19234
//   - A full path: http://localhost:19234/.well-known/apple-developer-merchantid-domain-association
//
// Exits 0 on PASS, 1 on FAIL.

const WELL_KNOWN_PATH = "/.well-known/apple-developer-merchantid-domain-association";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: check-apple-pay-domain.mjs <base-url-or-full-path>");
  process.exit(1);
}

const url = arg.endsWith(WELL_KNOWN_PATH)
  ? arg
  : `${arg.replace(/\/$/, "")}${WELL_KNOWN_PATH}`;

console.log(`Checking Apple Pay domain association file: ${url}`);

let res;
try {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  res = await fetch(url, { signal: ctrl.signal });
  clearTimeout(timeout);
} catch (err) {
  console.error(`FAIL  Could not reach ${url}: ${err.message}`);
  process.exit(1);
}

if (res.status !== 200) {
  const preview = await res.text().catch(() => "");
  console.error(`FAIL  Expected HTTP 200 but got ${res.status} from ${url}`);
  if (preview) console.error(`      Response body: ${preview.slice(0, 200)}`);
  process.exit(1);
}

const body = await res.text();
const trimmed = body.trim();

if (!trimmed) {
  console.error(`FAIL  Response body is empty from ${url}`);
  process.exit(1);
}

// Common misconfiguration: the Stripe Payment Method Domain *ID* (e.g.
// `pmd_1Nba2XFiPsqrSFp8VOR2kZIp`) was pasted into
// STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION instead of the CONTENTS of the
// downloaded `apple-developer-merchantid-domain-association` file. The ID is a
// short `pmd_`-prefixed token; the real file is a long opaque blob. Catch this
// explicitly so the failure points at the actual mistake instead of a generic
// "too short" message.
if (/^pmd_[A-Za-z0-9]+$/.test(trimmed)) {
  console.error(
    `FAIL  Response body is a Stripe Payment Method Domain ID ('${trimmed}'), ` +
      `not the Apple Pay domain association file contents. ` +
      `Set STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION to the full contents of the file ` +
      `downloaded from Stripe Dashboard → Apple Pay → Domains → Download verification file.`,
  );
  process.exit(1);
}

if (trimmed.length < 100) {
  console.error(
    `FAIL  Response body is suspiciously short (${trimmed.length} chars) — ` +
      `expected a long Apple domain association blob. Body: ${trimmed}`,
  );
  process.exit(1);
}

if (trimmed.startsWith("<")) {
  console.error(
    `FAIL  Response body looks like HTML (starts with '<'), not an Apple domain association blob.\n` +
      `      Body preview: ${trimmed.slice(0, 200)}`,
  );
  process.exit(1);
}

const contentType = res.headers.get("content-type") ?? "";
if (contentType.toLowerCase().includes("text/html")) {
  console.error(
    `FAIL  Content-Type is '${contentType}', expected text/plain. ` +
      `The endpoint may be returning an error page.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Certificate expiry check
//
// The domain association file is a JSON object whose `signature` field is a
// lowercase hex-encoded DER PKCS#7 / CMS SignedData structure that contains
// one or more X.509 certificates. Each certificate's Validity SEQUENCE holds
// two consecutive UTCTime values: notBefore followed immediately by notAfter.
//
// ASN.1 UTCTime encoding: tag 0x17, length 0x0d (13 bytes), value YYMMDDHHMMSSZ.
// In hex these two fields appear as "170d<26-char-hex>170d<26-char-hex>" with
// the second value being the notAfter.
//
// We scan the full signature hex for all such consecutive pairs, parse the
// notAfter dates, and fail if any has already passed (leaf cert first, so the
// minimum notAfter is the binding expiry).
// ---------------------------------------------------------------------------

/**
 * Parse a 13-byte UTCTime value (hex, 26 chars) into a Date.
 * Format: YYMMDDHHMMSSZ  (RFC 5280 §4.1.2.5.1)
 * YY < 50 → 2000+YY; YY >= 50 → 1900+YY.
 * Throws if the hex does not decode to a valid YYMMDDHHMMSSZ string.
 * @param {string} hex 26-char lowercase hex
 * @returns {Date}
 */
function parseUTCTime(hex) {
  const str = Buffer.from(hex, "hex").toString("ascii");
  // Strict format check: exactly 12 digits followed by 'Z'
  if (!/^\d{12}Z$/.test(str)) {
    throw new Error(`UTCTime value "${str}" does not match YYMMDDHHMMSSZ format`);
  }
  const yy = parseInt(str.slice(0, 2), 10);
  const mm = parseInt(str.slice(2, 4), 10) - 1; // 0-based month
  const dd = parseInt(str.slice(4, 6), 10);
  const hh = parseInt(str.slice(6, 8), 10);
  const min = parseInt(str.slice(8, 10), 10);
  const ss = parseInt(str.slice(10, 12), 10);
  const year = yy >= 50 ? 1900 + yy : 2000 + yy;
  const date = new Date(Date.UTC(year, mm, dd, hh, min, ss));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`UTCTime value "${str}" produced an invalid Date`);
  }
  return date;
}

/**
 * Scan a lowercase hex DER blob for consecutive UTCTime pairs and return all
 * notAfter dates found.  Each pair "170d<26>170d<26>" in the hex corresponds
 * to a certificate Validity SEQUENCE (notBefore, notAfter).
 * @param {string} sigHex lowercase hex DER
 * @returns {Date[]}
 */
function extractNotAfterDates(sigHex) {
  const TAG_LEN = "170d"; // UTCTime (0x17) + length 13 (0x0d)
  const VALUE_HEX_LEN = 26; // 13 bytes * 2
  const ENTRY_LEN = TAG_LEN.length + VALUE_HEX_LEN; // 30 hex chars per UTCTime TLV

  const dates = [];
  let i = 0;
  while (i <= sigHex.length - ENTRY_LEN * 2) {
    if (sigHex.slice(i, i + 4) === TAG_LEN) {
      const nextStart = i + ENTRY_LEN;
      if (
        nextStart + ENTRY_LEN <= sigHex.length &&
        sigHex.slice(nextStart, nextStart + 4) === TAG_LEN
      ) {
        // Found a consecutive pair — second is notAfter
        const notAfterHex = sigHex.slice(nextStart + 4, nextStart + ENTRY_LEN);
        try {
          dates.push(parseUTCTime(notAfterHex));
        } catch {
          // malformed time — skip
        }
        i = nextStart + ENTRY_LEN;
        continue;
      }
    }
    i += 2;
  }
  return dates;
}

let certExpiryChecked = false;
try {
  const parsed = JSON.parse(trimmed);
  const sigHex =
    typeof parsed?.signature === "string" ? parsed.signature.toLowerCase() : "";

  if (sigHex.length > 0) {
    const notAfterDates = extractNotAfterDates(sigHex);

    if (notAfterDates.length > 0) {
      certExpiryChecked = true;
      const now = new Date();
      // The binding expiry is the earliest notAfter across all embedded certs
      // (the leaf cert always expires first).
      const earliestExpiry = notAfterDates.reduce((a, b) => (a < b ? a : b));

      if (earliestExpiry <= now) {
        const daysAgo = Math.ceil((now - earliestExpiry) / (1000 * 60 * 60 * 24));
        console.error(
          `FAIL  The Apple Pay domain association cert expired ${daysAgo} day(s) ago ` +
            `(notAfter: ${earliestExpiry.toISOString()}).\n` +
            `      Apple's servers will reject this cert and Apple Pay in the browser will not work.\n` +
            `      Fix: Stripe Dashboard → Settings → Payment methods → Apple Pay → Domains → ` +
            `presentail.com → Download verification file, then set the full file contents ` +
            `as the STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION Replit secret and republish.`,
        );
        process.exit(1);
      }

      const daysLeft = Math.floor(
        (earliestExpiry - now) / (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 30) {
        console.warn(
          `WARN  The Apple Pay domain association cert expires in ${daysLeft} day(s) ` +
            `(${earliestExpiry.toISOString()}). Renew it soon via Stripe Dashboard.`,
        );
      } else {
        console.log(
          `      Cert expiry: ${earliestExpiry.toISOString()} (${daysLeft} days from now)`,
        );
      }
    } else {
      console.log(
        "      Cert expiry: could not locate UTCTime pairs in signature DER — skipping expiry check",
      );
    }
  } else {
    console.log(
      "      Cert expiry: signature field missing or empty — skipping expiry check",
    );
  }
} catch {
  // Body is not JSON (unexpected format) — skip the cert expiry check but
  // do not fail; the format/length checks above already passed.
  console.log(
    "      Cert expiry: response is not JSON — skipping expiry check",
  );
}

console.log(
  `PASS  Apple Pay domain association file is present, non-empty (${trimmed.length} chars), ` +
    `content-type: ${contentType || "(not set)"}` +
    (certExpiryChecked ? ", cert not expired" : ""),
);
process.exit(0);

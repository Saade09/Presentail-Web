#!/usr/bin/env node
// Verify that the Apple Pay merchant domain association file is reachable and
// looks like a valid Apple domain association blob.
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

console.log(
  `PASS  Apple Pay domain association file is present, non-empty (${trimmed.length} chars), ` +
    `content-type: ${contentType || "(not set)"}`,
);
process.exit(0);

#!/usr/bin/env node
// Verify that the Apple Sign In domain verification file is reachable and
// looks like a valid Apple domain association blob.  Also checks that the
// domain's TLS certificate has not expired and sends a proactive Slack alert
// when it is within 30 days of expiry (Apple Sign In requires a valid TLS cert
// on the domain).
//
// Usage: node check-apple-sign-in-domain.mjs <base-url-or-full-path>
//
// Accepts either:
//   - A base URL:  http://localhost:19234
//   - A full path: http://localhost:19234/.well-known/apple-developer-domain-association
//
// Exits 0 on PASS, 1 on FAIL.

import https from "https";

const WELL_KNOWN_PATH = "/.well-known/apple-developer-domain-association";
const WARN_DAYS = 30;

/**
 * Send a Slack message via the incoming webhook URL in ALERTS_SLACK_WEBHOOK_URL.
 * No-ops silently when the env var is unset.
 * @param {string} text Slack message text (markdown supported)
 */
async function sendSlackAlert(text) {
  const webhookUrl = process.env.ALERTS_SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `WARN  Slack alert returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }
  } catch (err) {
    console.warn(`WARN  Could not send Slack alert: ${err.message}`);
  }
}

/**
 * Return the TLS certificate expiry date for the given hostname (port 443).
 * Resolves to null when the connection is not HTTPS or the cert is unavailable.
 * @param {string} hostname
 * @returns {Promise<Date | null>}
 */
function getTlsCertExpiry(hostname) {
  return new Promise((resolve) => {
    const req = https.request(
      { host: hostname, port: 443, method: "HEAD", path: "/", rejectUnauthorized: false, timeout: 15_000 },
      (res) => {
        try {
          const cert = res.socket.getPeerCertificate();
          if (!cert || !cert.valid_to) {
            resolve(null);
            return;
          }
          const expiry = new Date(cert.valid_to);
          resolve(Number.isNaN(expiry.getTime()) ? null : expiry);
        } catch {
          resolve(null);
        }
      },
    );
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
    req.end();
  });
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: check-apple-sign-in-domain.mjs <base-url-or-full-path>");
  process.exit(1);
}

const url = arg.endsWith(WELL_KNOWN_PATH)
  ? arg
  : `${arg.replace(/\/$/, "")}${WELL_KNOWN_PATH}`;

console.log(`Checking Apple Sign In domain verification file: ${url}`);

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

if (trimmed.length < 10) {
  console.error(
    `FAIL  Response body is suspiciously short (${trimmed.length} chars) — ` +
      `expected an Apple domain verification blob. Body: ${trimmed}`,
  );
  process.exit(1);
}

if (trimmed.startsWith("<")) {
  console.error(
    `FAIL  Response body looks like HTML (starts with '<'), not an Apple domain verification blob.\n` +
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
// TLS certificate expiry check
//
// Apple Sign In with Apple requires the domain's TLS certificate to be valid.
// We check the cert expiry here and send a proactive Slack alert when fewer
// than WARN_DAYS days remain so the team can renew before Apple rejects the
// domain verification.
// ---------------------------------------------------------------------------

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  parsedUrl = null;
}

if (parsedUrl && parsedUrl.protocol === "https:") {
  const hostname = parsedUrl.hostname;
  console.log(`      Checking TLS cert expiry for ${hostname}…`);

  const certExpiry = await getTlsCertExpiry(hostname);

  if (!certExpiry) {
    console.log(
      `      TLS cert expiry: could not retrieve peer certificate — skipping expiry check`,
    );
  } else {
    const now = new Date();

    if (certExpiry <= now) {
      const daysAgo = Math.ceil((now - certExpiry) / (1000 * 60 * 60 * 24));
      console.error(
        `FAIL  The TLS certificate for ${hostname} expired ${daysAgo} day(s) ago ` +
          `(notAfter: ${certExpiry.toISOString()}).\n` +
          `      Apple Sign In will reject the domain. Renew the certificate immediately.`,
      );
      process.exit(1);
    }

    const daysLeft = Math.floor((certExpiry - now) / (1000 * 60 * 60 * 24));

    if (daysLeft <= WARN_DAYS) {
      const warnMsg =
        `WARN  The TLS certificate for ${hostname} expires in ${daysLeft} day(s) ` +
        `(${certExpiry.toISOString()}). Renew it before it expires — Apple Sign In ` +
        `requires a valid TLS cert on the domain.`;
      console.warn(warnMsg);

      const slackText =
        `:warning: *Apple Sign In domain TLS cert expiring in ${daysLeft} day(s)* — action required before it expires on ${certExpiry.toUTCString()}.\n` +
        `\n` +
        `Apple Sign In requires a valid TLS certificate on \`${hostname}\`. Once expired, ` +
        `Apple's servers will reject the domain and Sign in with Apple will stop working.\n` +
        `\n` +
        `*Rotation steps:*\n` +
        `1. Renew the TLS certificate for \`${hostname}\` with your certificate authority or hosting provider.\n` +
        `2. If the cert is managed by Replit or your CDN (e.g. Cloudflare), verify auto-renewal is enabled and not blocked.\n` +
        `3. After renewal, re-verify domain ownership in Apple Developer Console: ` +
        `Certificates, Identifiers & Profiles → Identifiers → \`com.new.presentail\` → Sign In with Apple → Edit → Verify Domains.\n` +
        `4. Confirm the new cert is served by re-running the daily check workflow manually.\n` +
        `\n` +
        `_Cert notAfter: ${certExpiry.toISOString()} · days remaining: ${daysLeft}_`;
      await sendSlackAlert(slackText);
    } else {
      console.log(
        `      TLS cert expiry: ${certExpiry.toISOString()} (${daysLeft} days from now)`,
      );
    }
  }
} else {
  console.log(
    `      TLS cert expiry: skipped (URL is not HTTPS — ${url})`,
  );
}

console.log(
  `PASS  Apple Sign In domain verification file is present, non-empty (${trimmed.length} chars), ` +
    `content-type: ${contentType || "(not set)"}`,
);
process.exit(0);

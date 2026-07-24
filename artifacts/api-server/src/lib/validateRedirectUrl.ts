// Redirect URL validation for payment session creation endpoints.
//
// Payment providers redirect shoppers to caller-supplied URLs after checkout.
// Without validation, an attacker can create a real Presentail-hosted payment
// session whose success/cancel URL points to an arbitrary website — a credible
// phishing redirector that leverages a trusted provider (Stripe, Mamo, PayPal,
// Tabby) as a launchpad.
//
// Two URL kinds are validated here:
//
//   "web"            — Stripe success/cancel URLs. Must be HTTPS and hosted on
//                      an allowed Presentail domain (presentail.com, any Replit
//                      dev/preview domain from REPLIT_DOMAINS).
//
//   "payment-return" — Mamo/PayPal/Tabby return URLs. Must also be HTTPS and on
//                      an allowed host. Two callers use these routes:
//                        - Mobile sends /api/payment/return?deeplink=… so the
//                          bridge (which independently validates the
//                          presentail: scheme) can hand off to the app.
//                        - Web sends ordinary page URLs (e.g. /order-confirmed).
//                      Both are safe because the host allowlist already blocks
//                      the open-redirect attack; requiring the bridge path for
//                      web callers broke every web PayPal/Mamo/Tabby payment
//                      (July 2026 incident), so the path is NOT restricted.

const ALWAYS_ALLOWED_HOSTS = new Set(["presentail.com", "www.presentail.com"]);

let _cachedHosts: Set<string> | null = null;

function allowedHosts(): Set<string> {
  if (_cachedHosts) return _cachedHosts;
  const hosts = new Set(ALWAYS_ALLOWED_HOSTS);
  const replitDomains = process.env.REPLIT_DOMAINS ?? "";
  for (const d of replitDomains.split(",")) {
    const trimmed = d.trim();
    if (trimmed) hosts.add(trimmed);
  }
  _cachedHosts = hosts;
  return hosts;
}

type UrlKind = "web" | "payment-return";

/**
 * Validate a redirect URL before forwarding it to a payment provider.
 *
 * @param raw  - The raw URL string from the request body.
 * @param kind - "web" for Stripe success/cancel; "payment-return" for
 *               Mamo/PayPal/Tabby (any path on an allowed host — web pages and
 *               the /api/payment/return mobile bridge are both valid).
 * @returns null when valid, or a human-readable rejection reason on failure.
 */
export function validateRedirectUrl(raw: string, kind: UrlKind): string | null {
  if (!raw || typeof raw !== "string") {
    return "Redirect URL must be a non-empty string"; // i18n-ignore
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return `Invalid redirect URL: "${raw.slice(0, 100)}"`; // i18n-ignore
  }

  const isLocalhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (!isLocalhost && parsed.protocol !== "https:") {
    return "Redirect URL must use HTTPS"; // i18n-ignore
  }

  if (!isLocalhost && !allowedHosts().has(parsed.hostname)) {
    return `Redirect URL hostname "${parsed.hostname}" is not permitted`; // i18n-ignore
  }

  // "payment-return" and "web" share the same host/protocol rules. The
  // /api/payment/return bridge (used by mobile deep-link returns) validates
  // its own deeplink parameter, so no extra path restriction is needed here —
  // and web callers legitimately use ordinary page URLs like /order-confirmed.
  void kind;

  return null;
}

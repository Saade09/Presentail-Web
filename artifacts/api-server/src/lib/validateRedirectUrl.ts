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
//                      an allowed host, AND the path must start with
//                      /api/payment/return so the request is routed through our
//                      deep-link bridge — which independently validates the
//                      presentail: scheme before issuing any redirect.

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
 *               Mamo/PayPal/Tabby (must target the /api/payment/return bridge).
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

  if (kind === "payment-return") {
    if (!parsed.pathname.startsWith("/api/payment/return")) {
      return "Return URL must target the /api/payment/return bridge"; // i18n-ignore
    }
  }

  return null;
}

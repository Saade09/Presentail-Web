// Keep this policy at the web server boundary so production HTML and SPA
// fallback responses share the same Trustpilot permissions.
//
// Only the Trustpilot additions are owned by this task. The other existing
// script/frame sources are retained here because this server previously had
// no project-owned CSP header and adding a partial policy would block current
// authentication, payments, analytics, and careers surfaces.
export const STOREFRONT_CONTENT_SECURITY_POLICY = [
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.clarity.ms https://scripts.clarity.ms https://accounts.google.com https://appleid.cdn-apple.com https://widget.trustpilot.com https://js.stripe.com https://www.paypal.com https://*.paypal.com https://googleads.g.doubleclick.net https://www.googleadservices.com",
  "frame-src 'self' https://widget.trustpilot.com https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://www.paypal.com https://*.paypal.com https://accounts.google.com https://appleid.apple.com https://presentail.applytojob.com",
].join("; ");

export const STOREFRONT_SECURITY_HEADERS = {
  "content-security-policy": STOREFRONT_CONTENT_SECURITY_POLICY,
};
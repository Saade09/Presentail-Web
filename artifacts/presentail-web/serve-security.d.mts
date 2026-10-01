/**
 * Type declarations for the plain-ESM storefront security header module
 * (`serve-security.mjs`), run directly by Node from serve.mjs.
 */

/** Content-Security-Policy header value for storefront HTML responses. */
export const STOREFRONT_CONTENT_SECURITY_POLICY: string;

/** Security headers applied to storefront HTML responses. */
export const STOREFRONT_SECURITY_HEADERS: {
  "content-security-policy": string;
};

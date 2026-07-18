// Authoritative registry for discontinued product destinations.
//
// When a product slug is retired (product removed from the OS catalog OR marked
// status=discontinued), add an entry here so serve.mjs can:
//   - Issue a 301 to the replacement URL when the slug is requested.
//   - Fall back to 410 Gone when no entry exists.
//
// Key:   old product slug (as it appears in the URL: /en-lb/beirut/product/<slug>)
// Value: replacement product slug (serve.mjs builds the full locale-prefixed URL),
//        OR a full absolute URL for cross-domain redirects.
//
// Ops workflow: when Presentail OS marks a product discontinued or removes it,
// add its slug here and deploy. GSC 410s are processed in the normal recrawl
// cycle; 301s pass accumulated link equity to the replacement URL.
export const PRODUCT_REDIRECTS = {
  // CI/e2e fixture: "old-red-roses" was renamed to "rose-bouquet".
  // This entry is also exercised by product-lifecycle.spec.ts to verify
  // the 301 redirect path end-to-end.
  "old-red-roses": "rose-bouquet",

  // Add production entries here as products are retired. Example:
  //   "discontinued-slug": "replacement-slug",
  //   "old-name-product": "https://presentail.com/en-lb/beirut/category/flowers",
};

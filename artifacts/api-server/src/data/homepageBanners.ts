// Homepage banner data is now sourced live from Presentail OS via
// GET /api/storefront/homepage-banners in routes/homepage.ts.
// The in-memory store and static fallback array have been retired.

/**
 * No-op stub retained so that the OS webhook handler (routes/osWebhook.ts)
 * can still import this without a compilation error during the transition
 * period. The banner.updated webhook now triggers a data_refresh push
 * directly instead of updating this store.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setActiveBannersFromWebhook(_banners: unknown[]): boolean {
  return true;
}

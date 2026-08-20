#!/usr/bin/env node
/**
 * Cache-warm every active product's reusable social card.
 *
 * Usage:
 *   PUSH_ADMIN_TOKEN=... pnpm --filter @workspace/api-server run backfill:product-social -- https://api.example.com
 *
 * The job is safe to rerun: each request targets the version-aware renderer,
 * which returns its CDN-cacheable JPEG when it already exists in-process.
 */
const API_BASE = (process.argv[2] ?? process.env.API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const CONCURRENCY = 4;
const countries = ["LB", "AE", "CY"];

const summary = { discovered: 0, attempted: 0, succeeded: 0, failed: 0, failures: [] };
const products = new Map();

for (const countryCode of countries) {
  const response = await fetch(`${API_BASE}/api/woo/products?countryCode=${countryCode}`);
  if (!response.ok) throw new Error(`Catalog request failed for ${countryCode}: ${response.status}`);
  const body = await response.json();
  for (const product of Array.isArray(body.products) ? body.products : []) {
    if (typeof product?.id === "string" && product.inStock !== false) products.set(product.id, product);
  }
}

summary.discovered = products.size;
const queue = [...products.keys()];
async function worker() {
  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug) return;
    summary.attempted++;
    try {
      const response = await fetch(`${API_BASE}/api/og-image/product/${encodeURIComponent(slug)}?backfill=1`);
      if (!response.ok || !String(response.headers.get("content-type") ?? "").includes("image/jpeg")) {
        throw new Error(`HTTP ${response.status}`);
      }
      summary.succeeded++;
    } catch (error) {
      summary.failed++;
      summary.failures.push({ slug, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
console.log(JSON.stringify({ ...summary, concurrency: CONCURRENCY }, null, 2));
process.exitCode = summary.failed > 0 ? 1 : 0;
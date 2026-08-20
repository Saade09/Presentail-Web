import { getOsProducts } from "./osProductsCache";
import { logger } from "./logger";

const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;
const CONCURRENCY = 4;
let running = false;

/**
 * Warm active product cards after the catalog has populated. This runs on
 * deploy/startup and is deliberately idempotent: versioned card URLs and the
 * OG cache make repeats cheap while ensuring an existing catalog is backfilled
 * without a manual operator command.
 */
export async function warmActiveProductSocialCards(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const slugs = new Set<string>();
    for (const store of STORE_KEYS) {
      for (const product of getOsProducts(store) ?? []) {
        if (product.inStock !== false) slugs.add(product.id);
      }
    }
    const queue = [...slugs];
    const base = `http://127.0.0.1:${process.env.PORT ?? "8080"}`;
    let succeeded = 0;
    let failed = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const slug = queue.shift();
        if (!slug) return;
        try {
          const response = await fetch(`${base}/api/og-image/product/${encodeURIComponent(slug)}?backfill=1`);
          if (!response.ok || !String(response.headers.get("content-type") ?? "").includes("image/jpeg")) {
            throw new Error(`HTTP ${response.status}`);
          }
          succeeded++;
        } catch {
          failed++;
        }
      }
    }));
    logger.info(
      { discovered: slugs.size, succeeded, failed, concurrency: CONCURRENCY },
      "productSocialBackfill: startup catalog warm complete",
    );
  } finally {
    running = false;
  }
}
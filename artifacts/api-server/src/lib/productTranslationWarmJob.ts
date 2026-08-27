/**
 * productTranslationWarmJob — background pre-warmer for the AR/FR product
 * translation cache.
 *
 * Why: localized product pages (e.g. /fr-lb/beirut/product/...) translate
 * name + description on demand. On a cold cache, a crawler auditing hundreds
 * of pages forces hundreds of live OpenAI calls; any timeout/rate-limit falls
 * back to English while the page's hreflang still claims French — the exact
 * "hreflang/content language mismatch" Semrush flags. Pre-warming means
 * crawlers (and users) almost always hit the cache instead of a live call.
 *
 * Design:
 * - Runs shortly after startup (once the OS product cache has populated) and
 *   every 6 hours thereafter. The translation cache TTL is 7 days, so steady
 *   -state cycles are cheap no-ops that only fill new/expired entries.
 * - Warms sequentially; translateProductContent's internal concurrency gate
 *   (shared with live traffic) throttles the OpenAI call rate so a warm cycle
 *   never starves live requests.
 * - Lebanon first (the store with FR traffic flagged in the audit), then the
 *   remaining stores.
 */
import { logger } from "./logger";
import { getOsProducts } from "./osProductsCache";
import { runDistributedJob } from "./distributedJob";
import {
  translateProductContent,
  hasCachedProductTranslation,
  type TranslationLang,
} from "./productTranslation";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 90 * 1000; // let the OS product cache populate first
const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"];
const LANGS: TranslationLang[] = ["fr", "ar"];
// Greek is Cyprus-only on the storefront — warm el translations only for the
// Cyprus store to avoid paying OpenAI for translations no shopper can see.
const langsForStore = (storeKey: string): TranslationLang[] =>
  storeKey === "cyprus" ? [...LANGS, "el"] : LANGS;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

// Stop a cycle after this many consecutive translation failures — a sustained
// provider outage would otherwise keep a sequential cycle burning retries for
// hours. The next scheduled cycle picks up where this one left off.
const MAX_CONSECUTIVE_FAILURES = 10;

async function runWarmCycle(signal?: AbortSignal): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  let warmed = 0;
  let skipped = 0;
  let failed = 0;
  try {
    let consecutiveFailures = 0;
    const seen = new Set<string>();
    for (const storeKey of STORE_KEYS) {
      signal?.throwIfAborted();
      const products = getOsProducts(storeKey);
      if (!products || products.length === 0) continue;
      for (const p of products) {
        signal?.throwIfAborted();
        const id = p.osNumericId ?? p.id;
        if (id === undefined || id === null) continue;
        for (const lang of langsForStore(storeKey)) {
          signal?.throwIfAborted();
          const key = `${id}:${lang}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (hasCachedProductTranslation(id, lang)) {
            skipped++;
            continue;
          }
          const result = await translateProductContent(
            id,
            lang,
            p.name ?? "",
            p.description ?? "",
          );
          signal?.throwIfAborted();
          if (result.translated) {
            warmed++;
            consecutiveFailures = 0;
          } else {
            failed++;
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              logger.warn(
                { failed, warmed },
                "productTranslationWarmJob: aborting cycle after sustained failures", // i18n-ignore
              );
              return;
            }
          }
        }
      }
    }
  } catch (err) {
    throw err;
  } finally {
    running = false;
    logger.info(
      { warmed, skipped, failed, durationMs: Date.now() - started },
      "productTranslationWarmJob: cycle complete", // i18n-ignore
    );
  }
}

async function runScheduledWarmCycle(): Promise<void> {
  await runDistributedJob({
    jobName: "product-translation-warm",
    intervalMs: INTERVAL_MS,
    leaseMs: 2 * 60 * 60_000,
    task: (context) => runWarmCycle(context.signal),
  });
}

export function startProductTranslationWarmJob(): void {
  if (timer) return;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      try {
        await runScheduledWarmCycle();
      } catch (err) {
        logger.warn(
          { err: (err as Error)?.message },
          "productTranslationWarmJob: scheduled cycle failed", // i18n-ignore
        );
      } finally {
        schedule(INTERVAL_MS);
      }
    }, delay);
    timer.unref?.();
  };
  schedule(STARTUP_DELAY_MS);
  logger.info("productTranslationWarmJob: scheduled"); // i18n-ignore
}

export function stopProductTranslationWarmJob(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

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
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { getOsProducts } from "./osProductsCache";
import {
  translateProductContent,
  hasCachedProductTranslation,
  type TranslationLang,
} from "./productTranslation";

const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 90 * 1000; // let the OS product cache populate first
const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"];
const LANGS: TranslationLang[] = ["fr", "ar"];

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

// Advisory lock key: prevents two autoscale replicas from running a warm
// cycle simultaneously (translations are persisted in Postgres, so whichever
// replica warms first benefits all of them).
const ADVISORY_LOCK_KEY = 0x70726474; // "prdt"

// Stop a cycle after this many consecutive translation failures — a sustained
// provider outage would otherwise keep a sequential cycle burning retries for
// hours. The next scheduled cycle picks up where this one left off.
const MAX_CONSECUTIVE_FAILURES = 10;

async function runWarmCycle(): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  let warmed = 0;
  let skipped = 0;
  let failed = 0;
  let gotLock = false;
  try {
    try {
      const lockRes = await db.execute(
        sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`,
      );
      gotLock = (lockRes as unknown as { rows?: Array<{ locked: boolean }> }).rows?.[0]?.locked === true;
    } catch {
      // DB unavailable — proceed without the cross-replica guard rather than
      // never warming (the in-flight dedup still protects within-process).
      gotLock = true;
    }
    if (!gotLock) {
      logger.info("productTranslationWarmJob: another replica holds the lock — skipping cycle"); // i18n-ignore
      return;
    }
    let consecutiveFailures = 0;
    const seen = new Set<string>();
    for (const storeKey of STORE_KEYS) {
      const products = getOsProducts(storeKey);
      if (!products || products.length === 0) continue;
      for (const p of products) {
        const id = p.osNumericId ?? p.id;
        if (id === undefined || id === null) continue;
        for (const lang of LANGS) {
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
    logger.warn(
      { err: (err as Error)?.message },
      "productTranslationWarmJob: cycle error", // i18n-ignore
    );
  } finally {
    if (gotLock) {
      try {
        await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
      } catch {
        // Connection-level failure releases the lock automatically.
      }
    }
    running = false;
    logger.info(
      { warmed, skipped, failed, durationMs: Date.now() - started },
      "productTranslationWarmJob: cycle complete", // i18n-ignore
    );
  }
}

export function startProductTranslationWarmJob(): void {
  if (timer) return;
  const schedule = (delay: number) => {
    timer = setTimeout(async () => {
      await runWarmCycle();
      schedule(INTERVAL_MS);
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

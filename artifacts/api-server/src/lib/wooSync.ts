import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, pushTokensTable } from "@workspace/db";
import { logger } from "./logger";
import { resolveStore, type StoreKey, type WooStoreConfig } from "./wooStore";
import { sendExpoPush, type ExpoPushMessage } from "./expoPush";
import { reconcileCustomersForStore } from "./customerSync";
import { refreshHomepageBanners } from "../data/homepageBanners";
import {
  invalidateOsProductsCache,
  getOsProductHash,
  persistDailySnapshotIfNeeded,
} from "./osProductsCache";

// ── Configuration ──────────────────────────────────────────────────────────

const ENABLED = (() => {
  const v = (process.env.WOO_SYNC_ENABLED ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
})();

const PUSH_ON_CHANGE = (() => {
  const v = (process.env.WOO_SYNC_PUSH_ON_CHANGE ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const INTERVAL_MS = (() => {
  const raw = Number(process.env.WOO_SYNC_INTERVAL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return DEFAULT_INTERVAL_MS;
  return raw;
})();

// Cyprus is intentionally excluded: it has its own catalogue and no
// scheduled refresh requirement at this time.
type StoreSpec = {
  key: "LB" | "AE-DUBAI" | "AE-ABUDHABI";
  storeKey: StoreKey;
  countryCode: "LB" | "AE";
  resolve: () => WooStoreConfig;
};
const STORES: StoreSpec[] = [
  { key: "LB", storeKey: "lebanon", countryCode: "LB", resolve: () => resolveStore("LB", null) },
  { key: "AE-DUBAI", storeKey: "dubai", countryCode: "AE", resolve: () => resolveStore("AE", "ae-dubai") },
  {
    key: "AE-ABUDHABI",
    storeKey: "abudhabi",
    countryCode: "AE",
    resolve: () => resolveStore("AE", "ae-abu-dhabi"),
  },
];

// ── Module state ───────────────────────────────────────────────────────────

type Snapshot = {
  osProductHash: string;
};
const lastSnapshot = new Map<StoreSpec["key"], Snapshot>();
let timer: NodeJS.Timeout | null = null;
let running = false;

// ── Public API ─────────────────────────────────────────────────────────────

export type WooSyncOptions = {
  // When false, suppress silent pushes even if content changed (used for
  // the baseline run on startup).
  pushOnChange?: boolean;
};

export async function runWooSyncOnce(
  opts: WooSyncOptions = {},
): Promise<void> {
  if (running) {
    logger.info("wooSync: tick skipped (previous tick still running)");
    return;
  }
  running = true;
  const start = Date.now();
  const pushOnChange = opts.pushOnChange ?? PUSH_ON_CHANGE;

  try {
    // Banners are global; refresh once per tick. A change here triggers a
    // silent push to every store (LB + UAE).
    let bannersChanged = false;
    try {
      bannersChanged = await refreshHomepageBanners();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "wooSync: banners refresh crashed");
    }

    for (const spec of STORES) {
      const store = spec.resolve();
      await syncOneStore(spec, store, { bannersChanged, pushOnChange });
    }

    // Persist today's product prices to the DB once per UTC day so the
    // price-change baseline in the admin funnels dashboard survives restarts.
    try {
      await persistDailySnapshotIfNeeded();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "wooSync: persistDailySnapshot crashed");
    }

    logger.info(
      { durationMs: Date.now() - start, bannersChanged },
      "wooSync: tick complete",
    );
  } finally {
    running = false;
  }
}

export function startWooSyncWorker(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("wooSync: disabled (set WOO_SYNC_ENABLED=1 to enable)");
    return;
  }
  if (timer) return;

  // Baseline run shortly after startup, with pushes suppressed so we
  // don't spam every device on a cold boot. Subsequent ticks honor
  // WOO_SYNC_PUSH_ON_CHANGE.
  const baselineTimer = setTimeout(() => {
    runWooSyncOnce({ pushOnChange: false }).catch((err) => {
      logger.warn({ err: err?.message }, "wooSync: baseline run failed");
    });
  }, 30_000);
  baselineTimer.unref?.();

  timer = setInterval(() => {
    runWooSyncOnce().catch((err) => {
      logger.warn({ err: err?.message }, "wooSync: scheduled tick failed");
    });
  }, INTERVAL_MS);
  timer.unref?.();

  logger.info(
    { intervalMs: INTERVAL_MS, pushOnChange: PUSH_ON_CHANGE },
    "wooSync: worker started",
  );
}

export function stopWooSyncWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ── Per-store sync ─────────────────────────────────────────────────────────

async function syncOneStore(
  spec: StoreSpec,
  store: WooStoreConfig,
  ctx: { bannersChanged: boolean; pushOnChange: boolean },
): Promise<void> {
  const t0 = Date.now();
  let reconciledCustomers = 0;

  try {
    // Trigger an OS products cache refresh once per sync cycle (only for the
    // first store processed — invalidateOsProductsCache refetches all country
    // product lists in one pass, so calling it once is sufficient).
    if (spec.key === "LB") {
      try {
        invalidateOsProductsCache();
      } catch (err: any) {
        logger.warn(
          { err: err?.message },
          "wooSync: OS products cache invalidation failed",
        );
      }
    }

    // Customer reconciliation still requires WooCommerce credentials.
    if (store.consumerKey) {
      try {
        reconciledCustomers = await reconcileCustomersForStore(store);
      } catch (err: any) {
        logger.warn(
          { err: err?.message, storeKey: spec.key },
          "wooSync: reconcileCustomersForStore failed",
        );
      }
    }
  } catch (err: any) {
    logger.error(
      { err: err?.message, storeKey: spec.key },
      "wooSync: store sync crashed",
    );
    return;
  }

  // Use spec.storeKey ("lebanon"/"dubai"/"abudhabi") as the per-store OS
  // cache key so Dubai and Abu Dhabi product changes are detected separately.
  const osProductHash = getOsProductHash(spec.storeKey);
  const snapshot: Snapshot = { osProductHash };
  const prev = lastSnapshot.get(spec.key);
  const contentChanged = !!prev && prev.osProductHash !== snapshot.osProductHash;
  lastSnapshot.set(spec.key, snapshot);

  const shouldPush =
    ctx.pushOnChange && (contentChanged || ctx.bannersChanged);

  logger.info(
    {
      storeKey: spec.key,
      reconciledCustomers,
      contentChanged,
      bannersChanged: ctx.bannersChanged,
      durationMs: Date.now() - t0,
    },
    "wooSync: store synced",
  );

  if (shouldPush) {
    try {
      const sent = await sendDataRefreshPush(spec);
      logger.info(
        { storeKey: spec.key, sent },
        "wooSync: silent data_refresh push sent",
      );
    } catch (err: any) {
      logger.warn(
        { err: err?.message, storeKey: spec.key },
        "wooSync: silent push send failed",
      );
    }
  }
}

// ── Silent push fan-out ────────────────────────────────────────────────────

async function loadTokensForStore(
  spec: StoreSpec,
): Promise<{ token: string }[]> {
  // Tokens with no countryCode are treated as Lebanon (the default store
  // when the user hasn't selected a delivery location yet).
  if (spec.key === "LB") {
    return db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(
        or(
          isNull(pushTokensTable.countryCode),
          eq(sql`upper(${pushTokensTable.countryCode})`, "LB"),
        )!,
      );
  }
  if (spec.key === "AE-ABUDHABI") {
    return db
      .select({ token: pushTokensTable.token })
      .from(pushTokensTable)
      .where(
        and(
          eq(sql`upper(${pushTokensTable.countryCode})`, "AE"),
          eq(pushTokensTable.cityId, "ae-abu-dhabi"),
        )!,
      );
  }
  // AE-DUBAI: any AE token whose city is not Abu Dhabi (or is unset).
  return db
    .select({ token: pushTokensTable.token })
    .from(pushTokensTable)
    .where(
      and(
        eq(sql`upper(${pushTokensTable.countryCode})`, "AE"),
        or(
          isNull(pushTokensTable.cityId),
          ne(pushTokensTable.cityId, "ae-abu-dhabi"),
        )!,
      )!,
    );
}

async function sendDataRefreshPush(spec: StoreSpec): Promise<number> {
  const rows = await loadTokensForStore(spec);
  if (rows.length === 0) return 0;

  const messages: ExpoPushMessage[] = rows.map((r) => {
    const m: ExpoPushMessage & { _contentAvailable?: boolean } = {
      to: r.token,
      sound: null,
      priority: "high",
      // No title/body so iOS treats it as a silent content-available push;
      // Android delivers it via the data channel and the app invalidates
      // its caches in the foreground notification listener.
      data: {
        type: "data_refresh",
        scope: "homepage",
        store: spec.key,
        countryCode: spec.countryCode,
      },
      channelId: "default",
      _contentAvailable: true,
    };
    return m;
  });

  const result = await sendExpoPush(messages);
  if (result.invalidTokens.length > 0) {
    try {
      await db
        .delete(pushTokensTable)
        .where(inArray(pushTokensTable.token, result.invalidTokens));
    } catch (err: any) {
      logger.warn(
        { err: err?.message, count: result.invalidTokens.length },
        "wooSync: failed to prune invalid push tokens",
      );
    }
  }
  return result.sent;
}

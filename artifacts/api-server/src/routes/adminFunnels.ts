import { Router, type IRouter, type Request, type Response } from "express";
import {
  loadDailyPurchaseBuckets,
  type PurchaseDailyBucket,
} from "../lib/checkoutPurchaseFunnelMonitor";
import {
  loadDailyLoginBuckets,
  type LoginDailyBucket,
} from "../lib/checkoutLoginFunnelMonitor";
import {
  loadDailySocialFailureBuckets,
  summariseDailyBuckets,
  type SocialFailureBucket,
  type SocialFailureDailyBucket,
} from "../lib/socialAuthFailureAggregator";
import {
  loadDailySuggestedMessageBuckets,
  summariseSuggestedMessageBuckets,
  type SuggestedMessageDailyBucket,
  type SuggestedMessageSummaryBucket,
} from "../lib/suggestedMessagesAggregator";
import {
  loadDailyUpsellTabBuckets,
  summariseUpsellTabBuckets,
  loadDailyUpsellItemBuckets,
  summariseUpsellItemBuckets,
  loadDailyUpsellCheckoutBuckets,
  summariseUpsellCheckoutBuckets,
  loadDailyOrdersByPlatform,
  buildUpsellToOrderDaily,
  summariseUpsellToOrder,
  buildUpsellToOrderBySession,
  type UpsellTabDailyBucket,
  type UpsellTabSummaryBucket,
  type UpsellItemDailyBucket,
  type UpsellItemSummaryBucket,
  type UpsellCheckoutDailyBucket,
  type UpsellCheckoutSummaryBucket,
  type UpsellToOrderBySessionBucket,
} from "../lib/upsellAggregator";
import {
  loadDailySessionCoverage,
  loadDailyFunnelSessionCoverage,
  type SessionCoverageDailyBucket,
  type FunnelSessionCoverageDailyBucket,
} from "../lib/sessionCoverageMonitor";
import { ITEM_ADD_RATE_MIN } from "../lib/upsellFunnelMonitor";
import { getOsProducts, getStartupPriceSnapshot } from "../lib/osProductsCache";
import { getRates, roundForCurrency, CURRENCY_DECIMALS, type SupportedCurrency } from "../lib/fx";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admin-only checkout funnel dashboard. Reuses the exact aggregators that
// the alerting monitors use (`aggregateBuckets` in the purchase + login
// funnel monitors), so the numbers shown here can never drift away from
// the values the Slack alerts evaluate.
//
// Auth: same `x-push-admin-token` header as the other admin endpoints
// (PUSH_ADMIN_TOKEN env). No session, no cookie — operators paste the
// token in a tiny prompt that the HTML page below stores in localStorage.
//
// Endpoints:
//   GET /api/admin/funnels              → tiny HTML viewer
//   GET /api/admin/funnels/data?days=N  → JSON: { days, purchase[], login[] }

const MAX_DAYS = 30;
const DEFAULT_DAYS = 14;

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" });
    return false;
  }
  return true;
}

function parseDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(Math.floor(n), MAX_DAYS);
}

function dayWindow(now: Date, days: number): { start: Date; end: Date } {
  // End is the start of *today* UTC (exclusive); start is `days` full UTC
  // days before that. This matches the monitors' "previous full UTC day"
  // semantics so the most recent row in the dashboard aligns with the
  // most recent row the alerter evaluated.
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

router.get("/admin/funnels/data", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const days = parseDays(req.query.days);
  const { start, end } = dayWindow(new Date(), days);

  // Upsell queries fetch an extra 7 days before the display window so the
  // frontend can compute week-over-week deltas without a second request.
  const upsellPriorStart = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      purchase,
      login,
      socialFailuresDaily,
      suggestedMessagesDaily,
      upsellTabsDaily,
      upsellItemsDaily,
      upsellCheckoutDaily,
      upsellOrdersDaily,
      upsellSessionConversion,
      upsellSessionCoverageDaily,
      funnelSessionCoverageDaily,
    ] = await Promise.all([
      loadDailyPurchaseBuckets(start, end),
      loadDailyLoginBuckets(start, end),
      loadDailySocialFailureBuckets(start, end),
      loadDailySuggestedMessageBuckets(start, end),
      loadDailyUpsellTabBuckets(upsellPriorStart, end),
      loadDailyUpsellItemBuckets(upsellPriorStart, end),
      loadDailyUpsellCheckoutBuckets(upsellPriorStart, end),
      loadDailyOrdersByPlatform(start, end),
      buildUpsellToOrderBySession(start, end),
      loadDailySessionCoverage(start, end),
      loadDailyFunnelSessionCoverage(start, end),
    ]);
    res.json({
      days,
      rangeStartUtc: start.toISOString(),
      rangeEndUtc: end.toISOString(),
      // Item-add rate threshold used by the upsell funnel monitor. Expressed as
      // a percentage (e.g. 10 for 10%) so the dashboard can highlight digest
      // rows that breach the same threshold without duplicating the config.
      upsellItemAddRateMinPct: Math.round(ITEM_ADD_RATE_MIN * 1000) / 10,
      purchase: purchase.map(toPurchaseRow),
      login: login.map(toLoginRow),
      socialFailures: {
        // Per-(platform, provider) totals for the whole window, with the
        // top error codes attached. Driven off the daily rows so the two
        // views can never disagree.
        summary: summariseDailyBuckets(socialFailuresDaily).map(
          toSocialFailureSummaryRow,
        ),
        daily: socialFailuresDaily.map(toSocialFailureDailyRow),
      },
      suggestedMessages: {
        // Per-(platform, category) totals across the whole window plus the
        // per-day breakdown. Both derive from the same daily rows so the
        // summary table and any per-day view never disagree.
        summary: summariseSuggestedMessageBuckets(suggestedMessagesDaily).map(
          toSuggestedMessageSummaryRow,
        ),
        daily: suggestedMessagesDaily.map(toSuggestedMessageDailyRow),
      },
      upsell: {
        // Per-(platform, tab) click counts and per-(platform, tab, product)
        // add counts for the upsell modal, plus a daily "proceeded to
        // checkout" series. All three derive from their respective daily
        // rows so summary and detail can never disagree.
        //
        // Rate computation: tab click totals act as the denominator for
        // add-rate. A "tab add rate" = total product adds on that tab /
        // tab clicks (i.e. how often a shopper who opened a tab also added
        // something). A "product add rate" = adds for that product / tab
        // clicks on the same tab (how well a specific product converts
        // within the tab). Both rates are computed here at the route layer
        // so the aggregator stays query-only and the HTML just renders
        // what the API sends.
        ...await buildUpsellPayload(
          upsellTabsDaily,
          upsellItemsDaily,
          upsellCheckoutDaily,
          upsellOrdersDaily,
          upsellSessionConversion,
          upsellSessionCoverageDaily,
          start.toISOString().slice(0, 10),
        ),
      },
      funnelSessionCoverage: {
        // Per-(eventName, day, platform) session_id coverage for high-value
        // funnel event types: cart_viewed, checkout_started, order_placed.
        // A drop in coverage means a client build stopped sending session_id
        // on that event type, silently degrading funnel attribution accuracy.
        // The sessionCoverageMonitor fires a per-event-type Slack alert when
        // aggregate day coverage drops below the configured threshold.
        daily: funnelSessionCoverageDaily.map((b: FunnelSessionCoverageDailyBucket) => ({
          eventName: b.eventName,
          day: b.day,
          platform: b.platform,
          total: b.total,
          withSessionId: b.withSessionId,
          coveragePct: b.coveragePct,
        })),
      },
    });
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "adminFunnels: data load failed",
    );
    res.status(500).json({ ok: false, message: "Failed to load funnels" });
  }
});

router.get("/admin/funnels", (_req, res) => {
  // No auth on the page itself; the JSON endpoint enforces the token. The
  // page just renders an empty shell until the operator pastes the token.
  res
    .type("html")
    .send(DASHBOARD_HTML);
});

// ── Row shaping ────────────────────────────────────────────────────────────

function pct(num: number, denom: number): number | null {
  if (!denom) return null;
  return Math.round((num / denom) * 1000) / 10;
}

function toPurchaseRow(b: PurchaseDailyBucket) {
  return {
    day: b.day,
    platform: b.platform,
    cartViewed: b.cartViewed,
    checkoutStarted: b.checkoutStarted,
    paymentMethodSelected: b.paymentMethodSelected,
    orderPlaced: b.orderPlaced,
    cartToCheckoutPct: pct(b.checkoutStarted, b.cartViewed),
    checkoutToPaymentPct: pct(b.paymentMethodSelected, b.checkoutStarted),
    paymentToOrderPct: pct(b.orderPlaced, b.paymentMethodSelected),
    cartToOrderPct: pct(b.orderPlaced, b.cartViewed),
    // Absolute USD revenue from the matching app_orders rows. Rounded to a
    // whole dollar in the wire payload — pennies don't matter at the
    // per-day per-platform level the dashboard surfaces.
    revenueUsd: Math.round(b.revenueUsd ?? 0),
  };
}

function toSocialFailureSummaryRow(b: SocialFailureBucket) {
  return {
    platform: b.platform,
    provider: b.provider,
    total: b.total,
    topErrorCodes: b.errorCodes.map((c) => ({
      errorCode: c.errorCode,
      count: c.count,
    })),
  };
}

function toSocialFailureDailyRow(b: SocialFailureDailyBucket) {
  return {
    day: b.day,
    platform: b.platform,
    provider: b.provider,
    total: b.total,
    topErrorCodes: b.errorCodes.slice(0, 5).map((c) => ({
      errorCode: c.errorCode,
      count: c.count,
    })),
  };
}

function toSuggestedMessageSummaryRow(b: SuggestedMessageSummaryBucket) {
  return {
    platform: b.platform,
    category: b.category,
    count: b.count,
  };
}

function toSuggestedMessageDailyRow(b: SuggestedMessageDailyBucket) {
  return {
    day: b.day,
    platform: b.platform,
    category: b.category,
    count: b.count,
  };
}

function toLoginRow(b: LoginDailyBucket) {
  return {
    day: b.day,
    platform: b.platform,
    surface: b.surface,
    viewed: b.viewed,
    signin: b.signin,
    guest: b.guest,
    dismissed: b.dismissed,
    other: b.other,
    signinPct: pct(b.signin, b.viewed),
    guestPct: pct(b.guest, b.viewed),
    dismissedPct: pct(b.dismissed, b.viewed),
  };
}

// ── Upsell row shaping ──────────────────────────────────────────────────────
//
// `buildUpsellPayload` is the main entry point. It takes the three daily
// bucket arrays and returns the full `upsell` JSON payload including computed
// conversion rates so callers can determine which tabs and products "convert
// best" without doing the arithmetic themselves.
//
// Denominators: tab clicks per (platform, tab) are used as the denominator
// for both tab-level and product-level add rates. This is the most meaningful
// signal — it answers "of shoppers who explored this tab, how many actually
// added something?"

// Display currency for each store. Lebanon prices are shown in LBP (the local
// currency shoppers see quoted), UAE stores in AED, and Cyprus in EUR.
const STORE_CURRENCY: Record<string, string> = {
  lebanon: "LBP",
  dubai: "AED",
  abudhabi: "AED",
  cyprus: "EUR",
};

type StorePriceEntry = { currency: string; priceLocal: number; decimals: number };
type ProductInfo = {
  productName: string;
  priceUsd: number | null;
  /** Per-store local-currency prices keyed by store key (lebanon/dubai/abudhabi/cyprus). */
  prices: Partial<Record<string, StorePriceEntry>>;
  /**
   * True when the product's current price in the OS cache differs from the
   * price recorded at server startup (the ~24 h baseline). False when the
   * price is unchanged, when the product was absent from the startup snapshot,
   * or when there is no current price.
   */
  priceChangedSinceStartup: boolean;
};

/**
 * Build a slug → { productName, priceUsd, prices, priceChangedSinceStartup }
 * lookup map from all in-memory OS product store caches. Each store
 * contributes its own price entry (converted to the store's display currency
 * using the supplied FX rates). First-occurrence wins for productName and
 * priceUsd (USD base price). `prices` is keyed by store key and populated for
 * every store that carries the product. Returns an empty map when the OS cache
 * is cold.
 *
 * `priceChangedSinceStartup` is true when the current priceUsd differs from
 * the startup price snapshot recorded when the server first populated the
 * cache. Products absent from the snapshot (or with no current price) get
 * false to avoid spurious warnings.
 */
function buildProductNameMap(
  rates: Record<string, number>,
): Map<string, ProductInfo> {
  const map = new Map<string, ProductInfo>();
  const snapshot = getStartupPriceSnapshot();
  const storeKeys = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;
  for (const storeKey of storeKeys) {
    const products = getOsProducts(storeKey);
    if (!products) continue;
    const currency = STORE_CURRENCY[storeKey] ?? "USD";
    const rate = rates[currency] ?? 1;
    for (const p of products) {
      const priceUsd = typeof p.price === "number" ? p.price : null;
      if (!map.has(p.id)) {
        const snapshotPrice = snapshot.get(p.id);
        const priceChangedSinceStartup =
          priceUsd !== null &&
          snapshotPrice !== undefined &&
          priceUsd !== snapshotPrice;
        map.set(p.id, {
          productName: p.name,
          priceUsd,
          priceChangedSinceStartup,
          prices: {},
        });
      }
      const entry = map.get(p.id)!;
      if (priceUsd !== null) {
        const decimals = CURRENCY_DECIMALS[currency as SupportedCurrency] ?? 2;
        entry.prices[storeKey] = {
          currency,
          priceLocal: roundForCurrency(priceUsd * rate, currency as SupportedCurrency),
          decimals,
        };
      }
    }
  }
  return map;
}

async function buildUpsellPayload(
  tabsDaily: UpsellTabDailyBucket[],
  itemsDaily: UpsellItemDailyBucket[],
  checkoutDaily: UpsellCheckoutDailyBucket[],
  ordersDaily: Awaited<ReturnType<typeof loadDailyOrdersByPlatform>>,
  sessionConversion: UpsellToOrderBySessionBucket[],
  sessionCoverageDaily: SessionCoverageDailyBucket[],
  // YYYY-MM-DD of the display window start. The three daily arrays above may
  // include up to 7 extra prior-week days for WoW computation in the digest.
  // All summary/platform/conversion computations must be restricted to the
  // display window so "window" totals remain accurate.
  displayWindowStart: string,
) {
  const rateCache = await getRates();
  const productNameMap = buildProductNameMap(rateCache.rates as Record<string, number>);

  // Summary computations use only rows inside the display window so that
  // summary tables labeled "(window)" never include the extra WoW history days.
  const tabsDailyInWindow = tabsDaily.filter((r) => r.day >= displayWindowStart);
  const itemsDailyInWindow = itemsDaily.filter((r) => r.day >= displayWindowStart);
  const checkoutDailyInWindow = checkoutDaily.filter((r) => r.day >= displayWindowStart);

  const tabSummary = summariseUpsellTabBuckets(tabsDailyInWindow);
  const itemSummary = summariseUpsellItemBuckets(itemsDailyInWindow);
  const checkoutSummary = summariseUpsellCheckoutBuckets(checkoutDailyInWindow);

  // Build a fast lookup: "platform::tab" → total clicks
  const tabClickMap = new Map<string, number>();
  for (const t of tabSummary) {
    tabClickMap.set(`${t.platform}::${t.tab}`, t.clicks);
  }

  // ── Per-platform upsell funnel summary ──────────────────────────────────
  // Aggregate tab clicks, item adds, and checkout-proceeded totals per
  // platform so the dashboard can compare web vs. iOS vs. Android at a
  // glance (conversion = item adds / tab clicks; checkout rate = checkout
  // proceeded / tab clicks).
  const platformTotals = new Map<
    string,
    { tabClicks: number; itemAdds: number; checkoutProceeded: number }
  >();
  const ensurePlatform = (p: string) => {
    if (!platformTotals.has(p))
      platformTotals.set(p, { tabClicks: 0, itemAdds: 0, checkoutProceeded: 0 });
    return platformTotals.get(p)!;
  };
  for (const t of tabSummary) ensurePlatform(t.platform).tabClicks += t.clicks;
  for (const it of itemSummary) ensurePlatform(it.platform).itemAdds += it.adds;
  for (const c of checkoutSummary) ensurePlatform(c.platform).checkoutProceeded += c.count;
  const platformSummary = Array.from(platformTotals.entries())
    .map(([platform, totals]) => ({
      platform,
      tabClicks: totals.tabClicks,
      itemAdds: totals.itemAdds,
      checkoutProceeded: totals.checkoutProceeded,
      addRatePct: pct(totals.itemAdds, totals.tabClicks),
      checkoutRatePct: pct(totals.checkoutProceeded, totals.tabClicks),
    }))
    .sort((a, b) => a.platform.localeCompare(b.platform));

  // Per-product add rate = product adds / tab clicks for that (platform, tab)
  // Sorted best-converting first; products on tabs with no recorded clicks get
  // null addRatePct (edge case: add event arrived before or without a tab click).
  // productName, priceUsd, and storePrices are resolved from the OS product
  // cache (one pass above); fall back to null when the product has aged out.
  const itemSummaryWithRate = itemSummary
    .map((b) => {
      const tabClicks = tabClickMap.get(`${b.platform}::${b.tab}`) ?? 0;
      const info = productNameMap.get(b.productId) ?? null;
      return {
        platform: b.platform,
        tab: b.tab,
        productId: b.productId,
        productName: info?.productName ?? null,
        priceUsd: info?.priceUsd ?? null,
        prices: info?.prices ?? {},
        priceChanged: info?.priceChangedSinceStartup ?? false,
        adds: b.adds,
        addRatePct: pct(b.adds, tabClicks),
      };
    })
    .sort((a, b) => {
      // Null rates sort last; otherwise descending rate, then descending adds
      if (a.addRatePct == null && b.addRatePct == null) return 0;
      if (a.addRatePct == null) return 1;
      if (b.addRatePct == null) return -1;
      if (b.addRatePct !== a.addRatePct) return b.addRatePct - a.addRatePct;
      return b.adds - a.adds;
    });

  // Per-tab: total adds across all products on that tab + tab add rate
  const tabAddsMap = new Map<string, number>();
  for (const b of itemSummary) {
    const key = `${b.platform}::${b.tab}`;
    tabAddsMap.set(key, (tabAddsMap.get(key) ?? 0) + b.adds);
  }

  const tabSummaryWithRate = tabSummary
    .map((b) => {
      const totalAdds = tabAddsMap.get(`${b.platform}::${b.tab}`) ?? 0;
      return {
        platform: b.platform,
        tab: b.tab,
        clicks: b.clicks,
        totalAdds,
        addRatePct: pct(totalAdds, b.clicks),
      };
    })
    .sort((a, b) => {
      if (a.addRatePct == null && b.addRatePct == null) return 0;
      if (a.addRatePct == null) return 1;
      if (b.addRatePct == null) return -1;
      return b.addRatePct - a.addRatePct;
    });

  // ── Upsell-to-order conversion (day-level co-occurrence) ────────────────
  // Join item-add rows with order counts on the same (platform, day). This is
  // a co-occurrence metric — it correlates upsell adds with order_placed on
  // the same day/platform but cannot confirm the same session placed the order.
  // See upsellAggregator.ts for the full methodology note.
  const conversionDaily = buildUpsellToOrderDaily(itemsDailyInWindow, ordersDaily);
  const conversionSummaryRaw = summariseUpsellToOrder(conversionDaily).map((b) => {
    const info = productNameMap.get(b.productId) ?? null;
    const priceUsd = info?.priceUsd ?? null;
    const estUpsellRevenueUsd =
      priceUsd != null ? Math.round(b.totalUpsellAdds * priceUsd) : null;
    return {
      platform: b.platform,
      productId: b.productId,
      productName: info?.productName ?? null,
      priceUsd,
      prices: info?.prices ?? {},
      priceChanged: info?.priceChangedSinceStartup ?? false,
      totalUpsellAdds: b.totalUpsellAdds,
      daysWithAdds: b.daysWithAdds,
      daysWithAddsAndOrders: b.daysWithAddsAndOrders,
      ordersOnAddDays: b.ordersOnAddDays,
      orderDayRatePct: b.orderDayRatePct,
      estUpsellRevenueUsd,
    };
  });

  // Sort by estimated revenue descending (nulls last), then by total adds
  const conversionSummary = conversionSummaryRaw.slice().sort((a, b) => {
    if (a.estUpsellRevenueUsd == null && b.estUpsellRevenueUsd == null) return b.totalUpsellAdds - a.totalUpsellAdds;
    if (a.estUpsellRevenueUsd == null) return 1;
    if (b.estUpsellRevenueUsd == null) return -1;
    if (b.estUpsellRevenueUsd !== a.estUpsellRevenueUsd) return b.estUpsellRevenueUsd - a.estUpsellRevenueUsd;
    return b.totalUpsellAdds - a.totalUpsellAdds;
  });

  // Per-platform revenue subtotals (sum only rows with a computable price)
  const platformRevenueMap = new Map<string, number>();
  for (const r of conversionSummary) {
    if (r.estUpsellRevenueUsd != null) {
      platformRevenueMap.set(
        r.platform,
        (platformRevenueMap.get(r.platform) ?? 0) + r.estUpsellRevenueUsd,
      );
    }
  }
  const conversionPlatformTotals = Array.from(platformRevenueMap.entries())
    .map(([platform, totalEstRevenueUsd]) => ({ platform, totalEstRevenueUsd }))
    .sort((a, b) => b.totalEstRevenueUsd - a.totalEstRevenueUsd);

  // ── Upsell-to-order conversion (session-level attribution) ───────────────
  // Only events from clients that send a session_id are counted. A session is
  // "converted" when the same session_id appears in both an upsell_item_added
  // event for this product AND an order_placed event in the same window.
  // Events with NULL session_id (clients predating the field) are excluded.
  const sessionConversionSummary = sessionConversion.map((b) => {
    const info = productNameMap.get(b.productId) ?? null;
    return {
      platform: b.platform,
      productId: b.productId,
      productName: info?.productName ?? null,
      priceUsd: info?.priceUsd ?? null,
      prices: info?.prices ?? {},
      priceChanged: info?.priceChangedSinceStartup ?? false,
      sessionsWithAdd: b.sessionsWithAdd,
      sessionsConverted: b.sessionsConverted,
      sessionConversionRatePct: b.sessionConversionRatePct,
    };
  });


  return {
    platformSummary,
    tabClicks: {
      summary: tabSummaryWithRate,
      // daily is restricted to the display window so per-day breakdown
      // tables always show exactly the requested N days.
      daily: tabsDailyInWindow.map((b) => ({
        day: b.day,
        platform: b.platform,
        tab: b.tab,
        clicks: b.clicks,
      })),
    },
    itemAdds: {
      summary: itemSummaryWithRate,
      daily: itemsDailyInWindow.map((b) => {
        const info = productNameMap.get(b.productId) ?? null;
        return {
          day: b.day,
          platform: b.platform,
          tab: b.tab,
          productId: b.productId,
          productName: info?.productName ?? null,
          priceUsd: info?.priceUsd ?? null,
          prices: info?.prices ?? {},
          adds: b.adds,
        };
      }),
    },
    checkoutProceeded: {
      summary: checkoutSummary.map((b) => ({
        platform: b.platform,
        count: b.count,
      })),
      daily: checkoutDailyInWindow.map((b) => ({
        day: b.day,
        platform: b.platform,
        count: b.count,
      })),
    },
    // digestWoW contains the wider daily arrays (display window + 7 prior days)
    // used exclusively by the digest renderer for week-over-week lookups.
    // No other section should consume these arrays.
    digestWoW: {
      tabClicksDaily: tabsDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        tab: b.tab,
        clicks: b.clicks,
      })),
      itemAddsDaily: itemsDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        adds: b.adds,
      })),
      checkoutProceededDaily: checkoutDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        count: b.count,
      })),
    },
    conversion: {
      // Per-(platform, productId) upsell add-to-order co-occurrence report.
      // summary rows are sorted by estimated upsell revenue (totalUpsellAdds ×
      // priceUsd) descending so the top rows reveal which add-ons generate the
      // most incremental revenue, not just the most adds. Rows without a price
      // in the OS cache (estUpsellRevenueUsd = null) sort last.
      // platformTotals gives a per-platform revenue subtotal for the window.
      // daily rows include estUpsellRevenueUsd (upsellAdds × priceUsd) so the
      // dashboard can plot a per-day revenue trend per product.
      summary: conversionSummary,
      platformTotals: conversionPlatformTotals,
      daily: conversionDaily.map((b) => {
        const info = productNameMap.get(b.productId) ?? null;
        const priceUsd = info?.priceUsd ?? null;
        return {
          day: b.day,
          platform: b.platform,
          productId: b.productId,
          productName: info?.productName ?? null,
          priceUsd,
          prices: info?.prices ?? {},
          upsellAdds: b.upsellAdds,
          ordersOnSameDay: b.ordersOnSameDay,
          estUpsellRevenueUsd: priceUsd != null ? Math.round(b.upsellAdds * priceUsd) : null,
        };
      }),
    },
    sessionConversion: {
      // Per-(platform, productId) session-level upsell → order attribution.
      // Only events from updated clients (those that supply a session_id) are
      // counted. Rows sorted by session conversion rate descending so the most
      // effectively converting add-ons appear first.
      summary: sessionConversionSummary,
    },
    sessionCoverage: {
      // What % of upsell_item_added events carry a non-null session_id per
      // (day, platform). A drop in coverage means a client build stopped
      // sending the field, degrading session-level conversion accuracy.
      // The monitor fires a Slack alert when the aggregate day rate drops below
      // UPSELL_SESSION_COVERAGE_MIN_RATE (default 80%).
      daily: sessionCoverageDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        total: b.total,
        withSessionId: b.withSessionId,
        coveragePct: b.coveragePct,
      })),
    },
  };
}

// ── HTML dashboard ─────────────────────────────────────────────────────────

const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Checkout Funnels — Admin</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.4 -apple-system, system-ui, Segoe UI, sans-serif; margin: 24px; max-width: 1100px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 8px; }
  .sub { color: #666; margin-bottom: 16px; font-size: 12px; }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .controls input, .controls select, .controls button { font: inherit; padding: 4px 8px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { padding: 4px 8px; text-align: right; border-bottom: 1px solid #ddd; }
  th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
  thead th { background: rgba(127,127,127,0.1); position: sticky; top: 0; }
  tbody tr:hover { background: rgba(127,127,127,0.06); }
  .muted { color: #888; }
  .err { color: #b00020; }
  .pct { font-weight: 500; }
  .low { color: #b00020; }
  .price-warn { color: #b06000; font-size: 12px; cursor: default; vertical-align: middle; margin-left: 3px; }
  .trends { display: flex; gap: 12px; flex-wrap: wrap; margin: 4px 0 12px; }
  .trend { flex: 1 1 160px; min-width: 140px; }
  .trend-title { font-size: 11px; color: #666; margin-bottom: 2px; }
  .trend svg { display: block; width: 100%; height: 44px; background: rgba(127,127,127,0.04); border-radius: 4px; }
  .legend { font-size: 11px; color: #666; margin: 4px 0 6px; display: flex; flex-wrap: wrap; gap: 10px; }
  .legend .swatch { display: inline-block; width: 12px; height: 2px; vertical-align: middle; margin-right: 4px; }
  .wow-up { color: #109618; font-weight: 500; }
  .wow-down { color: #b00020; font-weight: 500; }
  .wow-new { color: #109618; font-weight: 500; }
  tr.add-rate-low { background: rgba(176, 0, 32, 0.08); }
  tr.add-rate-low:hover { background: rgba(176, 0, 32, 0.14); }
  #coverageAlertBanner { display: none; position: sticky; top: 0; z-index: 100; background: #b00020; color: #fff; padding: 10px 16px; border-radius: 4px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
  #coverageAlertBanner .banner-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
  #coverageAlertBanner .banner-items { margin: 4px 0 6px; padding-left: 16px; }
  #coverageAlertBanner .banner-items li { margin: 2px 0; font-size: 13px; }
  #coverageAlertBanner a.banner-link { color: #ffe0e0; font-size: 12px; text-decoration: underline; cursor: pointer; }
</style>
</head>
<body>
  <h1>Checkout Funnels</h1>
  <div class="sub">Per-day, per-platform conversion. Numbers come from the same aggregator the Slack alerts use, so this view never disagrees with the alert thresholds.</div>

  <div id="coverageAlertBanner" role="alert" aria-live="polite"></div>

  <div class="controls">
    <label>Days <input id="days" type="number" min="1" max="${MAX_DAYS}" value="${DEFAULT_DAYS}" style="width:64px"></label>
    <label>Admin token <input id="token" type="password" placeholder="x-push-admin-token" style="width:240px"></label>
    <button id="refresh">Load</button>
    <span id="status" class="muted"></span>
  </div>

  <h2>Purchase funnel</h2>
  <div class="sub">cart_viewed → checkout_started → payment_method_selected → order_placed. Revenue is summed from confirmed app_orders in USD (the canonical wire currency); pre-rollout rows show as $0.</div>
  <div id="purchaseLegend" class="legend"></div>
  <div id="purchaseTrends" class="trends"></div>
  <table id="purchase">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th>
        <th>Cart</th><th>Checkout</th><th>Payment</th><th>Orders</th>
        <th>Revenue (USD)</th>
        <th>Cart→Co</th><th>Co→Pay</th><th>Pay→Ord</th><th>Cart→Ord</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Social sign-in errors</h2>
  <div class="sub">auth_social_failed events grouped by (platform, provider). Top error codes for the window are shown inline; ops can use these to spot Google/Apple regressions before shoppers complain.</div>
  <div id="socialFailuresSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="socialFailuresDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform / Provider</th>
        <th>Failures</th><th>Top error codes</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Suggested card messages</h2>
  <div class="sub">suggested_message_picked events grouped by (platform, category). Category-only — we never log the message body, just which tab the shopper picked from. Use this to prune dull categories and double down on the popular ones.</div>
  <div id="suggestedMessagesSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="suggestedMessagesDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Category</th><th>Picks</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell — daily digest</h2>
  <div class="sub">Per-day, per-platform upsell conversion at a glance: total tab clicks, total item adds, add rate (item adds / tab clicks), and checkout-proceeded count. WoW columns compare each day to the same platform on the same weekday 7 days prior. Use this to spot day-over-day drops before the Slack alert fires.</div>
  <div id="upsellDailyDigestTrends" class="trends"></div>
  <table id="upsellDailyDigest">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th>
        <th>Tab clicks</th><th>WoW</th>
        <th>Item adds</th><th>WoW</th>
        <th>Add rate</th><th>WoW</th>
        <th>Checkout proceeded</th><th>WoW</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell modal — platform breakdown</h2>
  <div class="sub">Per-platform upsell funnel for the whole window: tab clicks → item adds → checkout proceeded. "Add rate" = item adds / tab clicks. "Checkout rate" = checkout-proceeded / tab clicks. Lets you compare web vs. iOS vs. Android conversion at a glance.</div>
  <div id="upsellPlatformSummary"></div>
  <div id="upsellCheckoutTrends" class="trends" style="margin-top:8px"></div>
  <div id="upsellRevenuePctSummaryTrends" class="trends" style="margin-top:8px"></div>

  <h2>Upsell modal — tab clicks</h2>
  <div class="sub">upsell_tab_clicked events per tab. "Add rate" = total product adds on that tab / tab clicks — how often a shopper who opened the tab actually added something. Sorted best-converting first.</div>
  <div id="upsellTabsSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <div id="upsellTabsTrends" class="trends"></div>
  <table id="upsellTabsDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Tab</th><th>Clicks</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell modal — top add-ons</h2>
  <div class="sub">upsell_item_added events per (tab, product). "Add rate" = product adds / tab clicks — how well each product converts within its tab. Sorted best-converting first so the top rows show which add-ons to promote.</div>
  <div id="upsellItemsSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="upsellItemsDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Tab</th><th>Product</th><th>Adds</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell modal — checkout proceeded</h2>
  <div class="sub">upsell_checkout_proceeded events. Each count represents a shopper who tapped "proceed to checkout" from inside the upsell modal — a strong signal that the upsell flow is influencing the purchase path.</div>
  <div id="upsellCheckoutSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="upsellCheckoutDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Proceeded</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell session ID coverage</h2>
  <div class="sub">What % of upsell_item_added events carry a non-null session_id, per (day, platform). Coverage below the configured threshold (default 80%) triggers a Slack alert from the sessionCoverageMonitor. A drop here means a client build or code path stopped sending the field, which silently degrades the session-level conversion metric above.</div>
  <div id="upsellSessionCoverageSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="upsellSessionCoverageDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Total events</th><th>With session ID</th><th>Coverage</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Funnel session ID coverage</h2>
  <div class="sub">What % of <strong>cart_viewed</strong>, <strong>checkout_started</strong>, and <strong>order_placed</strong> events carry a non-null session_id, per (event type, day, platform). A drop means a client build or code path stopped sending the field on that event type, silently degrading funnel attribution accuracy. The monitor fires a per-event-type Slack alert when aggregate day coverage drops below the configured threshold (default 80%).</div>
  <div id="funnelSessionCoverageSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="funnelSessionCoverageDaily">
    <thead>
      <tr>
        <th>Day</th><th>Event type</th><th>Platform</th><th>Total events</th><th>With session ID</th><th>Coverage</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Upsell add-on → order attribution (session-level)</h2>
  <div class="sub">Exact session-level attribution: a session is "converted" when the same session ID appears in both an upsell_item_added event and an order_placed event in the window. Only events from updated clients that send a session ID are counted — events from older clients are excluded so stale traffic never dilutes the rate. "Session conversion rate" = converted sessions / sessions with add.</div>
  <div id="upsellSessionConversionSummary"></div>

  <h2>Upsell add-on → order correlation (day-level)</h2>
  <div class="sub">Per-product co-occurrence of upsell_item_added and order_placed on the same platform/day. "Est. upsell revenue" = total upsell adds × product price (USD) — a rough upper-bound on incremental revenue from each add-on. Sorted by estimated revenue descending. "Order-day rate" = % of add-days that also saw an order. Compare with the session-level rate above for a more exact attribution signal.</div>
  <div id="upsellConversionSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Estimated revenue trend (top products)</h3>
  <div class="sub" style="margin-top:-4px">Daily estimated revenue (upsell adds × price) for the top products by total window revenue. One series per (product, platform).</div>
  <div id="upsellConversionRevenueTrends" class="trends"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Upsell revenue as % of confirmed order revenue</h3>
  <div class="sub" style="margin-top:-4px">Daily ratio of total estimated upsell revenue to confirmed order revenue (revenueUsd from the purchase funnel), per platform. Shows how much of the day's revenue was contributed by upsell add-ons.</div>
  <div id="upsellRevenuePctTrends" class="trends"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="upsellConversionDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Product</th><th>Upsell adds</th><th>Orders same day</th><th>Est. revenue</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Login prompt funnel</h2>
  <div class="sub">checkout_login_prompt_viewed → action (sign-in / guest / dismissed)</div>
  <div id="loginLegend" class="legend"></div>
  <div id="loginTrends" class="trends"></div>
  <table id="login">
    <thead>
      <tr>
        <th>Day</th><th>Platform / Surface</th>
        <th>Viewed</th><th>Sign-in</th><th>Guest</th><th>Dismissed</th>
        <th>Sign-in %</th><th>Guest %</th><th>Dismiss %</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

<script>
(function () {
  var TOKEN_KEY = 'presentail.admin.pushToken';
  var tokenEl = document.getElementById('token');
  var daysEl = document.getElementById('days');
  var statusEl = document.getElementById('status');
  var refreshBtn = document.getElementById('refresh');
  var purchaseBody = document.querySelector('#purchase tbody');
  var loginBody = document.querySelector('#login tbody');
  var socialDailyBody = document.querySelector('#socialFailuresDaily tbody');
  var socialSummary = document.getElementById('socialFailuresSummary');
  var suggestedDailyBody = document.querySelector('#suggestedMessagesDaily tbody');
  var suggestedSummary = document.getElementById('suggestedMessagesSummary');
  var purchaseTrends = document.getElementById('purchaseTrends');
  var purchaseLegend = document.getElementById('purchaseLegend');
  var loginTrends = document.getElementById('loginTrends');
  var loginLegend = document.getElementById('loginLegend');
  var upsellDailyDigestBody = document.querySelector('#upsellDailyDigest tbody');
  var upsellDailyDigestTrends = document.getElementById('upsellDailyDigestTrends');
  var upsellPlatformSummary = document.getElementById('upsellPlatformSummary');
  var upsellCheckoutTrends = document.getElementById('upsellCheckoutTrends');
  var upsellRevenuePctSummaryTrends = document.getElementById('upsellRevenuePctSummaryTrends');
  var upsellTabsSummary = document.getElementById('upsellTabsSummary');
  var upsellTabsDailyBody = document.querySelector('#upsellTabsDaily tbody');
  var upsellTabsTrends = document.getElementById('upsellTabsTrends');
  var upsellItemsSummary = document.getElementById('upsellItemsSummary');
  var upsellItemsDailyBody = document.querySelector('#upsellItemsDaily tbody');
  var upsellCheckoutSummary = document.getElementById('upsellCheckoutSummary');
  var upsellCheckoutDailyBody = document.querySelector('#upsellCheckoutDaily tbody');
  var upsellSessionCoverageSummary = document.getElementById('upsellSessionCoverageSummary');
  var upsellSessionCoverageDailyBody = document.querySelector('#upsellSessionCoverageDaily tbody');
  var funnelSessionCoverageSummary = document.getElementById('funnelSessionCoverageSummary');
  var funnelSessionCoverageDailyBody = document.querySelector('#funnelSessionCoverageDaily tbody');
  var upsellSessionConversionSummary = document.getElementById('upsellSessionConversionSummary');
  var upsellConversionSummary = document.getElementById('upsellConversionSummary');
  var upsellConversionRevenueTrends = document.getElementById('upsellConversionRevenueTrends');
  var upsellRevenuePctTrends = document.getElementById('upsellRevenuePctTrends');
  var upsellConversionDailyBody = document.querySelector('#upsellConversionDaily tbody');
  var coverageAlertBanner = document.getElementById('coverageAlertBanner');

  var PALETTE = ['#3366cc', '#dc3912', '#109618', '#ff9900', '#990099', '#0099c6', '#dd4477', '#66aa00'];
  function colorFor(key) {
    var h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uniqueDays(rows) {
    var set = {};
    rows.forEach(function (r) { set[r.day] = true; });
    return Object.keys(set).sort();
  }
  function uniqueKeys(rows, keyFn) {
    var set = {};
    rows.forEach(function (r) { set[keyFn(r)] = true; });
    return Object.keys(set).sort();
  }
  function buildSeries(rows, days, keyFn, valueFn) {
    var byKey = {};
    rows.forEach(function (r) {
      var k = keyFn(r);
      if (!byKey[k]) byKey[k] = {};
      byKey[k][r.day] = valueFn(r);
    });
    var keys = Object.keys(byKey).sort();
    var series = {};
    keys.forEach(function (k) {
      series[k] = days.map(function (d) {
        var v = byKey[k][d];
        return v == null ? null : v;
      });
    });
    return series;
  }
  function renderSparkline(days, series, opts) {
    var width = 200, height = 44, pad = 3;
    var n = days.length;
    var maxY = (opts && opts.max) || 0;
    if (!opts || !opts.max) {
      Object.keys(series).forEach(function (k) {
        series[k].forEach(function (v) { if (v != null && v > maxY) maxY = v; });
      });
      if (!maxY) maxY = 1;
    }
    var w = width - 2 * pad, h = height - 2 * pad;
    function x(i) { return pad + (n <= 1 ? w / 2 : (i / (n - 1)) * w); }
    function y(v) { return pad + h - (v / maxY) * h; }
    var paths = Object.keys(series).map(function (key) {
      var values = series[key];
      var d = '', started = false, dotCount = 0, lastX = 0, lastY = 0;
      values.forEach(function (v, i) {
        if (v == null) { started = false; return; }
        var px = x(i), py = y(v);
        d += (started ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
        started = true;
        dotCount++;
        lastX = px; lastY = py;
      });
      var color = colorFor(key);
      var dot = dotCount === 1
        ? '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="2" fill="' + color + '" />'
        : '';
      return '<path d="' + d + '" stroke="' + color + '" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />' + dot;
    }).join('');
    var axis = '<line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="#ccc" stroke-width="0.5" />';
    var maxLabel = '<text x="' + (width - pad) + '" y="' + (pad + 8) + '" font-size="9" text-anchor="end" fill="#999">' + (opts && opts.max === 100 ? maxY.toFixed(0) + '%' : maxY.toLocaleString()) + '</text>';
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' + axis + paths + maxLabel + '</svg>';
  }
  function renderLegend(container, keys) {
    if (!keys.length) { container.innerHTML = ''; return; }
    container.innerHTML = keys.map(function (k) {
      return '<span><span class="swatch" style="background:' + colorFor(k) + '"></span>' + escapeHtml(k) + '</span>';
    }).join('');
  }
  function renderTrends(container, rows, keyFn, metrics) {
    if (!rows.length) { container.innerHTML = ''; return; }
    var days = uniqueDays(rows);
    container.innerHTML = metrics.map(function (m) {
      var series = buildSeries(rows, days, keyFn, m.valueFn);
      return '<div class="trend"><div class="trend-title">' + escapeHtml(m.label) + '</div>' +
        renderSparkline(days, series, { max: m.max }) + '</div>';
    }).join('');
  }

  try { tokenEl.value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  function fmtPct(p) {
    if (p === null || p === undefined) return '<span class="muted">—</span>';
    var cls = p < 10 ? ' low' : '';
    return '<span class="pct' + cls + '">' + p.toFixed(1) + '%</span>';
  }
  function num(n) { return (n == null ? 0 : n).toLocaleString(); }
  function money(usd) {
    var n = (usd == null ? 0 : usd);
    if (!n) return '<span class="muted">$0</span>';
    return '$' + n.toLocaleString();
  }

  function renderPurchase(rows) {
    if (!rows.length) {
      purchaseBody.innerHTML = '<tr><td colspan="11" class="muted">No events in range.</td></tr>';
      return;
    }
    purchaseBody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + r.day + '</td>' +
        '<td>' + r.platform + '</td>' +
        '<td>' + num(r.cartViewed) + '</td>' +
        '<td>' + num(r.checkoutStarted) + '</td>' +
        '<td>' + num(r.paymentMethodSelected) + '</td>' +
        '<td>' + num(r.orderPlaced) + '</td>' +
        '<td>' + money(r.revenueUsd) + '</td>' +
        '<td>' + fmtPct(r.cartToCheckoutPct) + '</td>' +
        '<td>' + fmtPct(r.checkoutToPaymentPct) + '</td>' +
        '<td>' + fmtPct(r.paymentToOrderPct) + '</td>' +
        '<td>' + fmtPct(r.cartToOrderPct) + '</td>' +
        '</tr>';
    }).join('');
  }

  function fmtErrorCodes(codes) {
    if (!codes || !codes.length) return '<span class="muted">—</span>';
    return codes.map(function (c) {
      return escapeHtml(c.errorCode) + ' (' + num(c.count) + ')';
    }).join(', ');
  }

  function renderSocialFailures(payload) {
    var summary = (payload && payload.summary) || [];
    var daily = (payload && payload.daily) || [];
    if (!summary.length && !daily.length) {
      socialSummary.innerHTML = '<div class="muted">No social sign-in failures in range.</div>';
      socialDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
      return;
    }
    if (summary.length) {
      socialSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Provider</th><th>Failures (window)</th><th>Top error codes</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + escapeHtml(r.provider) + '</td>' +
            '<td>' + num(r.total) + '</td>' +
            '<td>' + fmtErrorCodes(r.topErrorCodes) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } else {
      socialSummary.innerHTML = '<div class="muted">No social sign-in failures in range.</div>';
    }
    if (daily.length) {
      socialDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + ' / ' + escapeHtml(r.provider) + '</td>' +
          '<td>' + num(r.total) + '</td>' +
          '<td>' + fmtErrorCodes(r.topErrorCodes) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      socialDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
    }
  }

  function renderSuggestedMessages(payload) {
    var summary = (payload && payload.summary) || [];
    var daily = (payload && payload.daily) || [];
    if (!summary.length && !daily.length) {
      suggestedSummary.innerHTML = '<div class="muted">No suggested-message picks in range.</div>';
      suggestedDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
      return;
    }
    if (summary.length) {
      suggestedSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Category</th><th>Picks (window)</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + escapeHtml(r.category) + '</td>' +
            '<td>' + num(r.count) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } else {
      suggestedSummary.innerHTML = '<div class="muted">No suggested-message picks in range.</div>';
    }
    if (daily.length) {
      suggestedDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + escapeHtml(r.category) + '</td>' +
          '<td>' + num(r.count) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      suggestedDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
    }
  }

  // Returns a YYYY-MM-DD string that is n days before dateStr (YYYY-MM-DD).
  function shiftDay(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  // Formats a week-over-week percentage change. Returns a coloured ±% string,
  // "new" when prior was 0 and current > 0, or "—" when data is unavailable.
  function fmtWoW(current, prior) {
    if (current == null || prior == null) return '<span class="muted">—</span>';
    if (prior === 0 && current === 0) return '<span class="muted">—</span>';
    if (prior === 0) return '<span class="wow-new">new</span>';
    var delta = Math.round((current - prior) / Math.abs(prior) * 1000) / 10;
    var sign = delta >= 0 ? '+' : '';
    var cls = delta >= 0 ? 'wow-up' : 'wow-down';
    return '<span class="' + cls + '">' + sign + delta.toFixed(1) + '%</span>';
  }

  function renderUpsellDailyDigest(tabClicksDaily, itemAddsDaily, checkoutProceededDaily, rangeStartDay, itemAddRateMinPct) {
    // Aggregate all three daily arrays into per-(day, platform) totals so the
    // digest table gives a single at-a-glance row per day × platform.
    // The arrays include 7 extra prior-week days used only for WoW comparison.
    var agg = {};
    function ensureKey(day, platform) {
      var k = day + '||' + platform;
      if (!agg[k]) agg[k] = { day: day, platform: platform, tabClicks: 0, itemAdds: 0, checkoutProceeded: 0 };
      return agg[k];
    }
    (tabClicksDaily || []).forEach(function (r) { ensureKey(r.day, r.platform).tabClicks += r.clicks; });
    (itemAddsDaily || []).forEach(function (r) { ensureKey(r.day, r.platform).itemAdds += r.adds; });
    (checkoutProceededDaily || []).forEach(function (r) { ensureKey(r.day, r.platform).checkoutProceeded += r.count; });

    var allRows = Object.keys(agg).map(function (k) { return agg[k]; });

    // Index ALL rows (display + prior week) for WoW lookups.
    // We must not restrict this to pre-range rows only: for windows > 7 days
    // "same day last week" lands inside the display window for days 8+ and
    // would be missed if we only indexed rows before rangeStartDay.
    var allRowsByKey = {};
    allRows.forEach(function (r) { allRowsByKey[r.platform + '::' + r.day] = r; });

    // Display rows are those inside the requested window.
    var displayRows = rangeStartDay
      ? allRows.filter(function (r) { return r.day >= rangeStartDay; })
      : allRows;

    // Sort display rows: newest day first, then platform alphabetically
    displayRows.sort(function (a, b) {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      return a.platform < b.platform ? -1 : 1;
    });

    if (!displayRows.length) {
      upsellDailyDigestBody.innerHTML = '<tr><td colspan="10" class="muted">No upsell events in range.</td></tr>';
      upsellDailyDigestTrends.innerHTML = '';
      return;
    }

    upsellDailyDigestBody.innerHTML = displayRows.map(function (r) {
      var addRatePct = r.tabClicks > 0 ? Math.round(r.itemAdds / r.tabClicks * 1000) / 10 : null;
      // Look up the same platform on the same weekday 7 days prior using the
      // full allRowsByKey map (covers both prior-week and in-window prior rows).
      var priorDay = shiftDay(r.day, 7);
      var prior = allRowsByKey[r.platform + '::' + priorDay] || null;
      var priorAddRatePct = prior && prior.tabClicks > 0
        ? Math.round(prior.itemAdds / prior.tabClicks * 1000) / 10
        : null;
      // Highlight rows where the add rate is below the configured monitor threshold.
      var rowCls = (addRatePct !== null && typeof itemAddRateMinPct === 'number' && addRatePct < itemAddRateMinPct)
        ? ' class="add-rate-low"' : '';
      return '<tr' + rowCls + '>' +
        '<td>' + r.day + '</td>' +
        '<td>' + escapeHtml(r.platform) + '</td>' +
        '<td>' + num(r.tabClicks) + '</td>' +
        '<td>' + (prior ? fmtWoW(r.tabClicks, prior.tabClicks) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + num(r.itemAdds) + '</td>' +
        '<td>' + (prior ? fmtWoW(r.itemAdds, prior.itemAdds) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + fmtPct(addRatePct) + '</td>' +
        '<td>' + (prior ? fmtWoW(addRatePct, priorAddRatePct) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + num(r.checkoutProceeded) + '</td>' +
        '<td>' + (prior ? fmtWoW(r.checkoutProceeded, prior.checkoutProceeded) : '<span class="muted">—</span>') + '</td>' +
        '</tr>';
    }).join('');

    renderTrends(upsellDailyDigestTrends, displayRows,
      function (r) { return r.platform; },
      [
        { label: 'Tab clicks', valueFn: function (r) { return r.tabClicks; } },
        { label: 'Item adds', valueFn: function (r) { return r.itemAdds; } },
        { label: 'Add rate (%)', valueFn: function (r) { return r.tabClicks > 0 ? Math.round(r.itemAdds / r.tabClicks * 1000) / 10 : null; }, max: 100 },
        { label: 'Checkout proceeded', valueFn: function (r) { return r.checkoutProceeded; } },
      ]
    );
  }

  function renderUpsellPlatformBreakdown(platformSummaryRows, checkoutDailyRows, purchaseRows, conversionPlatformTotals, conversionDailyRows) {
    if (!platformSummaryRows || !platformSummaryRows.length) {
      upsellPlatformSummary.innerHTML = '<div class="muted">No upsell events in range.</div>';
      upsellCheckoutTrends.innerHTML = '';
      upsellRevenuePctSummaryTrends.innerHTML = '';
      return;
    }
    // Build per-platform confirmed revenue from the purchase funnel rows
    var purchaseRevenueByPlatform = {};
    (purchaseRows || []).forEach(function (r) {
      if (r.platform && r.revenueUsd != null) {
        purchaseRevenueByPlatform[r.platform] = (purchaseRevenueByPlatform[r.platform] || 0) + r.revenueUsd;
      }
    });
    // Build per-platform total estimated upsell revenue from conversion platform totals
    var upsellRevenueByPlatform = {};
    (conversionPlatformTotals || []).forEach(function (t) {
      if (t.platform && t.totalEstRevenueUsd != null) {
        upsellRevenueByPlatform[t.platform] = t.totalEstRevenueUsd;
      }
    });
    upsellPlatformSummary.innerHTML = '<table><thead><tr>' +
      '<th>Platform</th>' +
      '<th>Tab clicks</th>' +
      '<th>Item adds</th>' +
      '<th>Checkout proceeded</th>' +
      '<th>Add rate</th>' +
      '<th>Checkout rate</th>' +
      '<th>Upsell rev % of confirmed</th>' +
      '</tr></thead><tbody>' + platformSummaryRows.map(function (r) {
        var confirmedRev = purchaseRevenueByPlatform[r.platform] || 0;
        var upsellRev = upsellRevenueByPlatform[r.platform];
        var revPctCell = (confirmedRev > 0 && upsellRev != null)
          ? fmtPct(Math.round((upsellRev / confirmedRev) * 1000) / 10)
          : '<span class="muted">—</span>';
        return '<tr>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + num(r.tabClicks) + '</td>' +
          '<td>' + num(r.itemAdds) + '</td>' +
          '<td>' + num(r.checkoutProceeded) + '</td>' +
          '<td>' + fmtPct(r.addRatePct) + '</td>' +
          '<td>' + fmtPct(r.checkoutRatePct) + '</td>' +
          '<td>' + revPctCell + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
    // Sparkline: checkout-proceeded per platform over time
    if (checkoutDailyRows && checkoutDailyRows.length) {
      renderTrends(upsellCheckoutTrends, checkoutDailyRows,
        function (r) { return r.platform; },
        [{ label: 'Checkout proceeded', valueFn: function (r) { return r.count; } }]
      );
    } else {
      upsellCheckoutTrends.innerHTML = '';
    }
    // Sparkline: upsell revenue % of confirmed purchase revenue per platform over time
    var purchaseRevenueByDayPlatform = {};
    (purchaseRows || []).forEach(function (r) {
      if (r.day && r.platform && r.revenueUsd != null) {
        var key = r.day + '|' + r.platform;
        purchaseRevenueByDayPlatform[key] = (purchaseRevenueByDayPlatform[key] || 0) + r.revenueUsd;
      }
    });
    var upsellByDayPlatform = {};
    (conversionDailyRows || []).forEach(function (r) {
      if (r.day && r.platform && r.estUpsellRevenueUsd != null) {
        var key = r.day + '|' + r.platform;
        upsellByDayPlatform[key] = (upsellByDayPlatform[key] || 0) + r.estUpsellRevenueUsd;
      }
    });
    var revPctRows = [];
    Object.keys(purchaseRevenueByDayPlatform).forEach(function (key) {
      var parts = key.split('|');
      var day = parts[0];
      var platform = parts[1];
      var confirmedRev = purchaseRevenueByDayPlatform[key] || 0;
      if (confirmedRev > 0) {
        var upsellRev = upsellByDayPlatform[key] || 0;
        revPctRows.push({
          day: day,
          platform: platform,
          upsellPctOfRevenue: Math.round((upsellRev / confirmedRev) * 1000) / 10,
        });
      }
    });
    if (revPctRows.length) {
      renderTrends(upsellRevenuePctSummaryTrends, revPctRows,
        function (r) { return r.platform; },
        [{ label: 'Upsell % of revenue', valueFn: function (r) { return r.upsellPctOfRevenue; }, max: 100 }]
      );
    } else {
      upsellRevenuePctSummaryTrends.innerHTML = '';
    }
  }

  function renderUpsellTabs(payload) {
    var summary = (payload && payload.summary) || [];
    var daily = (payload && payload.daily) || [];
    if (!summary.length && !daily.length) {
      upsellTabsSummary.innerHTML = '<div class="muted">No tab-click events in range.</div>';
      upsellTabsDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
      upsellTabsTrends.innerHTML = '';
      return;
    }
    if (summary.length) {
      upsellTabsSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Tab</th><th>Clicks (window)</th><th>Total adds</th><th>Add rate</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + escapeHtml(r.tab) + '</td>' +
            '<td>' + num(r.clicks) + '</td>' +
            '<td>' + num(r.totalAdds) + '</td>' +
            '<td>' + fmtPct(r.addRatePct) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } else {
      upsellTabsSummary.innerHTML = '<div class="muted">No tab-click events in range.</div>';
    }
    if (daily.length) {
      var tabKeyFn = function (r) { return r.platform + '/' + r.tab; };
      renderTrends(upsellTabsTrends, daily, tabKeyFn, [
        { label: 'Tab clicks', valueFn: function (r) { return r.clicks; } },
      ]);
      upsellTabsDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + escapeHtml(r.tab) + '</td>' +
          '<td>' + num(r.clicks) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      upsellTabsDailyBody.innerHTML = '<tr><td colspan="4" class="muted">No events in range.</td></tr>';
      upsellTabsTrends.innerHTML = '';
    }
  }

  function fmtProduct(r) {
    if (r.productName) {
      var priceStr = r.priceUsd != null ? ' <span class="muted">$' + r.priceUsd.toFixed(2) + '</span>' : '';
      // Append per-store local prices (LBP, AED, EUR) deduped by currency+amount
      if (r.prices && typeof r.prices === 'object') {
        var seen = {};
        var localParts = [];
        Object.keys(r.prices).forEach(function (storeKey) {
          var sp = r.prices[storeKey];
          if (!sp || !sp.currency || sp.priceLocal == null) return;
          var key = sp.currency + ':' + sp.priceLocal;
          if (seen[key]) return;
          seen[key] = true;
          var decimals = sp.decimals != null ? sp.decimals : 2;
          var formatted = decimals === 0
            ? Math.round(sp.priceLocal).toLocaleString()
            : sp.priceLocal.toFixed(decimals);
          localParts.push(sp.currency + '\u00a0' + formatted);
        });
        if (localParts.length) {
          priceStr += ' <span class="muted">' + localParts.join(' / ') + '</span>';
        }
      }
      var warnBadge = r.priceChanged
        ? ' <span class="price-warn" title="Price has changed since server startup — historic adds may have occurred at a different price, so the estimated revenue total may be inaccurate.">\u26a0\ufe0f price changed</span>'
        : '';
      return escapeHtml(r.productName) + priceStr + warnBadge + ' <span class="muted" style="font-size:11px">(' + escapeHtml(r.productId) + ')</span>';
    }
    return escapeHtml(r.productId);
  }

  function renderUpsellItems(payload) {
    var summary = (payload && payload.summary) || [];
    var daily = (payload && payload.daily) || [];
    if (!summary.length && !daily.length) {
      upsellItemsSummary.innerHTML = '<div class="muted">No item-add events in range.</div>';
      upsellItemsDailyBody.innerHTML = '<tr><td colspan="5" class="muted">No events in range.</td></tr>';
      return;
    }
    if (summary.length) {
      upsellItemsSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Tab</th><th>Product</th><th>Adds (window)</th><th>Add rate</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + escapeHtml(r.tab) + '</td>' +
            '<td>' + fmtProduct(r) + '</td>' +
            '<td>' + num(r.adds) + '</td>' +
            '<td>' + fmtPct(r.addRatePct) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } else {
      upsellItemsSummary.innerHTML = '<div class="muted">No item-add events in range.</div>';
    }
    if (daily.length) {
      upsellItemsDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + escapeHtml(r.tab) + '</td>' +
          '<td>' + fmtProduct(r) + '</td>' +
          '<td>' + num(r.adds) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      upsellItemsDailyBody.innerHTML = '<tr><td colspan="5" class="muted">No events in range.</td></tr>';
    }
  }

  function renderUpsellCheckout(payload) {
    var summary = (payload && payload.summary) || [];
    var daily = (payload && payload.daily) || [];
    if (!summary.length && !daily.length) {
      upsellCheckoutSummary.innerHTML = '<div class="muted">No checkout-proceeded events in range.</div>';
      upsellCheckoutDailyBody.innerHTML = '<tr><td colspan="3" class="muted">No events in range.</td></tr>';
      return;
    }
    if (summary.length) {
      upsellCheckoutSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Proceeded (window)</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + num(r.count) + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
    } else {
      upsellCheckoutSummary.innerHTML = '<div class="muted">No checkout-proceeded events in range.</div>';
    }
    if (daily.length) {
      upsellCheckoutDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + num(r.count) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      upsellCheckoutDailyBody.innerHTML = '<tr><td colspan="3" class="muted">No events in range.</td></tr>';
    }
  }

  function fmtRevenue(usd) {
    if (usd === null || usd === undefined) return '<span class="muted">—</span>';
    return '$' + usd.toLocaleString();
  }

  function renderUpsellCoverage(payload) {
    var daily = (payload && payload.daily) || [];
    if (!daily.length) {
      upsellSessionCoverageSummary.innerHTML = '<div class="muted">No upsell_item_added events in range.</div>';
      upsellSessionCoverageDailyBody.innerHTML = '<tr><td colspan="5" class="muted">No events in range.</td></tr>';
      return;
    }
    // Aggregate totals across the window for the summary banner
    var totalAll = 0, totalWithSession = 0;
    daily.forEach(function (r) { totalAll += r.total; totalWithSession += r.withSessionId; });
    var overallPct = totalAll > 0 ? Math.round(totalWithSession / totalAll * 1000) / 10 : null;
    var coverageClass = overallPct !== null && overallPct < 80 ? 'low' : '';
    upsellSessionCoverageSummary.innerHTML =
      '<p style="margin:0 0 8px">Overall coverage for window: ' +
      '<span class="pct ' + coverageClass + '">' + (overallPct !== null ? overallPct.toFixed(1) + '%' : '—') + '</span>' +
      ' (' + totalWithSession.toLocaleString() + ' / ' + totalAll.toLocaleString() + ' events have a session ID).' +
      (overallPct !== null && overallPct < 80 ? ' <span class="low">Below 80% threshold.</span>' : '') +
      '</p>';
    upsellSessionCoverageDailyBody.innerHTML = daily.map(function (r) {
      var cls = r.coveragePct !== null && r.coveragePct < 80 ? 'low' : '';
      return '<tr>' +
        '<td>' + r.day + '</td>' +
        '<td>' + escapeHtml(r.platform) + '</td>' +
        '<td>' + num(r.total) + '</td>' +
        '<td>' + num(r.withSessionId) + '</td>' +
        '<td class="pct ' + cls + '">' + fmtPct(r.coveragePct) + '</td>' +
        '</tr>';
    }).join('');
  }

  // Coverage threshold — mirrors the server-side monitor default (80%).
  var COVERAGE_THRESHOLD = 80;

  // Render a prominent sticky alert banner at the top of the page listing any
  // funnel event type or upsell session ID coverage whose most-recent-day
  // coverage is below threshold. Both funnel (cart_viewed / checkout_started /
  // order_placed) and upsell (upsell_item_added) regressions are consolidated
  // into one list so the operator sees everything in one place. Hides itself
  // when all healthy.
  function renderCoverageAlertBanner(funnelSessionCoveragePayload, upsellSessionCoveragePayload) {
    var funnelDaily = (funnelSessionCoveragePayload && funnelSessionCoveragePayload.daily) || [];
    var upsellDaily = (upsellSessionCoveragePayload && upsellSessionCoveragePayload.daily) || [];

    if (!funnelDaily.length && !upsellDaily.length) {
      coverageAlertBanner.style.display = 'none';
      coverageAlertBanner.innerHTML = '';
      return;
    }

    // Each dataset is evaluated against its own most-recent day independently.
    // Using a shared latest day would suppress regressions from one stream
    // whenever the other stream happens to have a newer date.
    var mostRecentFunnelDay = '';
    funnelDaily.forEach(function (r) { if (r.day > mostRecentFunnelDay) mostRecentFunnelDay = r.day; });

    var mostRecentUpsellDay = '';
    upsellDaily.forEach(function (r) { if (r.day > mostRecentUpsellDay) mostRecentUpsellDay = r.day; });

    // Aggregate funnel totals per event type for the funnel stream's latest day.
    var byEvent = {};
    funnelDaily.forEach(function (r) {
      if (r.day !== mostRecentFunnelDay) return;
      var e = r.eventName;
      if (!byEvent[e]) byEvent[e] = { total: 0, withSessionId: 0 };
      byEvent[e].total += r.total;
      byEvent[e].withSessionId += r.withSessionId;
    });

    // Aggregate upsell totals across all platforms for the upsell stream's latest day.
    var upsellAgg = { total: 0, withSessionId: 0 };
    upsellDaily.forEach(function (r) {
      if (r.day !== mostRecentUpsellDay) return;
      upsellAgg.total += r.total;
      upsellAgg.withSessionId += r.withSessionId;
    });

    // Identify funnel event types below threshold (only those with at least 1 event).
    var eventOrder = ['cart_viewed', 'checkout_started', 'order_placed'];
    var failingFunnel = Object.keys(byEvent)
      .filter(function (e) {
        var agg = byEvent[e];
        if (!agg.total) return false;
        var pct = Math.round(agg.withSessionId / agg.total * 1000) / 10;
        return pct < COVERAGE_THRESHOLD;
      })
      .sort(function (a, b) {
        var ia = eventOrder.indexOf(a), ib = eventOrder.indexOf(b);
        if (ia === -1 && ib === -1) return a < b ? -1 : 1;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });

    // Check whether upsell session ID coverage is below threshold.
    var upsellPct = upsellAgg.total > 0
      ? Math.round(upsellAgg.withSessionId / upsellAgg.total * 1000) / 10
      : null;
    var upsellFailing = upsellPct !== null && upsellPct < COVERAGE_THRESHOLD;

    if (!failingFunnel.length && !upsellFailing) {
      coverageAlertBanner.style.display = 'none';
      coverageAlertBanner.innerHTML = '';
      return;
    }

    // Build banner list items — funnel event types first, then upsell.
    // Each item includes its own day label derived from its stream's latest day.
    var items = failingFunnel.map(function (e) {
      var agg = byEvent[e];
      var pct = Math.round(agg.withSessionId / agg.total * 1000) / 10;
      return '<li><strong>' + escapeHtml(e) + '</strong>: ' +
        pct.toFixed(1) + '% session ID coverage on ' + escapeHtml(mostRecentFunnelDay) +
        ' (' + agg.withSessionId.toLocaleString() + '\u202f/\u202f' + agg.total.toLocaleString() + ' events)' +
        '</li>';
    }).join('');

    if (upsellFailing) {
      items += '<li><strong>upsell_item_added</strong>: ' +
        upsellPct.toFixed(1) + '% session ID coverage on ' + escapeHtml(mostRecentUpsellDay) +
        ' (' + upsellAgg.withSessionId.toLocaleString() + '\u202f/\u202f' + upsellAgg.total.toLocaleString() + ' events)' +
        '</li>';
    }

    // One jump link per failing category so the operator can navigate directly.
    var links = [];
    if (failingFunnel.length) {
      links.push('<a class="banner-link" onclick="document.getElementById(\'funnelSessionCoverageDaily\').scrollIntoView({behavior:\'smooth\'});return false;" href="#">' +
        'Jump to Funnel session ID coverage table \u2193' +
        '</a>');
    }
    if (upsellFailing) {
      links.push('<a class="banner-link" onclick="document.getElementById(\'upsellSessionCoverageDaily\').scrollIntoView({behavior:\'smooth\'});return false;" href="#">' +
        'Jump to Upsell session ID coverage table \u2193' +
        '</a>');
    }

    coverageAlertBanner.innerHTML =
      '<div class="banner-title">\u26a0\ufe0f Session ID coverage regression detected</div>' +
      '<ul class="banner-items">' + items + '</ul>' +
      links.join(' \u00a0\u00a0 ');
    coverageAlertBanner.style.display = 'block';
  }

  function renderFunnelSessionCoverage(payload) {
    var daily = (payload && payload.daily) || [];
    if (!daily.length) {
      funnelSessionCoverageSummary.innerHTML = '<div class="muted">No funnel events (cart_viewed / checkout_started / order_placed) in range.</div>';
      funnelSessionCoverageDailyBody.innerHTML = '<tr><td colspan="6" class="muted">No events in range.</td></tr>';
      return;
    }
    // Aggregate totals per event type for the summary banner
    var byEvent = {};
    daily.forEach(function (r) {
      var e = r.eventName;
      if (!byEvent[e]) byEvent[e] = { total: 0, withSessionId: 0 };
      byEvent[e].total += r.total;
      byEvent[e].withSessionId += r.withSessionId;
    });
    var eventOrder = ['cart_viewed', 'checkout_started', 'order_placed'];
    var eventNames = Object.keys(byEvent).sort(function (a, b) {
      var ia = eventOrder.indexOf(a), ib = eventOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a < b ? -1 : 1;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    funnelSessionCoverageSummary.innerHTML =
      '<table><thead><tr><th>Event type</th><th>Total events</th><th>With session ID</th><th>Coverage (window)</th></tr></thead><tbody>' +
      eventNames.map(function (e) {
        var agg = byEvent[e];
        var pct = agg.total > 0 ? Math.round(agg.withSessionId / agg.total * 1000) / 10 : null;
        var cls = pct !== null && pct < 80 ? 'low' : '';
        return '<tr>' +
          '<td>' + escapeHtml(e) + '</td>' +
          '<td>' + num(agg.total) + '</td>' +
          '<td>' + num(agg.withSessionId) + '</td>' +
          '<td class="pct ' + cls + '">' + fmtPct(pct) + (pct !== null && pct < 80 ? ' <span class="low">⚠ below threshold</span>' : '') + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
    funnelSessionCoverageDailyBody.innerHTML = daily.map(function (r) {
      var cls = r.coveragePct !== null && r.coveragePct < 80 ? 'low' : '';
      return '<tr>' +
        '<td>' + r.day + '</td>' +
        '<td>' + escapeHtml(r.eventName) + '</td>' +
        '<td>' + escapeHtml(r.platform) + '</td>' +
        '<td>' + num(r.total) + '</td>' +
        '<td>' + num(r.withSessionId) + '</td>' +
        '<td class="pct ' + cls + '">' + fmtPct(r.coveragePct) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderUpsellSessionConversion(payload) {
    var summary = (payload && payload.summary) || [];
    if (!summary.length) {
      upsellSessionConversionSummary.innerHTML = '<div class="muted">No session-attributed conversion data yet — requires updated client builds that send a session ID.</div>';
      return;
    }
    upsellSessionConversionSummary.innerHTML = '<table><thead><tr>' +
      '<th>Platform</th><th>Product</th>' +
      '<th>Sessions w/ add</th><th>Sessions converted</th>' +
      '<th>Session conversion rate</th>' +
      '</tr></thead><tbody>' + summary.map(function (r) {
        return '<tr>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + fmtProduct(r) + '</td>' +
          '<td>' + num(r.sessionsWithAdd) + '</td>' +
          '<td>' + num(r.sessionsConverted) + '</td>' +
          '<td>' + fmtPct(r.sessionConversionRatePct) + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
  }

  function renderUpsellConversion(payload, purchase) {
    var summary = (payload && payload.summary) || [];
    var platformTotals = (payload && payload.platformTotals) || [];
    var daily = (payload && payload.daily) || [];

    // Build per-platform confirmed revenue totals from the purchase funnel rows
    var purchaseRevenueByPlatform = {};
    (purchase || []).forEach(function (r) {
      if (r.platform && r.revenueUsd != null) {
        purchaseRevenueByPlatform[r.platform] = (purchaseRevenueByPlatform[r.platform] || 0) + r.revenueUsd;
      }
    });
    // Build per-(day, platform) confirmed revenue map for the ratio sparkline
    var purchaseRevenueByDayPlatform = {};
    (purchase || []).forEach(function (r) {
      if (r.day && r.platform && r.revenueUsd != null) {
        var key = r.day + '|' + r.platform;
        purchaseRevenueByDayPlatform[key] = (purchaseRevenueByDayPlatform[key] || 0) + r.revenueUsd;
      }
    });

    if (!summary.length && !daily.length) {
      upsellConversionSummary.innerHTML = '<div class="muted">No upsell add-on conversion data in range.</div>';
      upsellConversionRevenueTrends.innerHTML = '';
      upsellRevenuePctTrends.innerHTML = '';
      upsellConversionDailyBody.innerHTML = '<tr><td colspan="6" class="muted">No events in range.</td></tr>';
      return;
    }
    if (summary.length) {
      var subtotalRows = platformTotals.map(function (t) {
        var confirmedRev = purchaseRevenueByPlatform[t.platform] || 0;
        var pctCell = confirmedRev > 0
          ? fmtPct(Math.round((t.totalEstRevenueUsd / confirmedRev) * 1000) / 10)
          : '<span class="muted">—</span>';
        return '<tr style="font-weight:600;border-top:2px solid #ccc">' +
          '<td>' + escapeHtml(t.platform) + '</td>' +
          '<td class="muted" style="font-style:italic">Subtotal</td>' +
          '<td></td><td></td><td></td><td></td>' +
          '<td>' + fmtRevenue(t.totalEstRevenueUsd) + '</td>' +
          '<td>' + pctCell + '</td>' +
          '<td></td>' +
          '</tr>';
      }).join('');
      var hasPriceChanges = summary.some(function (r) { return r.priceChanged; });
      var footnote = hasPriceChanges
        ? '<p class="price-warn" style="font-size:12px;margin:6px 0 0">' +
          '\u26a0\ufe0f One or more add-ons above are marked with a price-change warning. ' +
          'Their \u201cEst. upsell revenue\u201d is computed using the current price, but historic adds in this window may have occurred at a different price \u2014 treat those revenue totals as approximate.' +
          '</p>'
        : '';
      upsellConversionSummary.innerHTML = '<table><thead><tr>' +
        '<th>Platform</th><th>Product</th>' +
        '<th>Upsell adds</th><th>Add days</th>' +
        '<th>Add days w/ orders</th><th>Orders on add days</th>' +
        '<th>Est. upsell revenue (USD)</th>' +
        '<th>% of confirmed revenue</th>' +
        '<th>Order-day rate</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + fmtProduct(r) + '</td>' +
            '<td>' + num(r.totalUpsellAdds) + '</td>' +
            '<td>' + num(r.daysWithAdds) + '</td>' +
            '<td>' + num(r.daysWithAddsAndOrders) + '</td>' +
            '<td>' + num(r.ordersOnAddDays) + '</td>' +
            '<td>' + fmtRevenue(r.estUpsellRevenueUsd) + '</td>' +
            '<td></td>' +
            '<td>' + fmtPct(r.orderDayRatePct) + '</td>' +
            '</tr>';
        }).join('') + subtotalRows + '</tbody></table>' + footnote;
    } else {
      upsellConversionSummary.innerHTML = '<div class="muted">No upsell add-on conversion data in range.</div>';
    }

    // Revenue trend sparkline: top 6 products by total estimated revenue
    if (daily.length) {
      // Pick top products from summary (already sorted by estUpsellRevenueUsd desc)
      var nameMap = {};
      summary.forEach(function (r) {
        if (r.productId) nameMap[r.productId] = r.productName || r.productId;
      });
      var topProductIds = {};
      summary
        .filter(function (r) { return r.estUpsellRevenueUsd != null; })
        .slice(0, 6)
        .forEach(function (r) { topProductIds[r.productId] = true; });

      var revenueDailyRows = daily.filter(function (r) {
        return topProductIds[r.productId] && r.estUpsellRevenueUsd != null;
      });

      if (revenueDailyRows.length) {
        renderTrends(upsellConversionRevenueTrends, revenueDailyRows,
          function (r) { return (nameMap[r.productId] || r.productId) + ' · ' + r.platform; },
          [{ label: 'Est. revenue (USD)', valueFn: function (r) { return r.estUpsellRevenueUsd; } }]
        );
      } else {
        upsellConversionRevenueTrends.innerHTML = '<div class="muted" style="font-size:12px">No priced products in range — revenue trend unavailable.</div>';
      }

      // Ratio sparkline: aggregate upsell revenue by (day, platform) then divide by confirmed revenue
      var upsellByDayPlatform = {};
      daily.forEach(function (r) {
        if (r.estUpsellRevenueUsd != null) {
          var key = r.day + '|' + r.platform;
          upsellByDayPlatform[key] = (upsellByDayPlatform[key] || 0) + r.estUpsellRevenueUsd;
        }
      });
      // Build ratio rows from ALL days that have confirmed purchase revenue so
      // days with zero upsell adds appear as 0% rather than being dropped from
      // the sparkline — which would otherwise overstate average contribution by
      // hiding no-add days.
      var ratioRows = [];
      Object.keys(purchaseRevenueByDayPlatform).forEach(function (key) {
        var parts = key.split('|');
        var day = parts[0];
        var platform = parts[1];
        var confirmedRev = purchaseRevenueByDayPlatform[key] || 0;
        if (confirmedRev > 0) {
          var upsellRev = upsellByDayPlatform[key] || 0;
          ratioRows.push({
            day: day,
            platform: platform,
            upsellPctOfRevenue: Math.round((upsellRev / confirmedRev) * 1000) / 10,
          });
        }
      });
      if (ratioRows.length) {
        renderTrends(upsellRevenuePctTrends, ratioRows,
          function (r) { return r.platform; },
          [{ label: 'Upsell % of revenue', valueFn: function (r) { return r.upsellPctOfRevenue; }, max: 100 }]
        );
      } else {
        upsellRevenuePctTrends.innerHTML = '<div class="muted" style="font-size:12px">No matching purchase revenue rows — ratio unavailable.</div>';
      }
    } else {
      upsellConversionRevenueTrends.innerHTML = '';
      upsellRevenuePctTrends.innerHTML = '';
    }

    if (daily.length) {
      upsellConversionDailyBody.innerHTML = daily.map(function (r) {
        return '<tr>' +
          '<td>' + r.day + '</td>' +
          '<td>' + escapeHtml(r.platform) + '</td>' +
          '<td>' + fmtProduct(r) + '</td>' +
          '<td>' + num(r.upsellAdds) + '</td>' +
          '<td>' + num(r.ordersOnSameDay) + '</td>' +
          '<td>' + fmtRevenue(r.estUpsellRevenueUsd) + '</td>' +
          '</tr>';
      }).join('');
    } else {
      upsellConversionDailyBody.innerHTML = '<tr><td colspan="6" class="muted">No events in range.</td></tr>';
    }
  }

  function renderLogin(rows) {
    if (!rows.length) {
      loginBody.innerHTML = '<tr><td colspan="9" class="muted">No events in range.</td></tr>';
      return;
    }
    loginBody.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + r.day + '</td>' +
        '<td>' + r.platform + ' / ' + r.surface + '</td>' +
        '<td>' + num(r.viewed) + '</td>' +
        '<td>' + num(r.signin) + '</td>' +
        '<td>' + num(r.guest) + '</td>' +
        '<td>' + num(r.dismissed) + '</td>' +
        '<td>' + fmtPct(r.signinPct) + '</td>' +
        '<td>' + fmtPct(r.guestPct) + '</td>' +
        '<td>' + fmtPct(r.dismissedPct) + '</td>' +
        '</tr>';
    }).join('');
  }

  function load() {
    var token = tokenEl.value.trim();
    var days = Math.max(1, Math.min(${MAX_DAYS}, parseInt(daysEl.value, 10) || ${DEFAULT_DAYS}));
    if (!token) {
      statusEl.textContent = 'Enter the admin token to load.';
      statusEl.className = 'err';
      return;
    }
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
    statusEl.textContent = 'Loading…';
    statusEl.className = 'muted';
    fetch('./funnels/data?days=' + days, {
      headers: { 'x-push-admin-token': token },
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var purchase = data.purchase || [];
        var login = data.login || [];
        var socialFailures = data.socialFailures || { summary: [], daily: [] };
        var suggestedMessages = data.suggestedMessages || { summary: [], daily: [] };
        var upsell = data.upsell || {};
        renderPurchase(purchase);
        renderLogin(login);
        renderSocialFailures(socialFailures);
        renderSuggestedMessages(suggestedMessages);
        var digestWoW = upsell.digestWoW || {};
        renderUpsellDailyDigest(
          digestWoW.tabClicksDaily || [],
          digestWoW.itemAddsDaily || [],
          digestWoW.checkoutProceededDaily || [],
          (data.rangeStartUtc || '').slice(0, 10),
          data.upsellItemAddRateMinPct
        );
        renderUpsellPlatformBreakdown(
          upsell.platformSummary || [],
          (upsell.checkoutProceeded || {}).daily || [],
          purchase,
          (upsell.conversion || {}).platformTotals || [],
          (upsell.conversion || {}).daily || []
        );
        renderUpsellTabs(upsell.tabClicks || { summary: [], daily: [] });
        renderUpsellItems(upsell.itemAdds || { summary: [], daily: [] });
        renderUpsellCheckout(upsell.checkoutProceeded || { summary: [], daily: [] });
        renderUpsellCoverage(upsell.sessionCoverage || { daily: [] });
        renderUpsellSessionConversion(upsell.sessionConversion || { summary: [] });
        renderUpsellConversion(upsell.conversion || { summary: [], daily: [] }, purchase);
        var funnelCoverage = data.funnelSessionCoverage || { daily: [] };
        renderCoverageAlertBanner(funnelCoverage, upsell.sessionCoverage || { daily: [] });
        renderFunnelSessionCoverage(funnelCoverage);
        var purchaseKeyFn = function (r) { return r.platform; };
        var loginKeyFn = function (r) { return r.platform + '/' + r.surface; };
        renderLegend(purchaseLegend, uniqueKeys(purchase, purchaseKeyFn));
        renderLegend(loginLegend, uniqueKeys(login, loginKeyFn));
        renderTrends(purchaseTrends, purchase, purchaseKeyFn, [
          { label: 'Cart→Co %', valueFn: function (r) { return r.cartToCheckoutPct; }, max: 100 },
          { label: 'Co→Pay %', valueFn: function (r) { return r.checkoutToPaymentPct; }, max: 100 },
          { label: 'Pay→Ord %', valueFn: function (r) { return r.paymentToOrderPct; }, max: 100 },
          { label: 'Cart→Ord %', valueFn: function (r) { return r.cartToOrderPct; }, max: 100 },
          { label: 'Cart views', valueFn: function (r) { return r.cartViewed; } },
          { label: 'Orders', valueFn: function (r) { return r.orderPlaced; } },
        ]);
        renderTrends(loginTrends, login, loginKeyFn, [
          { label: 'Sign-in %', valueFn: function (r) { return r.signinPct; }, max: 100 },
          { label: 'Guest %', valueFn: function (r) { return r.guestPct; }, max: 100 },
          { label: 'Dismiss %', valueFn: function (r) { return r.dismissedPct; }, max: 100 },
          { label: 'Prompt views', valueFn: function (r) { return r.viewed; } },
        ]);
        statusEl.textContent = 'Loaded ' + data.days + ' day(s) ending ' + (data.rangeEndUtc || '').slice(0, 10) + ' UTC.';
        statusEl.className = 'muted';
      })
      .catch(function (err) {
        statusEl.textContent = 'Load failed: ' + err.message;
        statusEl.className = 'err';
      });
  }

  refreshBtn.addEventListener('click', load);
  tokenEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
  daysEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });
  if (tokenEl.value) load();
})();
</script>
</body>
</html>`;

export default router;

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
  type UpsellTabDailyBucket,
  type UpsellTabSummaryBucket,
  type UpsellItemDailyBucket,
  type UpsellItemSummaryBucket,
  type UpsellCheckoutDailyBucket,
  type UpsellCheckoutSummaryBucket,
} from "../lib/upsellAggregator";
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

  try {
    const [
      purchase,
      login,
      socialFailuresDaily,
      suggestedMessagesDaily,
      upsellTabsDaily,
      upsellItemsDaily,
      upsellCheckoutDaily,
    ] = await Promise.all([
      loadDailyPurchaseBuckets(start, end),
      loadDailyLoginBuckets(start, end),
      loadDailySocialFailureBuckets(start, end),
      loadDailySuggestedMessageBuckets(start, end),
      loadDailyUpsellTabBuckets(start, end),
      loadDailyUpsellItemBuckets(start, end),
      loadDailyUpsellCheckoutBuckets(start, end),
    ]);
    res.json({
      days,
      rangeStartUtc: start.toISOString(),
      rangeEndUtc: end.toISOString(),
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
        ...buildUpsellPayload(
          upsellTabsDaily,
          upsellItemsDaily,
          upsellCheckoutDaily,
        ),
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

function buildUpsellPayload(
  tabsDaily: UpsellTabDailyBucket[],
  itemsDaily: UpsellItemDailyBucket[],
  checkoutDaily: UpsellCheckoutDailyBucket[],
) {
  const tabSummary = summariseUpsellTabBuckets(tabsDaily);
  const itemSummary = summariseUpsellItemBuckets(itemsDaily);
  const checkoutSummary = summariseUpsellCheckoutBuckets(checkoutDaily);

  // Build a fast lookup: "platform::tab" → total clicks
  const tabClickMap = new Map<string, number>();
  for (const t of tabSummary) {
    tabClickMap.set(`${t.platform}::${t.tab}`, t.clicks);
  }

  // Per-product add rate = product adds / tab clicks for that (platform, tab)
  // Sorted best-converting first; products on tabs with no recorded clicks get
  // null addRatePct (edge case: add event arrived before or without a tab click).
  const itemSummaryWithRate = itemSummary
    .map((b) => {
      const tabClicks = tabClickMap.get(`${b.platform}::${b.tab}`) ?? 0;
      return {
        platform: b.platform,
        tab: b.tab,
        productId: b.productId,
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

  return {
    tabClicks: {
      summary: tabSummaryWithRate,
      daily: tabsDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        tab: b.tab,
        clicks: b.clicks,
      })),
    },
    itemAdds: {
      summary: itemSummaryWithRate,
      daily: itemsDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        tab: b.tab,
        productId: b.productId,
        adds: b.adds,
      })),
    },
    checkoutProceeded: {
      summary: checkoutSummary.map((b) => ({
        platform: b.platform,
        count: b.count,
      })),
      daily: checkoutDaily.map((b) => ({
        day: b.day,
        platform: b.platform,
        count: b.count,
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
  .trends { display: flex; gap: 12px; flex-wrap: wrap; margin: 4px 0 12px; }
  .trend { flex: 1 1 160px; min-width: 140px; }
  .trend-title { font-size: 11px; color: #666; margin-bottom: 2px; }
  .trend svg { display: block; width: 100%; height: 44px; background: rgba(127,127,127,0.04); border-radius: 4px; }
  .legend { font-size: 11px; color: #666; margin: 4px 0 6px; display: flex; flex-wrap: wrap; gap: 10px; }
  .legend .swatch { display: inline-block; width: 12px; height: 2px; vertical-align: middle; margin-right: 4px; }
</style>
</head>
<body>
  <h1>Checkout Funnels</h1>
  <div class="sub">Per-day, per-platform conversion. Numbers come from the same aggregator the Slack alerts use, so this view never disagrees with the alert thresholds.</div>

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
  <div class="sub">upsell_item_added events per (tab, product id). "Add rate" = product adds / tab clicks — how well each product converts within its tab. Sorted best-converting first so the top rows show which add-ons to promote.</div>
  <div id="upsellItemsSummary"></div>
  <h3 style="font-size:13px;margin:12px 0 4px;color:#555">Per-day breakdown</h3>
  <table id="upsellItemsDaily">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th><th>Tab</th><th>Product ID</th><th>Adds</th>
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
  var upsellTabsSummary = document.getElementById('upsellTabsSummary');
  var upsellTabsDailyBody = document.querySelector('#upsellTabsDaily tbody');
  var upsellTabsTrends = document.getElementById('upsellTabsTrends');
  var upsellItemsSummary = document.getElementById('upsellItemsSummary');
  var upsellItemsDailyBody = document.querySelector('#upsellItemsDaily tbody');
  var upsellCheckoutSummary = document.getElementById('upsellCheckoutSummary');
  var upsellCheckoutDailyBody = document.querySelector('#upsellCheckoutDaily tbody');

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
        '<th>Platform</th><th>Tab</th><th>Product ID</th><th>Adds (window)</th><th>Add rate</th>' +
        '</tr></thead><tbody>' + summary.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.platform) + '</td>' +
            '<td>' + escapeHtml(r.tab) + '</td>' +
            '<td>' + escapeHtml(r.productId) + '</td>' +
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
          '<td>' + escapeHtml(r.productId) + '</td>' +
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
        renderUpsellTabs(upsell.tabClicks || { summary: [], daily: [] });
        renderUpsellItems(upsell.itemAdds || { summary: [], daily: [] });
        renderUpsellCheckout(upsell.checkoutProceeded || { summary: [], daily: [] });
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

import { Router, type IRouter, type Request, type Response } from "express";
import {
  loadDailyPurchaseBuckets,
  type PurchaseDailyBucket,
} from "../lib/checkoutPurchaseFunnelMonitor";
import {
  loadDailyLoginBuckets,
  type LoginDailyBucket,
} from "../lib/checkoutLoginFunnelMonitor";
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
    const [purchase, login] = await Promise.all([
      loadDailyPurchaseBuckets(start, end),
      loadDailyLoginBuckets(start, end),
    ]);
    res.json({
      days,
      rangeStartUtc: start.toISOString(),
      rangeEndUtc: end.toISOString(),
      purchase: purchase.map(toPurchaseRow),
      login: login.map(toLoginRow),
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
  <div class="sub">cart_viewed → checkout_started → payment_method_selected → order_placed</div>
  <table id="purchase">
    <thead>
      <tr>
        <th>Day</th><th>Platform</th>
        <th>Cart</th><th>Checkout</th><th>Payment</th><th>Orders</th>
        <th>Cart→Co</th><th>Co→Pay</th><th>Pay→Ord</th><th>Cart→Ord</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <h2>Login prompt funnel</h2>
  <div class="sub">checkout_login_prompt_viewed → action (sign-in / guest / dismissed)</div>
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

  try { tokenEl.value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  function fmtPct(p) {
    if (p === null || p === undefined) return '<span class="muted">—</span>';
    var cls = p < 10 ? ' low' : '';
    return '<span class="pct' + cls + '">' + p.toFixed(1) + '%</span>';
  }
  function num(n) { return (n == null ? 0 : n).toLocaleString(); }

  function renderPurchase(rows) {
    if (!rows.length) {
      purchaseBody.innerHTML = '<tr><td colspan="10" class="muted">No events in range.</td></tr>';
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
        '<td>' + fmtPct(r.cartToCheckoutPct) + '</td>' +
        '<td>' + fmtPct(r.checkoutToPaymentPct) + '</td>' +
        '<td>' + fmtPct(r.paymentToOrderPct) + '</td>' +
        '<td>' + fmtPct(r.cartToOrderPct) + '</td>' +
        '</tr>';
    }).join('');
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
        renderPurchase(data.purchase || []);
        renderLogin(data.login || []);
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

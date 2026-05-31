import { Router, type IRouter, type Request, type Response } from "express";
import { and, gte, lt, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import { getFxStatus } from "../lib/fx";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admin-only FX rate health endpoint and companion dashboard viewer.
//
// Auth: same `x-push-admin-token` header as the other admin endpoints
// (PUSH_ADMIN_TOKEN env). No session, no cookie.
//
// Endpoints:
//   GET /api/admin/fx-health            → JSON data (token-gated)
//   GET /api/admin/fx-health/dashboard  → HTML viewer (shell; data loaded by JS)

const MAX_DAYS = 30;
const DEFAULT_DAYS = 14;

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
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
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

export type FxFallbackDailyBucket = {
  day: string;
  fallbackCount: number;
};

async function loadDailyFxFallbackBuckets(
  start: Date,
  end: Date,
): Promise<FxFallbackDailyBucket[]> {
  const rows = (await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      fallbackCount: sql<number>`count(*)::int`,
    })
    .from(analyticsEventsTable)
    .where(
      and(
        sql`${analyticsEventsTable.name} = 'fx_rates_fallback'`,
        gte(analyticsEventsTable.createdAt, start),
        lt(analyticsEventsTable.createdAt, end),
      )!,
    )
    .groupBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
    )
    .orderBy(
      sql`date_trunc('day', ${analyticsEventsTable.createdAt} at time zone 'UTC')`,
    )) as { day: string; fallbackCount: number }[];

  // Fill in zeros for days with no events so the chart has a continuous series.
  const byDay = new Map(rows.map((r) => [r.day, r.fallbackCount]));
  const result: FxFallbackDailyBucket[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const iso = cursor.toISOString().slice(0, 10);
    result.push({ day: iso, fallbackCount: byDay.get(iso) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

// ── GET /api/admin/fx-health — token-gated JSON data ─────────────────────────
//
// Returns:
//   currentStatus  — live in-process state from getFxStatus()
//   daily[]        — per-UTC-day count of fx_rates_fallback analytics events

router.get("/admin/fx-health", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const days = parseDays(req.query.days);
  const { start, end } = dayWindow(new Date(), days);

  try {
    const [daily, status] = await Promise.all([
      loadDailyFxFallbackBuckets(start, end),
      Promise.resolve(getFxStatus()),
    ]);

    res.json({
      ok: true,
      days,
      rangeStartUtc: start.toISOString(),
      rangeEndUtc: end.toISOString(),
      currentStatus: {
        source: status.source,
        fetchedAt: status.fetchedAt,
        consecutiveFailures: status.consecutiveFailures,
        lastLiveAt: status.lastLiveAt,
      },
      daily,
    });
  } catch (err: any) {
    logger.warn({ err: err?.message }, "adminFxHealth: data load failed");
    res.status(500).json({ ok: false, message: "Failed to load FX health data" }); // i18n-ignore
  }
});

// ── GET /api/admin/fx-health/dashboard — HTML viewer ─────────────────────────
//
// No auth on the page shell itself — the JS fetches /api/admin/fx-health with
// the token stored in localStorage, mirroring the funnels dashboard pattern.

router.get("/admin/fx-health/dashboard", (_req, res) => {
  res.type("html").send(DASHBOARD_HTML);
});

const DASHBOARD_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FX Rate Health — Presentail Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; font-size: 13px; color: #222; background: #f5f5f5; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  h2 { font-size: 14px; margin: 24px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  .toolbar label { font-weight: 600; font-size: 12px; }
  input[type=password], input[type=number], select { padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; }
  button { padding: 4px 14px; border: none; border-radius: 4px; background: #3366cc; color: #fff; cursor: pointer; font-size: 12px; }
  button:hover { background: #254fa8; }
  #status { font-size: 12px; color: #666; }
  .status-card { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; min-width: 160px; flex: 1; }
  .card-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .card-value { font-size: 20px; font-weight: 700; }
  .card-value.ok { color: #109618; }
  .card-value.warn { color: #e6a800; }
  .card-value.error { color: #dc3912; }
  .card-sub { font-size: 11px; color: #888; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
  th { background: #f0f0f0; text-align: left; padding: 6px 10px; font-size: 11px; font-weight: 700; color: #555; }
  td { padding: 5px 10px; border-top: 1px solid #eee; }
  tr:hover td { background: #f9f9f9; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.zero { color: #bbb; }
  td.nonzero { color: #dc3912; font-weight: 600; }
  .trends { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
  .trend-cell { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; min-width: 200px; }
  .trend-label { font-size: 11px; color: #555; margin-bottom: 4px; }
  .trend-cell svg { display: block; width: 100%; height: 44px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 8px; }
  a.back { font-size: 12px; color: #3366cc; text-decoration: none; display: inline-block; margin-bottom: 12px; }
  a.back:hover { text-decoration: underline; }
</style>
</head>
<body>
<a class="back" href="/api/admin/funnels">&larr; Back to funnels dashboard</a>
<h1>FX Rate Health</h1>
<div class="toolbar">
  <label for="token">Admin token</label>
  <input type="password" id="token" placeholder="Paste PUSH_ADMIN_TOKEN" size="32">
  <label for="days">Days</label>
  <select id="days">
    <option value="7">7</option>
    <option value="14" selected>14</option>
    <option value="30">30</option>
  </select>
  <button id="refresh">Load</button>
  <span id="status"></span>
</div>

<h2>Current status (live in-process)</h2>
<div class="status-card">
  <div class="card">
    <div class="card-label">Rate source</div>
    <div class="card-value" id="curSource">—</div>
    <div class="card-sub">live = open.er-api.com · fallback = embedded static rates</div>
  </div>
  <div class="card">
    <div class="card-label">Consecutive failure cycles</div>
    <div class="card-value" id="curFailures">—</div>
    <div class="card-sub">Each cycle is one 5-min retry window</div>
  </div>
  <div class="card">
    <div class="card-label">Last live fetch</div>
    <div class="card-value" style="font-size:13px" id="curLastLive">—</div>
    <div class="card-sub" id="curLastLiveSub"></div>
  </div>
  <div class="card">
    <div class="card-label">Cache fetched at</div>
    <div class="card-value" style="font-size:13px" id="curFetchedAt">—</div>
  </div>
</div>

<h2>Fallback events per day</h2>
<div class="sub">Each <code>fx_rates_fallback</code> analytics event is emitted by <code>GET /api/fx/rates</code> when it serves embedded static rates instead of live rates. Higher counts on a given day mean more rate-serve requests hit during a fallback window. Zero is healthy.</div>
<div class="trends" id="fallbackTrends"></div>
<table id="dailyTable">
  <thead>
    <tr>
      <th>Day (UTC)</th>
      <th style="text-align:right">Fallback events</th>
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

  var curSource = document.getElementById('curSource');
  var curFailures = document.getElementById('curFailures');
  var curLastLive = document.getElementById('curLastLive');
  var curLastLiveSub = document.getElementById('curLastLiveSub');
  var curFetchedAt = document.getElementById('curFetchedAt');

  var fallbackTrends = document.getElementById('fallbackTrends');
  var dailyBody = document.querySelector('#dailyTable tbody');

  // Restore saved token (shared with the funnels dashboard)
  var saved = localStorage.getItem(TOKEN_KEY);
  if (saved) tokenEl.value = saved;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTs(ms) {
    if (!ms) return 'never in this process';
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  }

  function fmtAgo(ms) {
    if (!ms) return '';
    var diffH = (Date.now() - ms) / 3600000;
    if (diffH < 1) return Math.round(diffH * 60) + ' min ago';
    return diffH.toFixed(1) + ' h ago';
  }

  function renderSparkline(days, values) {
    var width = 240, height = 44, pad = 3;
    var n = days.length;
    var maxY = Math.max.apply(null, values.concat([1]));
    var w = width - 2 * pad, h = height - 2 * pad;
    function x(i) { return pad + (n <= 1 ? w / 2 : (i / (n - 1)) * w); }
    function y(v) { return pad + h - (v / maxY) * h; }
    var d = '', started = false, lastPx = 0, lastPy = 0;
    values.forEach(function (v, i) {
      var px = x(i), py = y(v);
      d += (started ? ' L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
      started = true;
      lastPx = px; lastPy = py;
    });
    var color = '#dc3912';
    var dot = values.length === 1
      ? '<circle cx="' + lastPx.toFixed(1) + '" cy="' + lastPy.toFixed(1) + '" r="2" fill="' + color + '" />'
      : '';
    var axis = '<line x1="' + pad + '" y1="' + (height - pad) + '" x2="' + (width - pad) + '" y2="' + (height - pad) + '" stroke="#ccc" stroke-width="0.5" />';
    var maxLabel = '<text x="' + (width - pad) + '" y="' + (pad + 8) + '" font-size="9" text-anchor="end" fill="#999">' + maxY + '</text>';
    return '<svg viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">' + axis + '<path d="' + d + '" stroke="' + color + '" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />' + dot + maxLabel + '</svg>';
  }

  function render(data) {
    var src = data.currentStatus.source;
    curSource.textContent = src;
    curSource.className = 'card-value ' + (src === 'live' ? 'ok' : 'warn');

    var cf = data.currentStatus.consecutiveFailures;
    curFailures.textContent = cf;
    curFailures.className = 'card-value ' + (cf === 0 ? 'ok' : cf < 12 ? 'warn' : 'error');

    curLastLive.textContent = fmtTs(data.currentStatus.lastLiveAt);
    curLastLiveSub.textContent = fmtAgo(data.currentStatus.lastLiveAt);

    curFetchedAt.textContent = fmtTs(data.currentStatus.fetchedAt);

    var daily = data.daily;
    var days = daily.map(function (r) { return r.day; });
    var vals = daily.map(function (r) { return r.fallbackCount; });
    fallbackTrends.innerHTML = '';
    var cell = document.createElement('div');
    cell.className = 'trend-cell';
    cell.innerHTML = '<div class="trend-label">Fallback events / day</div>' + renderSparkline(days, vals);
    fallbackTrends.appendChild(cell);

    dailyBody.innerHTML = '';
    var reversed = daily.slice().reverse();
    reversed.forEach(function (r) {
      var tr = document.createElement('tr');
      var isZero = r.fallbackCount === 0;
      tr.innerHTML =
        '<td>' + escapeHtml(r.day) + '</td>' +
        '<td class="num ' + (isZero ? 'zero' : 'nonzero') + '">' + r.fallbackCount + '</td>';
      dailyBody.appendChild(tr);
    });
  }

  function load() {
    var token = tokenEl.value.trim();
    if (!token) { statusEl.textContent = 'Paste the admin token first.'; return; }
    localStorage.setItem(TOKEN_KEY, token);
    var days = daysEl.value;
    statusEl.textContent = 'Loading\u2026';
    refreshBtn.disabled = true;
    fetch('/api/admin/fx-health?days=' + days, {
      headers: { 'x-push-admin-token': token }
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        statusEl.textContent = 'Loaded ' + new Date().toLocaleTimeString();
        render(data);
      })
      .catch(function (err) {
        statusEl.textContent = 'Error: ' + err.message;
      })
      .finally(function () {
        refreshBtn.disabled = false;
      });
  }

  refreshBtn.addEventListener('click', load);

  if (tokenEl.value) load();
})();
</script>
</body>
</html>`;

export default router;

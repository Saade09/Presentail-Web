/**
 * Admin API for collection ranking config CRUD + scored-list view.
 *
 * Endpoints:
 *   GET  /api/admin/collection-ranking              → HTML admin dashboard (browser-accessible)
 *   GET  /api/admin/collection-ranking/ranked       → JSON scored+ranked list (auth-gated)
 *   PUT  /api/admin/collection-ranking/:kind/:slug  → upsert a config row (auth-gated)
 *
 * Auth: x-push-admin-token / x-admin-token header (PUSH_ADMIN_TOKEN env).
 * The HTML page is served without auth — it prompts for the token in-page and
 * caches it in localStorage, matching the /api/admin/funnels pattern.
 *
 * After a successful PUT the ranking config cache is invalidated so the next
 * homepage request reflects the change without waiting for the 5-min TTL.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { checkAdminToken } from "../lib/admin-auth";
import { db } from "@workspace/db";
import { collectionRankingConfigTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  invalidateRankingConfigCache,
  getRankingConfig,
  buildOsCategoriesRaw,
  buildOsOccasionsRaw,
} from "./homepage";
import { getOsProducts } from "../lib/osProductsCache";
import {
  scoreCollections,
  getCollectionClickScores,
  type CollectionKind,
} from "../lib/collectionRanking";
import type { ScoreDebug } from "../lib/collectionRanking";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  return checkAdminToken(req, res);
}

/** Resolve store key from countryCode, matching homepage.ts logic. */
function resolveStoreKey(countryCode?: string | null): string {
  if (countryCode === "AE") return "dubai";
  if (countryCode === "CY") return "cyprus";
  return "lebanon";
}

const DEFAULT_OCCASION_SLUGS = [
  "birthday", "love-romance", "congratulations", "thank-you", "get-well-soon",
  "new-born", "anniversary", "wedding", "katb-kitab", "graduation",
  "housewarming", "im-sorry", "funeral",
];

/** Occasions that should be seeded as hidden=true on first startup. */
const SEED_HIDDEN_OCCASION_SLUGS = ["summer"];

/**
 * Idempotent startup seed: ensures default hidden config rows exist for
 * occasions that should never appear on the homepage by default.
 * Called once from index.ts after the DB is ready.
 */
export async function seedRankingConfigDefaults(): Promise<void> {
  try {
    for (const slug of SEED_HIDDEN_OCCASION_SLUGS) {
      const existing = await db
        .select()
        .from(collectionRankingConfigTable)
        .where(
          and(
            eq(collectionRankingConfigTable.kind, "occasion"),
            eq(collectionRankingConfigTable.slug, slug),
            eq(collectionRankingConfigTable.countryCode, null as unknown as string),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        await db.insert(collectionRankingConfigTable).values({
          kind: "occasion",
          slug,
          countryCode: null,
          citySlug: null,
          manualBoost: 0,
          pinnedPosition: null,
          hiddenOverride: true,
          seasonalBoosts: [],
        });
      }
    }
  } catch {
    // Non-fatal: log nothing — DB may not be available yet on first cold start
  }
}

// GET /api/admin/collection-ranking — HTML admin dashboard (no auth required; token entered in-page)
router.get("/admin/collection-ranking", (_req, res) => {
  res.type("html").send(ADMIN_UI_HTML);
});

// GET /api/admin/collection-ranking/ranked?kind=category|occasion&countryCode=LB|AE|CY
// Returns the full scored+ranked list with debug info and inStockCount.
router.get("/admin/collection-ranking/ranked", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const kind = req.query.kind === "occasion" ? "occasion" : "category";
  const countryCode =
    typeof req.query.countryCode === "string"
      ? req.query.countryCode.toUpperCase()
      : "LB";
  const citySlug =
    typeof req.query.citySlug === "string" && req.query.citySlug.trim()
      ? req.query.citySlug.trim()
      : null;

  try {
    const raw =
      kind === "category" ? buildOsCategoriesRaw() : buildOsOccasionsRaw();

    if (!raw || raw.length === 0) {
      return res.json({ ok: true, kind, countryCode, citySlug, items: [] });
    }

    const [configRows, clickScores] = await Promise.all([
      getRankingConfig(),
      getCollectionClickScores(kind as CollectionKind, countryCode).catch(
        () => new Map<string, number>(),
      ),
    ]);

    const storeKey = resolveStoreKey(countryCode);
    const osProducts = getOsProducts(storeKey) ?? [];

    const { items, debugMap } = scoreCollections(raw, {
      kind: kind as CollectionKind,
      countryCode,
      citySlug,
      configRows,
      osProducts,
      clickScores,
      defaultOrder: kind === "occasion" ? DEFAULT_OCCASION_SLUGS : [],
      availabilityFloor: 3,
    });

    // Import findConfigRow from the ranking lib so admin uses the same 3-tier
    // resolution (city+country → country → global) as the live homepage.
    const { findConfigRow } = await import("../lib/collectionRanking");

    const ranked = items.map((item, idx) => {
      const debug: ScoreDebug | undefined = debugMap.get(item.slug);
      const cfg = findConfigRow(configRows, kind as CollectionKind, item.slug, countryCode, citySlug);
      return {
        rank: idx + 1,
        id: item.id,
        name: item.name,
        slug: item.slug,
        imageUrl: item.imageUrl,
        inStockCount: debug?.productCount ?? 0,
        source: debug?.source ?? "default",
        debug: debug ?? null,
        config: cfg
          ? {
              id: cfg.id,
              manualBoost: cfg.manualBoost,
              pinnedPosition: cfg.pinnedPosition ?? null,
              hiddenOverride: cfg.hiddenOverride,
              seasonalBoosts: cfg.seasonalBoosts ?? [],
              countryCode: cfg.countryCode ?? null,
              citySlug: cfg.citySlug ?? null,
            }
          : null,
      };
    });

    return res.json({ ok: true, kind, countryCode, citySlug, items: ranked });
  } catch (err: unknown) {
    req.log.error(
      { err: (err as Error)?.message },
      "admin/collection-ranking/ranked: failed",
    );
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

// PUT /api/admin/collection-ranking/:kind/:slug — upsert a config row
router.put("/admin/collection-ranking/:kind/:slug", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const { kind, slug } = req.params;
  if (kind !== "category" && kind !== "occasion") {
    return res.status(400).json({ ok: false, message: "kind must be category or occasion" }); // i18n-ignore
  }
  if (!slug || typeof slug !== "string" || slug.trim() === "") {
    return res.status(400).json({ ok: false, message: "slug is required" }); // i18n-ignore
  }

  const body = req.body as {
    countryCode?: string | null;
    citySlug?: string | null;
    manualBoost?: number;
    pinnedPosition?: number | null;
    hiddenOverride?: boolean;
    seasonalBoosts?: Array<{ label: string; startMmDd: string; endMmDd: string; boost: number; targetPosition?: number | null }>;
  };

  // Validate seasonal boost date formats
  if (Array.isArray(body.seasonalBoosts)) {
    const mmDdRe = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    for (const sb of body.seasonalBoosts) {
      if (!mmDdRe.test(sb.startMmDd) || !mmDdRe.test(sb.endMmDd)) {
        return res.status(400).json({
          ok: false,
          message: `Invalid seasonal boost date format; expected MM-DD (e.g. 02-14): ${sb.startMmDd} / ${sb.endMmDd}`, // i18n-ignore
        });
      }
      if (typeof sb.boost !== "number" || !Number.isFinite(sb.boost) || sb.boost <= 0) {
        return res.status(400).json({
          ok: false,
          message: "Seasonal boost value must be a positive finite number", // i18n-ignore
        });
      }
      if (!sb.label || typeof sb.label !== "string" || sb.label.trim() === "") {
        return res.status(400).json({
          ok: false,
          message: "Seasonal boost label is required", // i18n-ignore
        });
      }
    }
  }

  const manualBoost = typeof body.manualBoost === "number" ? body.manualBoost : undefined;
  const pinnedPosition =
    body.pinnedPosition === null || body.pinnedPosition === undefined
      ? body.pinnedPosition
      : typeof body.pinnedPosition === "number" && Number.isFinite(body.pinnedPosition)
        ? body.pinnedPosition
        : undefined;
  const hiddenOverride = typeof body.hiddenOverride === "boolean" ? body.hiddenOverride : undefined;
  const countryCode =
    body.countryCode === undefined ? undefined : body.countryCode ?? null;
  const citySlug =
    body.citySlug === undefined
      ? undefined
      : typeof body.citySlug === "string" && body.citySlug.trim()
        ? body.citySlug.trim()
        : null;
  const seasonalBoosts = Array.isArray(body.seasonalBoosts)
    ? (body.seasonalBoosts as { label: string; startMmDd: string; endMmDd: string; boost: number; targetPosition?: number | null }[]).map((b) => ({
        ...b,
        targetPosition: b.targetPosition ?? undefined,
      }))
    : undefined;

  try {
    const existing = await db
      .select()
      .from(collectionRankingConfigTable)
      .where(
        and(
          eq(collectionRankingConfigTable.kind, kind),
          eq(collectionRankingConfigTable.slug, slug),
          countryCode !== undefined
            ? eq(collectionRankingConfigTable.countryCode, countryCode as string)
            : eq(collectionRankingConfigTable.countryCode, null as unknown as string),
          citySlug !== undefined
            ? eq(collectionRankingConfigTable.citySlug, citySlug as string)
            : eq(collectionRankingConfigTable.citySlug, null as unknown as string),
        ),
      )
      .limit(1);

    let row;
    if (existing.length > 0) {
      const updates: Partial<typeof collectionRankingConfigTable.$inferInsert> = {};
      if (manualBoost !== undefined) updates.manualBoost = manualBoost;
      if (pinnedPosition !== undefined) updates.pinnedPosition = pinnedPosition as number | null;
      if (hiddenOverride !== undefined) updates.hiddenOverride = hiddenOverride;
      if (seasonalBoosts !== undefined) updates.seasonalBoosts = seasonalBoosts;
      if (countryCode !== undefined) updates.countryCode = countryCode;
      if (citySlug !== undefined) updates.citySlug = citySlug;

      const updated = await db
        .update(collectionRankingConfigTable)
        .set(updates)
        .where(eq(collectionRankingConfigTable.id, existing[0].id))
        .returning();
      row = updated[0];
    } else {
      const inserted = await db
        .insert(collectionRankingConfigTable)
        .values({
          kind: kind as "category" | "occasion",
          slug,
          countryCode: countryCode ?? null,
          citySlug: citySlug ?? null,
          manualBoost: manualBoost ?? 0,
          pinnedPosition: (pinnedPosition as number | null) ?? null,
          hiddenOverride: hiddenOverride ?? false,
          seasonalBoosts: seasonalBoosts ?? [],
        })
        .returning();
      row = inserted[0];
    }

    invalidateRankingConfigCache();

    return res.json({ ok: true, row });
  } catch (err: unknown) {
    req.log.error(
      { err: (err as Error)?.message },
      "admin/collection-ranking: DB upsert failed",
    );
    return res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

export default router;

// ── HTML admin dashboard ───────────────────────────────────────────────────

const ADMIN_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collection Ranking Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; background: #f5f5f5; color: #222; }
  h1 { font-size: 18px; font-weight: 600; }
  h2 { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
  .page { max-width: 1200px; margin: 0 auto; padding: 20px 16px; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  .auth-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  input[type=text], input[type=password], input[type=number] {
    border: 1px solid #ccc; border-radius: 4px; padding: 4px 8px; font-size: 13px;
  }
  input[type=text]:focus, input[type=password]:focus, input[type=number]:focus {
    outline: none; border-color: #0078d4;
  }
  button {
    padding: 5px 12px; border-radius: 4px; font-size: 13px; cursor: pointer;
    border: 1px solid #ccc; background: #fff; transition: background 0.1s;
  }
  button:hover { background: #f0f0f0; }
  button.primary { background: #0078d4; color: #fff; border-color: #0078d4; }
  button.primary:hover { background: #006abc; }
  button.danger { background: #c42b1c; color: #fff; border-color: #c42b1c; }
  button.danger:hover { background: #a82315; }
  button:disabled { opacity: 0.5; cursor: default; }
  .status { font-size: 12px; }
  .status.err { color: #c42b1c; }
  .status.ok { color: #107c10; }
  .status.muted { color: #888; }
  .tabs { display: flex; gap: 2px; margin-bottom: 16px; border-bottom: 2px solid #ddd; }
  .tab {
    padding: 8px 18px; cursor: pointer; border-radius: 4px 4px 0 0;
    border: 1px solid transparent; border-bottom: none; font-size: 13px;
    background: transparent; color: #555;
  }
  .tab:hover { background: #f0f0f0; }
  .tab.active { background: #fff; border-color: #ddd; color: #0078d4; font-weight: 600; margin-bottom: -2px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f0f0f0; border-bottom: 1px solid #ddd; font-weight: 600; white-space: nowrap; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr.zero-stock td { background: #fff5f5; }
  tr.zero-stock td:first-child { border-left: 3px solid #c42b1c; }
  tr.hidden-item { opacity: 0.5; }
  .badge { display: inline-block; padding: 1px 5px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-red { background: #fde8e6; color: #c42b1c; border: 1px solid #f4b8b3; }
  .badge-blue { background: #ddeeff; color: #0052a3; border: 1px solid #b3d4f7; }
  .badge-green { background: #e6f4ea; color: #107c10; border: 1px solid #afd8b2; }
  .badge-grey { background: #eee; color: #666; border: 1px solid #ddd; }
  .score-breakdown { font-size: 11px; color: #555; white-space: nowrap; }
  .score-breakdown span { margin-right: 6px; }
  .score-breakdown .pos { color: #107c10; }
  .score-breakdown .neg { color: #c42b1c; }
  .score-breakdown .neutral { color: #555; }
  .editor { background: #fafafa; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin-top: 6px; }
  .editor-row { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; }
  .editor-row label { font-weight: 600; min-width: 120px; padding-top: 5px; font-size: 12px; }
  .editor-row .field { display: flex; flex-direction: column; gap: 3px; }
  .editor-hint { font-size: 10px; color: #888; }
  .seasonal-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .seasonal-table th { font-size: 11px; padding: 3px 6px; background: #eee; }
  .seasonal-table td { padding: 3px 6px; }
  .seasonal-table input { width: 100%; font-size: 11px; }
  .editor-actions { display: flex; gap: 8px; margin-top: 10px; }
  .empty { color: #888; font-style: italic; }
  .rank-num { font-weight: 700; color: #333; min-width: 24px; display: inline-block; text-align: right; }
  .pinned-indicator { font-size: 10px; color: #0078d4; margin-left: 4px; }
  .name-cell { max-width: 160px; }
  .name-cell strong { display: block; }
  .name-cell small { color: #888; font-size: 11px; }
  .loader { text-align: center; padding: 24px; color: #888; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <h1>Collection Ranking Admin</h1>
    <div class="auth-row">
      <input type="password" id="tokenEl" placeholder="Admin token" size="28">
      <button class="primary" id="loadBtn">Load</button>
      <span class="status muted" id="statusEl"></span>
    </div>
  </div>

  <!-- Country tabs -->
  <div class="tabs" id="countryTabs">
    <button class="tab active" data-country="LB">Lebanon</button>
    <button class="tab" data-country="AE">UAE</button>
    <button class="tab" data-country="CY">Cyprus</button>
  </div>

  <!-- Kind tabs -->
  <div class="tabs" id="kindTabs">
    <button class="tab active" data-kind="category">Categories</button>
    <button class="tab" data-kind="occasion">Occasions</button>
  </div>

  <!-- City filter (optional — shows ranked view for a specific city scope) -->
  <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:13px">
    <label style="font-weight:600">City scope:</label>
    <select id="citySelect" style="font-size:13px;padding:4px 8px;border:1px solid #ccc;border-radius:4px">
      <option value="">(All cities — country-level)</option>
    </select>
    <span style="color:#888;font-size:12px">Applies 3-tier resolution: city &rsaquo; country &rsaquo; global</span>
  </div>

  <div class="card">
    <div id="tableContainer"><div class="loader">Enter the admin token to load.</div></div>
  </div>
</div>

<script>
(function () {
  var TOKEN_KEY = 'presentail_admin_token';
  var tokenEl = document.getElementById('tokenEl');
  var loadBtn = document.getElementById('loadBtn');
  var statusEl = document.getElementById('statusEl');
  var tableContainer = document.getElementById('tableContainer');

  // Item list populated on every load — editors reference by index, avoiding
  // JSON serialization inside HTML onclick attributes.
  var ITEMS = [];

  var CITY_OPTIONS = {
    LB: [{value:'',label:'(Country-level)'},{value:'beirut',label:'Beirut'},{value:'tripoli',label:'Tripoli'},{value:'sidon',label:'Sidon'}],
    AE: [{value:'',label:'(Country-level)'},{value:'dubai',label:'Dubai'},{value:'abu-dhabi',label:'Abu Dhabi'}],
    CY: [{value:'',label:'(Country-level)'},{value:'limassol',label:'Limassol'},{value:'nicosia',label:'Nicosia'}],
  };
  var state = { country: 'LB', kind: 'category', token: '', city: '' };
  var citySelect = document.getElementById('citySelect');
  var openPanelId = null;

  try { tokenEl.value = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) {}

  function updateCityOptions() {
    var opts = CITY_OPTIONS[state.country] || [{value:'',label:'(Country-level)'}];
    citySelect.innerHTML = opts.map(function(o){ return '<option value="' + escapeHtml(o.value) + '">' + escapeHtml(o.label) + '</option>'; }).join('');
    state.city = '';
  }
  updateCityOptions();
  citySelect.addEventListener('change', function () { state.city = citySelect.value; load(); });

  document.getElementById('countryTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-country]');
    if (!btn) return;
    document.querySelectorAll('#countryTabs .tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    state.country = btn.dataset.country;
    updateCityOptions();
    load();
  });

  document.getElementById('kindTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-kind]');
    if (!btn) return;
    document.querySelectorAll('#kindTabs .tab').forEach(function (t) { t.classList.remove('active'); });
    btn.classList.add('active');
    state.kind = btn.dataset.kind;
    load();
  });

  loadBtn.addEventListener('click', load);
  tokenEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') load(); });

  if (tokenEl.value.trim()) setTimeout(load, 0);

  function load() {
    var token = tokenEl.value.trim();
    if (!token) { setStatus('Enter the admin token.', 'err'); return; }
    state.token = token;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}

    setStatus('Loading\u2026', 'muted');
    tableContainer.innerHTML = '<div class="loader">Loading\u2026</div>';

    var rankedUrl = '/api/admin/collection-ranking/ranked?kind=' + encodeURIComponent(state.kind) + '&countryCode=' + encodeURIComponent(state.country);
    if (state.city) rankedUrl += '&citySlug=' + encodeURIComponent(state.city);
    fetch(rankedUrl, {
      headers: { 'x-push-admin-token': token }
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('Invalid admin token');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.ok) throw new Error(data.message || 'Load failed');
        ITEMS = data.items || [];
        renderTable(ITEMS);
        setStatus('Loaded ' + ITEMS.length + ' ' + state.kind + 's for ' + countryLabel(state.country) + '.', 'ok');
      })
      .catch(function (err) {
        setStatus('Error: ' + err.message, 'err');
        tableContainer.innerHTML = '<div class="loader" style="color:#c42b1c">' + escapeHtml(err.message) + '</div>';
      });
  }

  function countryLabel(cc) {
    return cc === 'LB' ? 'Lebanon' : cc === 'AE' ? 'UAE' : cc === 'CY' ? 'Cyprus' : cc;
  }

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (cls || 'muted');
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n, decimals) {
    if (n == null) return '<span style="color:#ccc">\u2014</span>';
    return Number(n).toFixed(decimals != null ? decimals : 3);
  }

  function renderTable(items) {
    if (!items.length) {
      tableContainer.innerHTML = '<div class="empty" style="padding:16px">No collections found. The OS cache may be cold.</div>';
      return;
    }

    var html = '<table><thead><tr>' +
      '<th>#</th><th>Collection</th><th>In\u00a0Stock</th><th>Final\u00a0Score</th>' +
      '<th>Score Breakdown</th><th>Source</th><th>Config</th><th>Actions</th>' +
      '</tr></thead><tbody>';

    items.forEach(function (item, idx) {
      var cfg = item.config || {};
      var isZero = item.inStockCount === 0;
      var isHidden = cfg.hiddenOverride === true;
      var isPinned = cfg.pinnedPosition != null;
      var rowCls = isZero ? ' class="zero-stock"' : isHidden ? ' class="hidden-item"' : '';

      var rankCell = '<span class="rank-num">' + item.rank + '</span>';
      if (isPinned) rankCell += '<span class="pinned-indicator" title="Pinned to position ' + cfg.pinnedPosition + '">\uD83D\uDCCC</span>';

      var stockBadge = isZero
        ? '<span class="badge badge-red">0 in stock</span>'
        : '<span class="badge badge-green">' + item.inStockCount + '</span>';

      var nameCell = '<div class="name-cell"><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.slug) + '</small></div>';

      var d = item.debug || {};
      var finalScore = d.finalScore != null ? fmt(d.finalScore) : '\u2014';
      var breakdown = d.finalScore != null
        ? '<div class="score-breakdown">' +
            '<span class="neutral" title="Bayesian performance score">Perf:\u00a0' + fmt(d.performanceScore) + '</span>' +
            '<span class="pos" title="Recency-weighted click score">Clicks:\u00a0+' + fmt(d.clickScore) + '</span>' +
            (d.seasonalBoost ? '<span class="pos" title="Active seasonal boost">Season:\u00a0+' + fmt(d.seasonalBoost) + '</span>' : '') +
            (d.manualBoost ? '<span class="pos" title="Manual boost">Manual:\u00a0+' + fmt(d.manualBoost) + '</span>' : '') +
            (d.availabilityPenalty ? '<span class="neg" title="Availability penalty">Avail:\u00a0\u2212' + fmt(d.availabilityPenalty) + '</span>' : '') +
            (isPinned ? '\u00a0<span class="badge badge-blue" title="Pinned position overrides sort">Pin\u00a0' + cfg.pinnedPosition + '</span>' : '') +
          '</div>'
        : '<span class="empty">no data</span>';

      var configSummary = [];
      if (cfg.manualBoost) configSummary.push('boost:' + cfg.manualBoost);
      if (isPinned) configSummary.push('pin:' + cfg.pinnedPosition);
      if (isHidden) configSummary.push('<span class="badge badge-grey">hidden</span>');
      var seasonalCount = (cfg.seasonalBoosts || []).length;
      if (seasonalCount) configSummary.push(seasonalCount + ' seasonal');
      var configCell = configSummary.length ? configSummary.join(' \u00a0 ') : '<span class="empty">default</span>';

      var panelId = 'panel-' + idx;
      // Use data-idx attribute on the Edit button; click is handled via delegation below
      var actionsCell = '<button class="edit-btn" data-idx="' + idx + '">Edit</button>';
      if (!isHidden) {
        actionsCell += ' <button class="danger hide-btn" data-slug="' + escapeHtml(item.slug) + '" title="Hide this collection">Hide</button>';
      } else {
        actionsCell += ' <button class="show-btn" data-slug="' + escapeHtml(item.slug) + '" title="Show this collection">Show</button>';
      }

      var src = item.source || 'default';
      var sourceChip = src === 'pinned'
        ? '<span class="badge badge-blue">pinned</span>'
        : src === 'scheduled'
          ? '<span class="badge badge-green">scheduled</span>'
          : src === 'demand'
            ? '<span class="badge badge-grey">demand</span>'
            : '<span class="badge badge-grey">default</span>';

      html += '<tr' + rowCls + '>' +
        '<td>' + rankCell + '</td><td>' + nameCell + '</td><td>' + stockBadge + '</td>' +
        '<td>' + finalScore + '</td><td>' + breakdown + '</td><td>' + sourceChip + '</td>' +
        '<td>' + configCell + '</td>' +
        '<td>' + actionsCell + '</td>' +
        '</tr>' +
        '<tr id="' + panelId + '" style="display:none"><td colspan="8" style="padding:0 8px 8px">' +
          '<div class="editor" id="editor-' + idx + '"></div>' +
        '</td></tr>';
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;
    bindTableEvents();
  }

  // Delegated event binding — avoids any JS inside HTML onclick attributes
  function bindTableEvents() {
    tableContainer.addEventListener('click', function (e) {
      var editBtn = e.target.closest('.edit-btn');
      if (editBtn) { toggleEditor(parseInt(editBtn.dataset.idx, 10)); return; }

      var hideBtn = e.target.closest('.hide-btn');
      if (hideBtn) { quickHide(hideBtn.dataset.slug); return; }

      var showBtn = e.target.closest('.show-btn');
      if (showBtn) { quickUnhide(showBtn.dataset.slug); return; }

      var addSbBtn = e.target.closest('.add-sb-btn');
      if (addSbBtn) { addSeasonalRow(parseInt(addSbBtn.dataset.idx, 10)); return; }

      var rmSbBtn = e.target.closest('.rm-sb-btn');
      if (rmSbBtn) { rmSbBtn.closest('tr').remove(); return; }

      var saveBtn = e.target.closest('.save-editor-btn');
      if (saveBtn) { saveEditor(parseInt(saveBtn.dataset.idx, 10)); return; }

      var cancelBtn = e.target.closest('.cancel-editor-btn');
      if (cancelBtn) {
        var idx = parseInt(cancelBtn.dataset.idx, 10);
        var panelId = 'panel-' + idx;
        var row = document.getElementById(panelId);
        if (row) row.style.display = 'none';
        openPanelId = null;
        return;
      }
    });
  }

  function toggleEditor(idx) {
    var panelId = 'panel-' + idx;
    var panelRow = document.getElementById(panelId);
    if (!panelRow) return;

    // Close any previously open editor
    if (openPanelId && openPanelId !== panelId) {
      var prev = document.getElementById(openPanelId);
      if (prev) prev.style.display = 'none';
    }

    if (panelRow.style.display === 'none' || panelRow.style.display === '') {
      panelRow.style.display = '';
      openPanelId = panelId;
      renderEditor(idx);
    } else {
      panelRow.style.display = 'none';
      openPanelId = null;
    }
  }

  function renderEditor(idx) {
    var item = ITEMS[idx];
    if (!item) return;
    var editorEl = document.getElementById('editor-' + idx);
    if (!editorEl) return;

    var cfg = item.config || {};
    var seasonalBoosts = cfg.seasonalBoosts || [];
    var manualBoost = cfg.manualBoost != null ? cfg.manualBoost : 0;
    var pinnedPos = cfg.pinnedPosition != null ? cfg.pinnedPosition : '';
    var hiddenOverride = cfg.hiddenOverride === true;

    var seasonalRows = seasonalBoosts.map(function (b, i) {
      return '<tr>' +
        '<td><input type="text" class="sb-label" data-i="' + i + '" value="' + escapeHtml(b.label || '') + '" placeholder="e.g. Valentines" size="14"></td>' +
        '<td><input type="text" class="sb-start" data-i="' + i + '" value="' + escapeHtml(b.startMmDd || '') + '" placeholder="02-10" size="6"></td>' +
        '<td><input type="text" class="sb-end" data-i="' + i + '" value="' + escapeHtml(b.endMmDd || '') + '" placeholder="02-18" size="6"></td>' +
        '<td><input type="number" class="sb-boost" data-i="' + i + '" value="' + (b.boost || 0) + '" step="0.1" size="5"></td>' +
        '<td><input type="number" class="sb-target-pos" data-i="' + i + '" value="' + (b.targetPosition != null ? b.targetPosition : '') + '" placeholder="\u2014" min="1" step="1" size="4" title="Temporary pin position during this window"></td>' +
        '<td><button type="button" class="rm-sb-btn">\u2715</button></td>' +
        '</tr>';
    }).join('');

    editorEl.innerHTML =
      '<h2>Edit: ' + escapeHtml(item.slug) + ' <small style="font-weight:normal;color:#888">(' + countryLabel(state.country) + ')</small></h2>' +
      '<div class="editor-row">' +
        '<label>Manual Boost</label>' +
        '<div class="field">' +
          '<input type="number" id="mb-' + idx + '" value="' + manualBoost + '" step="0.1" style="width:80px">' +
          '<span class="editor-hint">Additive score bonus (e.g. 0.5 = moderate boost)</span>' +
        '</div>' +
      '</div>' +
      '<div class="editor-row">' +
        '<label>Pin Position</label>' +
        '<div class="field">' +
          '<input type="number" id="pp-' + idx + '" value="' + pinnedPos + '" min="1" step="1" style="width:80px" placeholder="\u2014">' +
          '<span class="editor-hint">1-based position. Leave blank to remove pin.</span>' +
        '</div>' +
      '</div>' +
      '<div class="editor-row">' +
        '<label>Hidden</label>' +
        '<div class="field">' +
          '<label style="display:flex;align-items:center;gap:6px;font-weight:normal">' +
            '<input type="checkbox" id="ho-' + idx + '"' + (hiddenOverride ? ' checked' : '') + '> Hide this collection entirely' +
          '</label>' +
          '<span class="editor-hint">When checked, excluded from homepage regardless of score.</span>' +
        '</div>' +
      '</div>' +
      '<div class="editor-row">' +
        '<label>Country Scope</label>' +
        '<div class="field">' +
          '<label style="display:flex;align-items:center;gap:6px;font-weight:normal">' +
            '<input type="checkbox" id="cs-' + idx + '"' + (cfg.countryCode ? ' checked' : '') + '> Apply to ' + countryLabel(state.country) + ' only' +
          '</label>' +
          '<span class="editor-hint">Unchecked = global override (all countries).</span>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:10px">' +
        '<h2>Seasonal Boosts <button type="button" class="add-sb-btn" data-idx="' + idx + '" style="font-size:11px;margin-left:6px">+ Add</button></h2>' +
        '<table class="seasonal-table">' +
          '<thead><tr><th>Label</th><th>Start (MM-DD)</th><th>End (MM-DD)</th><th>Boost</th><th>Target\u00a0Pos</th><th></th></tr></thead>' +
          '<tbody id="sb-body-' + idx + '">' + seasonalRows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="editor-actions">' +
        '<button type="button" class="primary save-editor-btn" data-idx="' + idx + '">Save</button>' +
        '<button type="button" class="cancel-editor-btn" data-idx="' + idx + '">Cancel</button>' +
        '<span class="status muted" id="save-status-' + idx + '"></span>' +
      '</div>' +
      '<div style="margin-top:24px;border-top:1px solid #e8e8e8;padding-top:16px">' +
        '<h2 style="font-size:15px;margin-bottom:8px">Contextual Descriptions</h2>' +
        '<div id="desc-panel-' + idx + '"><em style="color:#888">Loading descriptions&hellip;</em></div>' +
      '</div>';

    loadDescriptions(idx, item.slug, state.kind);
  }

  function loadDescriptions(idx, slug, kind) {
    var panel = document.getElementById('desc-panel-' + idx);
    if (!panel) return;

    fetch('/api/admin/page-descriptions?page_type=' + encodeURIComponent(kind) + '&slug=' + encodeURIComponent(slug), {
      headers: { 'x-push-admin-token': state.token },
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok || !Array.isArray(b.rows)) {
          panel.innerHTML = '<em style="color:#888">No descriptions found.</em>';
          return;
        }
        var rows = b.rows;
        if (!rows.length) {
          panel.innerHTML = '<em style="color:#888">No descriptions generated yet.</em>' +
            '<br><button type="button" class="primary" style="margin-top:8px;font-size:12px" onclick="generateAll(' + idx + ',\'' + escapeHtml(slug) + '\',\'' + escapeHtml(kind) + '\')">Generate All</button>';
          return;
        }

        // Group rows by language
        var langOrder = ['en', 'ar', 'fr'];
        var langLabels = { en: 'English', ar: 'Arabic', fr: 'French' };
        var byLang = {};
        rows.forEach(function (r) { (byLang[r.language] = byLang[r.language] || []).push(r); });

        var html = '<button type="button" style="float:right;font-size:11px;margin-bottom:4px" onclick="generateAll(' + idx + ',\'' + escapeHtml(slug) + '\',\'' + escapeHtml(kind) + '\')">Regenerate All</button>';

        langOrder.forEach(function (lang) {
          var langRows = byLang[lang] || [];
          if (!langRows.length) return;
          html += '<div style="margin-bottom:12px"><strong style="font-size:12px">' + (langLabels[lang] || lang) + '</strong>';
          langRows.forEach(function (r) {
            var statusColor = r.generationStatus === 'done' ? '#2d7a2d' : r.generationStatus === 'failed' ? '#b00' : '#888';
            var badges = '';
            if (r.isManualOverride) badges += ' <span style="background:#fff3cd;border:1px solid #ffc107;color:#856404;border-radius:4px;font-size:10px;padding:1px 5px">Manual</span>';
            if (r.failureReason === 'ai_unavailable') badges += ' <span style="background:#f8d7da;border:1px solid #f5c6cb;color:#721c24;border-radius:4px;font-size:10px;padding:1px 5px">AI Fallback</span>';

            html += '<div style="margin:4px 0 8px;padding:8px;border:1px solid #e8e8e8;border-radius:6px;background:#fafafa">' +
              '<div style="font-size:11px;color:#666;margin-bottom:4px">' +
                escapeHtml(r.deliveryAreaId) +
                ' <span style="color:' + statusColor + '">\u25cf ' + escapeHtml(r.generationStatus) + '</span>' +
                badges +
              '</div>' +
              '<textarea id="desc-text-' + r.id + '" rows="2" style="width:100%;box-sizing:border-box;font-size:12px;padding:4px;border:1px solid #ccc;border-radius:4px">' + escapeHtml(r.description || '') + '</textarea>' +
              '<div style="display:flex;gap:6px;margin-top:4px;align-items:center">' +
                '<button type="button" style="font-size:11px;padding:2px 8px" onclick="saveDesc(' + r.id + ',' + idx + ')">Save</button>' +
                '<button type="button" style="font-size:11px;padding:2px 8px" onclick="regenDesc(' + r.id + ',' + idx + ',\'' + escapeHtml(slug) + '\',\'' + escapeHtml(kind) + '\',\'' + escapeHtml(r.deliveryAreaId) + '\',\'' + lang + '\',' + (r.isManualOverride ? 'true' : 'false') + ')">Regen</button>' +
                '<span id="desc-status-' + r.id + '" style="font-size:11px;color:#888"></span>' +
              '</div>' +
            '</div>';
          });
          html += '</div>';
        });

        panel.innerHTML = html;
      })
      .catch(function (err) {
        if (panel) panel.innerHTML = '<em style="color:#b00">Failed to load: ' + escapeHtml(err.message) + '</em>';
      });
  }

  function saveDesc(id, idx) {
    var textarea = document.getElementById('desc-text-' + id);
    var statusEl = document.getElementById('desc-status-' + id);
    if (!textarea || !statusEl) return;
    var text = textarea.value.trim();
    if (!text) { statusEl.textContent = 'Cannot be empty'; statusEl.style.color = '#b00'; return; }
    statusEl.textContent = 'Saving\u2026';
    statusEl.style.color = '#888';

    fetch('/api/admin/page-descriptions/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify({ description: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) throw new Error(b.message || 'HTTP error');
        statusEl.textContent = 'Saved!';
        statusEl.style.color = '#2d7a2d';
        setTimeout(function () {
          var item = ITEMS[idx];
          if (item) loadDescriptions(idx, item.slug, state.kind);
        }, 800);
      })
      .catch(function (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '#b00';
      });
  }

  function regenDesc(id, idx, slug, kind, deliveryAreaId, lang, isManualOverride) {
    if (isManualOverride && !confirm('This has a manual override. Regenerate anyway?')) return;
    var statusEl = document.getElementById('desc-status-' + id);
    if (statusEl) { statusEl.textContent = 'Queued\u2026'; statusEl.style.color = '#888'; }

    fetch('/api/admin/page-descriptions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify({ page_type: kind, slug: slug, delivery_area_id: deliveryAreaId, language: lang, force: true }),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) throw new Error(b.message || 'HTTP error');
        setTimeout(function () {
          loadDescriptions(idx, slug, kind);
        }, 4000);
      })
      .catch(function (err) {
        if (statusEl) { statusEl.textContent = 'Error: ' + err.message; statusEl.style.color = '#b00'; }
      });
  }

  function generateAll(idx, slug, kind) {
    fetch('/api/admin/page-descriptions/generate-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify({ page_type: kind, slug: slug }),
    })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        if (!b.ok) throw new Error(b.message || 'HTTP error');
        var panel = document.getElementById('desc-panel-' + idx);
        if (panel) panel.innerHTML = '<em style="color:#888">Generation queued for ' + (b.count || 0) + ' combinations. Check back in a moment.</em>';
        setTimeout(function () {
          loadDescriptions(idx, slug, kind);
        }, 6000);
      })
      .catch(function (err) {
        alert('Error: ' + err.message);
      });
  }

  function addSeasonalRow(idx) {
    var tbody = document.getElementById('sb-body-' + idx);
    if (!tbody) return;
    var i = tbody.querySelectorAll('tr').length;
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><input type="text" class="sb-label" data-i="' + i + '" placeholder="e.g. Valentines" size="14"></td>' +
      '<td><input type="text" class="sb-start" data-i="' + i + '" placeholder="02-10" size="6"></td>' +
      '<td><input type="text" class="sb-end" data-i="' + i + '" placeholder="02-18" size="6"></td>' +
      '<td><input type="number" class="sb-boost" data-i="' + i + '" value="0.3" step="0.1" size="5"></td>' +
      '<td><input type="number" class="sb-target-pos" data-i="' + i + '" placeholder="\u2014" min="1" step="1" size="4" title="Temporary pin position during this window"></td>' +
      '<td><button type="button" class="rm-sb-btn">\u2715</button></td>';
    tbody.appendChild(tr);
  }

  function saveEditor(idx) {
    var item = ITEMS[idx];
    if (!item) return;

    var saveStatus = document.getElementById('save-status-' + idx);
    var saveBtn = document.querySelector('.save-editor-btn[data-idx="' + idx + '"]');

    var mbEl = document.getElementById('mb-' + idx);
    var ppEl = document.getElementById('pp-' + idx);
    var hoEl = document.getElementById('ho-' + idx);
    var csEl = document.getElementById('cs-' + idx);

    var manualBoost = mbEl ? parseFloat(mbEl.value) || 0 : 0;
    var rawPp = ppEl ? ppEl.value.trim() : '';
    var pinnedPosition = rawPp !== '' && !isNaN(parseInt(rawPp, 10)) ? parseInt(rawPp, 10) : null;
    var hiddenOverride = hoEl ? hoEl.checked : false;
    var countryScoped = csEl ? csEl.checked : false;

    var tbody = document.getElementById('sb-body-' + idx);
    var seasonalBoosts = [];
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        var label = tr.querySelector('.sb-label');
        var start = tr.querySelector('.sb-start');
        var end = tr.querySelector('.sb-end');
        var boost = tr.querySelector('.sb-boost');
        if (!start || !end || !boost) return;
        var startVal = (start.value || '').trim();
        var endVal = (end.value || '').trim();
        var boostVal = parseFloat(boost.value) || 0;
        var targetPosEl = tr.querySelector('.sb-target-pos');
        var targetPosRaw = targetPosEl ? targetPosEl.value.trim() : '';
        var targetPos = targetPosRaw !== '' && !isNaN(parseInt(targetPosRaw, 10)) ? parseInt(targetPosRaw, 10) : null;
        if (startVal && endVal) {
          var entry = {
            label: (label ? label.value.trim() : '') || startVal,
            startMmDd: startVal,
            endMmDd: endVal,
            boost: boostVal,
          };
          if (targetPos !== null) entry.targetPosition = targetPos;
          seasonalBoosts.push(entry);
        }
      });
    }

    var body = {
      manualBoost: manualBoost,
      pinnedPosition: pinnedPosition,
      hiddenOverride: hiddenOverride,
      seasonalBoosts: seasonalBoosts,
      countryCode: countryScoped ? state.country : null,
      citySlug: (countryScoped && state.city) ? state.city : null,
    };

    if (saveBtn) saveBtn.disabled = true;
    if (saveStatus) { saveStatus.textContent = 'Saving\u2026'; saveStatus.className = 'status muted'; }

    fetch('/api/admin/collection-ranking/' + encodeURIComponent(state.kind) + '/' + encodeURIComponent(item.slug), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (b) {
          if (!r.ok || !b.ok) throw new Error(b.message || 'HTTP ' + r.status);
          return b;
        });
      })
      .then(function () {
        if (saveStatus) { saveStatus.textContent = 'Saved!'; saveStatus.className = 'status ok'; }
        setTimeout(function () {
          var row = document.getElementById('panel-' + idx);
          if (row) row.style.display = 'none';
          openPanelId = null;
          load();
        }, 600);
      })
      .catch(function (err) {
        if (saveStatus) { saveStatus.textContent = 'Error: ' + err.message; saveStatus.className = 'status err'; }
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  function quickHide(slug) {
    if (!confirm('Hide "' + slug + '" from the homepage for ' + countryLabel(state.country) + '?')) return;
    fetch('/api/admin/collection-ranking/' + encodeURIComponent(state.kind) + '/' + encodeURIComponent(slug), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify({ hiddenOverride: true, countryCode: state.country }),
    }).then(function () { load(); }).catch(function (err) { setStatus('Error: ' + err.message, 'err'); });
  }

  function quickUnhide(slug) {
    fetch('/api/admin/collection-ranking/' + encodeURIComponent(state.kind) + '/' + encodeURIComponent(slug), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-push-admin-token': state.token },
      body: JSON.stringify({ hiddenOverride: false, countryCode: state.country }),
    }).then(function () { load(); }).catch(function (err) { setStatus('Error: ' + err.message, 'err'); });
  }
})();
</script>
</body>
</html>`;

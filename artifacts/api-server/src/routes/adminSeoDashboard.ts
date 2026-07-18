// Admin HTML dashboard for SEO quality monitoring.
//
// Auth: same x-push-admin-token localStorage pattern as /api/admin/funnels.
//
// Endpoints:
//   GET /api/admin/seo  — self-contained HTML page

import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

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

const DASHBOARD_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SEO Quality Dashboard – Presentail</title>
<style>
  :root{--teal:#00414e;--teal-light:#0a5663;--red:#d7263d;--amber:#f59e0b;--green:#16a34a;--blue:#3b82f6;--grey:#f3f4f6;--border:#e5e7eb}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;color:#111;font-size:14px}
  header{background:var(--teal);color:#fff;padding:16px 24px;display:flex;align-items:center;gap:16px}
  header h1{font-size:18px;font-weight:600}
  header .meta{font-size:12px;opacity:.75;margin-left:auto}
  .container{max-width:1100px;margin:0 auto;padding:24px}
  .card{background:#fff;border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:20px}
  .card h2{font-size:15px;font-weight:600;margin-bottom:12px;color:var(--teal)}
  .stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px}
  .stat{background:#fff;border:1px solid var(--border);border-radius:8px;padding:16px 24px;text-align:center;min-width:120px}
  .stat .val{font-size:28px;font-weight:700}
  .stat .lbl{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em}
  .critical .val{color:var(--red)}
  .warn .val{color:var(--amber)}
  .pass .val{color:var(--green)}
  .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase}
  .badge-critical{background:#fee2e2;color:var(--red)}
  .badge-warn{background:#fef3c7;color:#b45309}
  .badge-pass{background:#dcfce7;color:var(--green)}
  .badge-info{background:#dbeafe;color:var(--blue)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:8px 12px;background:var(--grey);font-weight:600;border-bottom:2px solid var(--border);white-space:nowrap}
  td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:top}
  tr:last-child td{border-bottom:none}
  .url-list{list-style:none;margin-top:4px}
  .url-list li a{color:var(--blue);word-break:break-all;font-size:12px}
  .url-list li{margin-bottom:2px}
  .recommendation{color:#6b7280;font-size:12px;margin-top:4px;line-height:1.5}
  .btn{display:inline-block;padding:8px 16px;background:var(--teal);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500}
  .btn:hover{background:var(--teal-light)}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  #token-prompt{max-width:420px;margin:80px auto;background:#fff;border:1px solid var(--border);border-radius:8px;padding:32px}
  #token-prompt h2{margin-bottom:12px;font-size:16px}
  #token-input{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:12px}
  .section-header{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  .section-header h2{margin-bottom:0}
  .no-data{color:#9ca3af;font-style:italic;font-size:13px}
  .loading{text-align:center;padding:40px;color:#6b7280}
  #run-status{margin-top:8px;font-size:12px;color:var(--green);display:none}
</style>
</head>
<body>
<div id="token-prompt" style="display:none">
  <h2>Admin Authentication</h2>
  <p style="font-size:13px;color:#6b7280;margin-bottom:12px">Enter your PUSH_ADMIN_TOKEN to access the SEO dashboard.</p>
  <input id="token-input" type="password" placeholder="Admin token" autocomplete="off">
  <button class="btn" onclick="saveToken()">Access Dashboard</button>
</div>
<div id="app" style="display:none">
  <header>
    <h1>🔍 SEO Quality Dashboard</h1>
    <div class="meta" id="run-meta">Loading…</div>
  </header>
  <div class="container">
    <div class="stats" id="stats-bar">
      <div class="stat critical"><div class="val" id="s-critical">–</div><div class="lbl">Critical</div></div>
      <div class="stat warn"><div class="val" id="s-warn">–</div><div class="lbl">Warnings</div></div>
      <div class="stat pass"><div class="val" id="s-pass">–</div><div class="lbl">Pass / Info</div></div>
      <div class="stat"><div class="val" id="s-total">–</div><div class="lbl">Total Checks</div></div>
      <div class="stat"><div class="val" id="s-duration">–</div><div class="lbl">Duration (s)</div></div>
    </div>
    <div class="card">
      <div class="section-header">
        <h2>Run New Audit</h2>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-bottom:12px">Triggers a fresh audit run asynchronously. Refresh the page in ~30 seconds to see results.</p>
      <button class="btn" id="run-btn" onclick="triggerRun()">Run Audit Now</button>
      <div id="run-status">✓ Audit started — refresh in ~30 seconds</div>
    </div>
    <div class="card" id="checks-card">
      <h2>Check Results (grouped by severity)</h2>
      <div id="checks-content" class="loading">Loading audit data…</div>
    </div>
    <div class="card">
      <h2>Audit History (last 10 runs)</h2>
      <div id="history-content" class="loading">Loading history…</div>
    </div>
  </div>
</div>
<script>
const TOKEN_KEY = 'seo_admin_token';
let token = localStorage.getItem(TOKEN_KEY);

function saveToken() {
  const val = document.getElementById('token-input').value.trim();
  if (!val) return;
  localStorage.setItem(TOKEN_KEY, val);
  token = val;
  init();
}

function authHeaders() {
  return { 'x-push-admin-token': token || '' };
}

async function apiFetch(path) {
  const r = await fetch(path, { headers: authHeaders() });
  if (r.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
    throw new Error('Unauthorized');
  }
  return r.json();
}

function severityOrder(s) {
  return s === 'critical' ? 0 : s === 'warn' ? 1 : s === 'info' ? 2 : 3;
}

function badgeHtml(severity) {
  return '<span class="badge badge-' + severity + '">' + severity + '</span>';
}

function renderChecks(checks) {
  if (!checks || checks.length === 0) {
    return '<p class="no-data">No checks available yet. Run an audit first.</p>';
  }
  const sorted = [...checks].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
  let html = '<table><thead><tr><th>Check</th><th>Severity</th><th>Affected URLs</th><th>Recommendation</th></tr></thead><tbody>';
  for (const c of sorted) {
    const urls = (c.affectedUrls || []).slice(0, 5);
    const urlList = urls.length
      ? '<ul class="url-list">' + urls.map(u => '<li><a href="' + u + '" target="_blank">' + u + '</a></li>').join('') + (c.affectedUrls.length > 5 ? '<li style="color:#9ca3af;font-size:12px">…and ' + (c.affectedUrls.length - 5) + ' more</li>' : '') + '</ul>'
      : '<span style="color:#9ca3af;font-size:12px">None</span>';
    const approval = c.requiresHumanApproval ? ' <span title="Requires human approval" style="color:#b45309;font-size:11px">⚠ human approval required</span>' : '';
    html += '<tr><td><strong>' + escHtml(c.label) + '</strong>' + approval + '</td><td>' + badgeHtml(c.severity) + '</td><td>' + urlList + '</td><td><div class="recommendation">' + escHtml(c.recommendation) + '</div></td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderHistory(rows) {
  if (!rows || rows.length === 0) {
    return '<p class="no-data">No history yet.</p>';
  }
  let html = '<table><thead><tr><th>Run At (UTC)</th><th>Triggered By</th><th>Duration</th><th>Total</th><th>Critical</th><th>Warn</th><th>Pass</th></tr></thead><tbody>';
  for (const r of rows) {
    const dt = new Date(r.runAt).toISOString().replace('T', ' ').slice(0, 19);
    const dur = r.durationMs != null ? (r.durationMs / 1000).toFixed(1) + 's' : '–';
    html += '<tr><td>' + dt + '</td><td>' + escHtml(r.triggeredBy) + '</td><td>' + dur + '</td><td>' + (r.totalChecks ?? '–') + '</td><td style="color:var(--red);font-weight:600">' + (r.criticalCount ?? 0) + '</td><td style="color:#b45309;font-weight:600">' + (r.warnCount ?? 0) + '</td><td>' + (r.passCount ?? 0) + '</td></tr>';
  }
  html += '</tbody></table>';
  return html;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadLatest() {
  try {
    const data = await apiFetch('/api/seo/audit/latest');
    if (!data.ok || !data.run) {
      document.getElementById('run-meta').textContent = 'No audit run yet';
      document.getElementById('checks-content').innerHTML = '<p class="no-data">No audit run yet. Click "Run Audit Now" to start.</p>';
      return;
    }
    const r = data.run;
    const dt = new Date(r.runAt).toISOString().replace('T',' ').slice(0,19) + ' UTC';
    document.getElementById('run-meta').textContent = 'Last run: ' + dt + ' · triggered by: ' + r.triggeredBy;
    document.getElementById('s-critical').textContent = r.criticalCount;
    document.getElementById('s-warn').textContent = r.warnCount;
    document.getElementById('s-pass').textContent = r.passCount;
    document.getElementById('s-total').textContent = r.totalChecks;
    document.getElementById('s-duration').textContent = r.durationMs != null ? (r.durationMs / 1000).toFixed(1) : '–';
    document.getElementById('checks-content').innerHTML = renderChecks(r.checks);
  } catch(e) {
    document.getElementById('checks-content').innerHTML = '<p class="no-data">Error loading audit data.</p>';
  }
}

async function loadHistory() {
  try {
    const data = await apiFetch('/api/seo/audit/history');
    document.getElementById('history-content').innerHTML = renderHistory(data.ok ? data.rows : []);
  } catch(e) {
    document.getElementById('history-content').innerHTML = '<p class="no-data">Error loading history.</p>';
  }
}

async function triggerRun() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  try {
    await fetch('/api/seo/audit/run', { method: 'POST', headers: authHeaders() });
    document.getElementById('run-status').style.display = 'block';
  } catch(e) {}
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Run Audit Now'; }, 5000);
}

function init() {
  if (!token) {
    document.getElementById('token-prompt').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    return;
  }
  document.getElementById('token-prompt').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadLatest();
  loadHistory();
}

init();
</script>
</body>
</html>`;

router.get("/admin/seo", (req, res) => {
  // The page authenticates itself via the localStorage token and the JS fetch
  // calls — same pattern as /api/admin/funnels. The HTML shell is public (no
  // server-side auth needed for the page itself).
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(DASHBOARD_HTML);
});

router.get("/admin/seo/data", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const [latest, history] = await Promise.all([
      import("../lib/seoAuditEngine").then((m) => m.getLatestAuditRun()),
      import("../lib/seoAuditEngine").then((m) => m.listAuditRunHistory()),
    ]);
    res.json({ ok: true, latest, history });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg }, "adminSeoDashboard: data fetch failed");
    res.status(500).json({ ok: false, message: "Failed to load SEO dashboard data" }); // i18n-ignore
  }
});

export default router;

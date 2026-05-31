// Daily SEO health digest — checks OG metadata for the key Presentail pages
// once per UTC day and sends a Slack alert when any page has a broken or
// missing OG image so regressions are caught before a shopper notices a blank
// link preview.
//
// A page is "failing" when any of the following is true:
//   • The page HTML could not be fetched (network error / non-200)
//   • No og:image tag was injected (SEO inject middleware miss)
//   • The OG image URL is not reachable (4xx / 5xx / network error)
//
// A page is "warned" (not failing, but degraded) when:
//   • The OG image dimensions are wrong (too narrow or wrong aspect ratio)
//   • The fallback site-wide image is being served instead of a page-specific one
//
// The alert fires once per UTC day even if the server restarts, because
// `lastEvaluatedDay` resets on restart and the monitor re-checks the previous
// day on the next hourly tick. Duplicate Slack messages on cold boot are
// acceptable because alerting is idempotent.
//
// Configuration (all optional):
//   SEO_AUDIT_MONITOR_ENABLED — "0" / "false" / "no" / "off" to disable.
//                               Default: enabled.

import { desc, eq, gte, lt } from "drizzle-orm";
import { db, monitorStateTable, seoAuditLogTable } from "@workspace/db";
import { logger } from "./logger";
import { sendAlert } from "./alerts";

const AUDIT_LOG_RETENTION_DAYS = 90;

const ENABLED = (() => {
  const v = (process.env.SEO_AUDIT_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

// Wake up hourly; evaluate the previous full UTC day once. A short tick
// ensures we alert even if the server restarts after midnight UTC.
const TICK_MS = 60 * 60 * 1000; // 1 h

// Key pages to audit — mirrors the KEY_PAGES list in the SEO debug UI.
// Covers all three countries and all supported language variants (EN, AR, FR)
// for every key page type (Homepage, Product, Brand, Category, Occasion) so a
// deploy that breaks OG injection only for a specific locale+page-type
// combination (e.g. ar-lb product pages) is caught the same day.
const KEY_PAGES: Array<{ label: string; url: string; locale: string }> = [
  // ── Lebanon ───────────────────────────────────────────────────────────────
  { locale: "LB", label: "Homepage (EN)",  url: "https://new.presentail.com/en-lb/beirut" },
  { locale: "LB", label: "Product (EN)",   url: "https://new.presentail.com/en-lb/beirut/product/pink-roses" },
  { locale: "LB", label: "Brand (EN)",     url: "https://new.presentail.com/en-lb/beirut/brand/roses-only" },
  { locale: "LB", label: "Category (EN)",  url: "https://new.presentail.com/en-lb/beirut/shop?category=flowers" },
  { locale: "LB", label: "Occasion (EN)",  url: "https://new.presentail.com/en-lb/beirut/shop?occasion=birthday" },
  { locale: "LB", label: "Homepage (AR)",  url: "https://new.presentail.com/ar-lb/beirut" },
  { locale: "LB", label: "Product (AR)",   url: "https://new.presentail.com/ar-lb/beirut/product/pink-roses" },
  { locale: "LB", label: "Brand (AR)",     url: "https://new.presentail.com/ar-lb/beirut/brand/roses-only" },
  { locale: "LB", label: "Category (AR)",  url: "https://new.presentail.com/ar-lb/beirut/shop?category=flowers" },
  { locale: "LB", label: "Occasion (AR)",  url: "https://new.presentail.com/ar-lb/beirut/shop?occasion=birthday" },
  { locale: "LB", label: "Homepage (FR)",  url: "https://new.presentail.com/fr-lb/beirut" },
  { locale: "LB", label: "Product (FR)",   url: "https://new.presentail.com/fr-lb/beirut/product/pink-roses" },
  { locale: "LB", label: "Brand (FR)",     url: "https://new.presentail.com/fr-lb/beirut/brand/roses-only" },
  { locale: "LB", label: "Category (FR)",  url: "https://new.presentail.com/fr-lb/beirut/shop?category=flowers" },
  { locale: "LB", label: "Occasion (FR)",  url: "https://new.presentail.com/fr-lb/beirut/shop?occasion=birthday" },
  // ── UAE ───────────────────────────────────────────────────────────────────
  { locale: "AE", label: "Homepage (EN)",  url: "https://new.presentail.com/en-ae/dubai" },
  { locale: "AE", label: "Product (EN)",   url: "https://new.presentail.com/en-ae/dubai/product/pink-roses" },
  { locale: "AE", label: "Brand (EN)",     url: "https://new.presentail.com/en-ae/dubai/brand/roses-only" },
  { locale: "AE", label: "Category (EN)",  url: "https://new.presentail.com/en-ae/dubai/shop?category=flowers" },
  { locale: "AE", label: "Occasion (EN)",  url: "https://new.presentail.com/en-ae/dubai/shop?occasion=birthday" },
  { locale: "AE", label: "Homepage (AR)",  url: "https://new.presentail.com/ar-ae/dubai" },
  { locale: "AE", label: "Product (AR)",   url: "https://new.presentail.com/ar-ae/dubai/product/pink-roses" },
  { locale: "AE", label: "Brand (AR)",     url: "https://new.presentail.com/ar-ae/dubai/brand/roses-only" },
  { locale: "AE", label: "Category (AR)",  url: "https://new.presentail.com/ar-ae/dubai/shop?category=flowers" },
  { locale: "AE", label: "Occasion (AR)",  url: "https://new.presentail.com/ar-ae/dubai/shop?occasion=birthday" },
  { locale: "AE", label: "Homepage (FR)",  url: "https://new.presentail.com/fr-ae/dubai" },
  { locale: "AE", label: "Product (FR)",   url: "https://new.presentail.com/fr-ae/dubai/product/pink-roses" },
  { locale: "AE", label: "Brand (FR)",     url: "https://new.presentail.com/fr-ae/dubai/brand/roses-only" },
  { locale: "AE", label: "Category (FR)",  url: "https://new.presentail.com/fr-ae/dubai/shop?category=flowers" },
  { locale: "AE", label: "Occasion (FR)",  url: "https://new.presentail.com/fr-ae/dubai/shop?occasion=birthday" },
  // ── Cyprus ────────────────────────────────────────────────────────────────
  { locale: "CY", label: "Homepage (EN)",  url: "https://new.presentail.com/en-cy/nicosia" },
  { locale: "CY", label: "Product (EN)",   url: "https://new.presentail.com/en-cy/nicosia/product/pink-roses" },
  { locale: "CY", label: "Brand (EN)",     url: "https://new.presentail.com/en-cy/nicosia/brand/roses-only" },
  { locale: "CY", label: "Category (EN)",  url: "https://new.presentail.com/en-cy/nicosia/shop?category=flowers" },
  { locale: "CY", label: "Occasion (EN)",  url: "https://new.presentail.com/en-cy/nicosia/shop?occasion=birthday" },
  { locale: "CY", label: "Homepage (AR)",  url: "https://new.presentail.com/ar-cy/nicosia" },
  { locale: "CY", label: "Product (AR)",   url: "https://new.presentail.com/ar-cy/nicosia/product/pink-roses" },
  { locale: "CY", label: "Brand (AR)",     url: "https://new.presentail.com/ar-cy/nicosia/brand/roses-only" },
  { locale: "CY", label: "Category (AR)",  url: "https://new.presentail.com/ar-cy/nicosia/shop?category=flowers" },
  { locale: "CY", label: "Occasion (AR)",  url: "https://new.presentail.com/ar-cy/nicosia/shop?occasion=birthday" },
  { locale: "CY", label: "Homepage (FR)",  url: "https://new.presentail.com/fr-cy/nicosia" },
  { locale: "CY", label: "Product (FR)",   url: "https://new.presentail.com/fr-cy/nicosia/product/pink-roses" },
  { locale: "CY", label: "Brand (FR)",     url: "https://new.presentail.com/fr-cy/nicosia/brand/roses-only" },
  { locale: "CY", label: "Category (FR)",  url: "https://new.presentail.com/fr-cy/nicosia/shop?category=flowers" },
  { locale: "CY", label: "Occasion (FR)",  url: "https://new.presentail.com/fr-cy/nicosia/shop?occasion=birthday" },
];

// ── Module state ────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
// Tracks the last UTC date (YYYY-MM-DD) we've evaluated so we fire once per
// day. Resets on process restart (a duplicate alert on cold boot is fine).
let lastEvaluatedDay: string | null = null;
// Cached result of the most recent completed audit run (scheduled or on-demand).
let lastAuditSummary: AuditSummary | null = null;

// ── Persistence helpers ──────────────────────────────────────────────────────

const MONITOR_STATE_KEY = "seo_audit_last";

/** Append one row to the seo_audit_log table (best-effort). */
async function appendAuditLog(
  summary: AuditSummary,
  runType: "scheduled" | "on_demand",
): Promise<void> {
  try {
    await db.insert(seoAuditLogTable).values({
      ranAt: new Date(summary.ranAt),
      runType,
      total: summary.total,
      failing: summary.failing,
      warned: summary.warned,
      passing: summary.passing,
    });
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditMonitor: failed to append audit log row",
    );
  }
}

/** Delete seo_audit_log rows older than AUDIT_LOG_RETENTION_DAYS (best-effort). */
async function pruneOldAuditLog(): Promise<void> {
  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - AUDIT_LOG_RETENTION_DAYS);
    await db.delete(seoAuditLogTable).where(lt(seoAuditLogTable.ranAt, cutoff));
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditMonitor: failed to prune old audit log rows",
    );
  }
}

/** Write the audit summary to the monitor_state table (best-effort). */
async function persistAuditSummary(summary: AuditSummary): Promise<void> {
  try {
    await db
      .insert(monitorStateTable)
      .values({ key: MONITOR_STATE_KEY, value: summary as unknown as Record<string, unknown> })
      .onConflictDoUpdate({
        target: monitorStateTable.key,
        set: {
          value: summary as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditMonitor: failed to persist audit summary — in-memory result still valid",
    );
  }
}

/**
 * Load the last persisted audit summary from the DB and populate the in-memory
 * cache.  Called once at startup so `getLastAuditSummary()` can serve a result
 * immediately, before the next scheduled run.
 */
async function loadPersistedAuditSummary(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(monitorStateTable)
      .where(eq(monitorStateTable.key, MONITOR_STATE_KEY))
      .limit(1);
    if (rows.length > 0) {
      lastAuditSummary = rows[0].value as unknown as AuditSummary;
      logger.info(
        { ranAt: lastAuditSummary?.ranAt },
        "seoAuditMonitor: loaded persisted audit summary from DB",
      );
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditMonitor: could not load persisted audit summary — will populate after next run",
    );
  }
}

// ── Internal helpers ────────────────────────────────────────────────────────

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function previousUtcDay(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDateString(d);
}

interface SeoPageResult {
  locale: string;
  label: string;
  url: string;
  ok: boolean;
  fetchFailed: boolean;
  ogImage: string | null;
  ogImageReachable: boolean | null;
  ogImageSizeOk: boolean | null;
  fallbackUsed: boolean;
  error?: string;
}

export function classifyResult(r: SeoPageResult): "error" | "warn" | "ok" {
  if (r.fetchFailed || !r.ogImage || r.ogImageReachable === false) return "error";
  if (r.ogImageSizeOk === false || r.fallbackUsed) return "warn";
  return "ok";
}

/** Reset internal monitor state. Only call from tests. */
export function __resetForTest(): void {
  lastEvaluatedDay = null;
  running = false;
  lastAuditSummary = null;
}

/** Return the cached result of the most recent completed audit, or null if no run has completed since the last restart. */
export function getLastAuditSummary(): AuditSummary | null {
  return lastAuditSummary;
}

export interface AuditHistoryRow {
  id: number;
  ranAt: string;
  runType: string;
  total: number;
  failing: number;
  warned: number;
  passing: number;
}

/**
 * Return up to `days` days of seo_audit_log rows ordered newest-first.
 * `days` is capped at 90 (the retention window).
 */
export async function getAuditHistory(days: number): Promise<AuditHistoryRow[]> {
  const cappedDays = Math.min(Math.max(1, days), 90);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - cappedDays);

  const rows = await db
    .select()
    .from(seoAuditLogTable)
    .where(gte(seoAuditLogTable.ranAt, cutoff))
    .orderBy(desc(seoAuditLogTable.ranAt));

  return rows.map((r) => ({
    id: r.id,
    ranAt: r.ranAt.toISOString(),
    runType: r.runType,
    total: r.total,
    failing: r.failing,
    warned: r.warned,
    passing: r.passing,
  }));
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Presentail-SeoAudit/1.0" },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseMetaTag(
  html: string,
  selector: { property?: string; name?: string },
): string | null {
  const attr = selector.property ? "property" : "name";
  const value = selector.property ?? selector.name ?? "";
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta\\s[^>]*${attr}="${esc}"[^>]*content="([^"]*)"`,
    "i",
  );
  let m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta\\s[^>]*content="([^"]*)"[^>]*${attr}="${esc}"`,
    "i",
  );
  m = re2.exec(html);
  return m ? m[1] : null;
}

async function checkImageReachable(imageUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const resp = await fetch(imageUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function checkOgImageSize(
  html: string,
  _imageUrl: string,
): boolean | null {
  // Use the declared og:image:width / og:image:height tags (fast, no extra
  // network request). If they're absent we skip the size check rather than
  // fetching the image bytes a second time.
  const rawW = parseMetaTag(html, { property: "og:image:width" });
  const rawH = parseMetaTag(html, { property: "og:image:height" });
  if (!rawW || !rawH) return null;
  const w = parseInt(rawW, 10);
  const h = parseInt(rawH, 10);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  const OG_MIN_WIDTH = 1200;
  const OG_TARGET_RATIO = 1.91;
  const OG_RATIO_TOLERANCE = 0.1;
  const widthOk = w >= OG_MIN_WIDTH;
  const ratioOk =
    Math.abs(w / h - OG_TARGET_RATIO) / OG_TARGET_RATIO <= OG_RATIO_TOLERANCE;
  return widthOk && ratioOk;
}

const DEFAULT_OG_IMAGE_PATH = "/opengraph.jpg";

async function auditPage(page: { locale: string; label: string; url: string }): Promise<SeoPageResult> {
  const html = await fetchPageHtml(page.url);
  if (!html) {
    return {
      locale: page.locale,
      label: page.label,
      url: page.url,
      ok: false,
      fetchFailed: true,
      ogImage: null,
      ogImageReachable: null,
      ogImageSizeOk: null,
      fallbackUsed: false,
      error: "Could not fetch page HTML",
    };
  }

  const ogImage = parseMetaTag(html, { property: "og:image" });
  const fallbackUsed = !ogImage || ogImage.endsWith(DEFAULT_OG_IMAGE_PATH);

  let ogImageReachable: boolean | null = null;
  let ogImageSizeOk: boolean | null = null;

  if (ogImage) {
    ogImageReachable = await checkImageReachable(ogImage);
    if (ogImageReachable) {
      ogImageSizeOk = checkOgImageSize(html, ogImage);
    }
  }

  return {
    locale: page.locale,
    label: page.label,
    url: page.url,
    ok: true,
    fetchFailed: false,
    ogImage,
    ogImageReachable,
    ogImageSizeOk,
    fallbackUsed,
  };
}

// ── On-demand audit (returns structured results, bypasses daily guard) ───────

export interface AuditPageResult {
  label: string;
  url: string;
  status: "error" | "warn" | "ok";
  ogImage: string | null;
  ogImageReachable: boolean | null;
  ogImageSizeOk: boolean | null;
  fallbackUsed: boolean;
  fetchFailed: boolean;
  error?: string;
}

export interface AuditSummary {
  ranAt: string;
  total: number;
  failing: number;
  warned: number;
  passing: number;
  pages: AuditPageResult[];
}

/**
 * Run the SEO audit immediately and return a structured summary.
 * Unlike `runOnce()`, this bypasses the "already evaluated today" guard and
 * is intended for on-demand use (e.g. admin endpoint after a deploy).
 * Throws with message "Audit already in progress" when a run is underway.
 */
export async function runAuditNow(): Promise<AuditSummary> {
  if (running) {
    throw new Error("Audit already in progress");
  }
  running = true;
  try {
    const ranAt = new Date().toISOString();
    logger.info(
      { pageCount: KEY_PAGES.length },
      "seoAuditMonitor: on-demand audit started",
    );

    const results = await Promise.all(KEY_PAGES.map(auditPage));

    const failing = results.filter((r) => classifyResult(r) === "error");
    const warned = results.filter((r) => classifyResult(r) === "warn");
    const passing = results.filter((r) => classifyResult(r) === "ok");

    logger.info(
      {
        total: results.length,
        failing: failing.length,
        warned: warned.length,
        passing: passing.length,
      },
      "seoAuditMonitor: on-demand audit complete",
    );

    const summary: AuditSummary = {
      ranAt,
      total: results.length,
      failing: failing.length,
      warned: warned.length,
      passing: passing.length,
      pages: results.map((r) => ({
        label: r.label,
        url: r.url,
        status: classifyResult(r),
        ogImage: r.ogImage,
        ogImageReachable: r.ogImageReachable,
        ogImageSizeOk: r.ogImageSizeOk,
        fallbackUsed: r.fallbackUsed,
        fetchFailed: r.fetchFailed,
        error: r.error,
      })),
    };
    lastAuditSummary = summary;
    await persistAuditSummary(summary);
    await appendAuditLog(summary, "on_demand");

    if (failing.length > 0 || warned.length > 0) {
      const localeOrder = ["LB", "AE", "CY"];
      const localeLabels: Record<string, string> = {
        LB: "Lebanon",
        AE: "UAE",
        CY: "Cyprus",
      };

      const resultsByLocale = new Map<string, SeoPageResult[]>();
      for (const r of results) {
        if (!resultsByLocale.has(r.locale)) resultsByLocale.set(r.locale, []);
        resultsByLocale.get(r.locale)!.push(r);
      }

      const lines: string[] = [];
      for (const loc of localeOrder) {
        const group = resultsByLocale.get(loc);
        if (!group) continue;
        lines.push(`*${localeLabels[loc] ?? loc}*`);
        for (const r of group) {
          const status = classifyResult(r);
          const icon = status === "error" ? "🔴" : status === "warn" ? "🟡" : "🟢";
          let detail = "";
          if (r.fetchFailed) {
            detail = "could not fetch page";
          } else if (!r.ogImage) {
            detail = "og:image missing";
          } else if (r.ogImageReachable === false) {
            detail = "og:image not reachable";
          } else if (r.fallbackUsed) {
            detail = "using fallback site-wide image";
          } else if (r.ogImageSizeOk === false) {
            detail = "og:image dimensions wrong";
          } else {
            detail = "ok";
          }
          lines.push(`  ${icon} *${r.label}* — ${detail}`);
        }
      }

      const summaryParts: string[] = [];
      if (failing.length > 0) summaryParts.push(`${failing.length} failing`);
      if (warned.length > 0) summaryParts.push(`${warned.length} warned`);
      summaryParts.push(`${passing.length} ok`);

      const severity = failing.length > 0 ? "warn" : "info";

      await sendAlert({
        title: `SEO on-demand audit (${ranAt.slice(0, 10)}): ${summaryParts.join(", ")}`,
        body:
          `*On-demand* OG-image check across ${results.length} key Presentail pages ` +
          `(triggered manually — this is not the nightly digest). ` +
          (failing.length > 0
            ? `Found ${failing.length} page(s) with broken or missing OG images. ` +
              `Link previews on WhatsApp, iMessage, and Slack may be showing blank or wrong images. `
            : `Found no hard failures but ${warned.length} page(s) with warnings. `) +
          `Results:\n${lines.join("\n")}`,
        severity,
        fields: [
          { title: "Run type", value: "On-demand (manual trigger)" },
          { title: "Ran at (UTC)", value: ranAt },
          { title: "Pages checked", value: String(results.length) },
          { title: "Failing (red)", value: String(failing.length) },
          { title: "Warned (yellow)", value: String(warned.length) },
          { title: "Passing (green)", value: String(passing.length) },
        ],
        source: "seoAuditMonitor.runAuditNow",
      });
    }

    return summary;
  } finally {
    running = false;
  }
}

// ── Core evaluation ─────────────────────────────────────────────────────────

export async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const prevDay = previousUtcDay();

    if (lastEvaluatedDay === prevDay) {
      logger.info(
        { day: prevDay },
        "seoAuditMonitor: already evaluated today, skipping",
      );
      return;
    }

    logger.info(
      { day: prevDay, pageCount: KEY_PAGES.length },
      "seoAuditMonitor: running daily audit",
    );

    const ranAt = new Date().toISOString();
    const results = await Promise.all(KEY_PAGES.map(auditPage));
    lastEvaluatedDay = prevDay;

    const failing = results.filter((r) => classifyResult(r) === "error");
    const warned = results.filter((r) => classifyResult(r) === "warn");
    const passing = results.filter((r) => classifyResult(r) === "ok");

    lastAuditSummary = {
      ranAt,
      total: results.length,
      failing: failing.length,
      warned: warned.length,
      passing: passing.length,
      pages: results.map((r) => ({
        label: r.label,
        url: r.url,
        status: classifyResult(r),
        ogImage: r.ogImage,
        ogImageReachable: r.ogImageReachable,
        ogImageSizeOk: r.ogImageSizeOk,
        fallbackUsed: r.fallbackUsed,
        fetchFailed: r.fetchFailed,
        error: r.error,
      })),
    };
    await persistAuditSummary(lastAuditSummary);
    await appendAuditLog(lastAuditSummary, "scheduled");
    await pruneOldAuditLog();

    logger.info(
      {
        day: prevDay,
        total: results.length,
        failing: failing.length,
        warned: warned.length,
        passing: passing.length,
      },
      "seoAuditMonitor: audit complete",
    );

    if (failing.length === 0 && warned.length === 0) {
      logger.info(
        { day: prevDay },
        "seoAuditMonitor: all pages healthy — no alert needed",
      );
      return;
    }

    // Build a concise digest grouped by locale so the Slack message stays
    // readable even as the page list grows.
    const localeOrder = ["LB", "AE", "CY"];
    const localeLabels: Record<string, string> = {
      LB: "Lebanon",
      AE: "UAE",
      CY: "Cyprus",
    };

    const resultsByLocale = new Map<string, SeoPageResult[]>();
    for (const r of results) {
      if (!resultsByLocale.has(r.locale)) resultsByLocale.set(r.locale, []);
      resultsByLocale.get(r.locale)!.push(r);
    }

    const lines: string[] = [];
    for (const loc of localeOrder) {
      const group = resultsByLocale.get(loc);
      if (!group) continue;
      lines.push(`*${localeLabels[loc] ?? loc}*`);
      for (const r of group) {
        const status = classifyResult(r);
        const icon = status === "error" ? "🔴" : status === "warn" ? "🟡" : "🟢";
        let detail = "";
        if (r.fetchFailed) {
          detail = "could not fetch page";
        } else if (!r.ogImage) {
          detail = "og:image missing";
        } else if (r.ogImageReachable === false) {
          detail = "og:image not reachable";
        } else if (r.fallbackUsed) {
          detail = "using fallback site-wide image";
        } else if (r.ogImageSizeOk === false) {
          detail = "og:image dimensions wrong";
        } else {
          detail = "ok";
        }
        lines.push(`  ${icon} *${r.label}* — ${detail}`);
      }
    }

    const summaryParts: string[] = [];
    if (failing.length > 0) summaryParts.push(`${failing.length} failing`);
    if (warned.length > 0) summaryParts.push(`${warned.length} warned`);
    summaryParts.push(`${passing.length} ok`);

    const severity = failing.length > 0 ? "warn" : "info";

    await sendAlert({
      title: `SEO health digest — ${prevDay}: ${summaryParts.join(", ")}`,
      body:
        `Daily OG-image check across ${results.length} key Presentail pages ` +
        (failing.length > 0
          ? `found ${failing.length} page(s) with broken or missing OG images. ` +
            `Link previews on WhatsApp, iMessage, and Slack may be showing blank or wrong images. `
          : `found no hard failures but ${warned.length} page(s) with warnings. `) +
        `Results:\n${lines.join("\n")}`,
      severity,
      fields: [
        { title: "Date evaluated", value: prevDay },
        { title: "Pages checked", value: String(results.length) },
        { title: "Failing (red)", value: String(failing.length) },
        { title: "Warned (yellow)", value: String(warned.length) },
        { title: "Passing (green)", value: String(passing.length) },
      ],
      source: "seoAuditMonitor",
    });
  } finally {
    running = false;
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function startSeoAuditMonitor(): void {
  if (process.env.NODE_ENV === "test") return;
  if (!ENABLED) {
    logger.info("seoAuditMonitor: disabled");
    return;
  }
  if (timer) return;

  // Pre-populate the in-memory cache from the DB so GET /api/admin/seo-audit/last
  // returns the previous result immediately after a restart, before the next
  // scheduled run completes.
  loadPersistedAuditSummary().catch((err) => {
    logger.warn(
      { err: (err as Error)?.message },
      "seoAuditMonitor: startup load of persisted summary failed",
    );
  });

  // Run once shortly after boot so we don't wait up to an hour on a server
  // that restarts just after midnight UTC.
  const baseline = setTimeout(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "seoAuditMonitor: baseline run failed",
      );
    });
  }, 90_000);
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err) => {
      logger.warn(
        { err: (err as Error)?.message },
        "seoAuditMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info({ tickMs: TICK_MS, pageCount: KEY_PAGES.length }, "seoAuditMonitor: started");
}

export function stopSeoAuditMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

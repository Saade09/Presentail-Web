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

import { logger } from "./logger";
import { sendAlert } from "./alerts";

const ENABLED = (() => {
  const v = (process.env.SEO_AUDIT_MONITOR_ENABLED ?? "1").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

// Wake up hourly; evaluate the previous full UTC day once. A short tick
// ensures we alert even if the server restarts after midnight UTC.
const TICK_MS = 60 * 60 * 1000; // 1 h

// Key pages to audit — mirrors the KEY_PAGES list in the SEO debug UI.
const KEY_PAGES: Array<{ label: string; url: string }> = [
  { label: "Homepage (LB)", url: "https://new.presentail.com/en-lb/beirut" },
  { label: "Homepage (AE — Dubai)", url: "https://new.presentail.com/en-ae/dubai" },
  { label: "Homepage (CY)", url: "https://new.presentail.com/en-cy/nicosia" },
  { label: "Product page", url: "https://new.presentail.com/en-lb/beirut/product/pink-roses" },
  { label: "Brand page", url: "https://new.presentail.com/en-lb/beirut/brand/roses-only" },
  { label: "Category page", url: "https://new.presentail.com/en-lb/beirut/shop?category=flowers" },
  { label: "Occasion page", url: "https://new.presentail.com/en-lb/beirut/shop?occasion=birthday" },
];

// ── Module state ────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
// Tracks the last UTC date (YYYY-MM-DD) we've evaluated so we fire once per
// day. Resets on process restart (a duplicate alert on cold boot is fine).
let lastEvaluatedDay: string | null = null;

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

function classifyResult(r: SeoPageResult): "error" | "warn" | "ok" {
  if (r.fetchFailed || !r.ogImage || r.ogImageReachable === false) return "error";
  if (r.ogImageSizeOk === false || r.fallbackUsed) return "warn";
  return "ok";
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
  imageUrl: string,
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

async function auditPage(page: { label: string; url: string }): Promise<SeoPageResult> {
  const html = await fetchPageHtml(page.url);
  if (!html) {
    return {
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

// ── Core evaluation ─────────────────────────────────────────────────────────

export async function runOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const today = utcDateString(new Date());
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

    const results = await Promise.all(KEY_PAGES.map(auditPage));
    lastEvaluatedDay = prevDay;

    const failing = results.filter((r) => classifyResult(r) === "error");
    const warned = results.filter((r) => classifyResult(r) === "warn");
    const passing = results.filter((r) => classifyResult(r) === "ok");

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

    // Build a concise digest of every page's status for the alert body.
    const lines: string[] = [];
    for (const r of results) {
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
      lines.push(`${icon} *${r.label}* — ${detail}`);
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

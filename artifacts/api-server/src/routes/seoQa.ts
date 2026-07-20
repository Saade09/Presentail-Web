import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Admin-only SEO QA snapshot endpoint.
//
// Auth: same `x-push-admin-token` header as the other admin endpoints.
//
// GET /api/admin/seo-qa
//   ?origin=https://presentail.com   — override the base origin to probe
//   ?timeout=10000                   — per-request timeout in ms (default 8000)
//
// Returns a JSON array of per-URL audit rows covering:
//   url, finalUrl, statusCode, title, titleLength, metaDescription,
//   metaDescriptionLength, canonical, robots, h1, ogTitle, ogDescription,
//   structuredDataTypes, inSitemap, warnings
//
// The "16 audit test URLs" cover:
//   Root landing, two city homes (Beirut, Dubai), all Group A static pages
//   in both cities, all Group B static pages (noindex expected), two browse
//   pages, and one trailing-slash URL (301 redirect expected).

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res
      .status(401)
      .json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

const TEST_PATHS = [
  "/",
  "/en-lb/beirut",
  "/en-ae/dubai",
  "/en-lb/beirut/faqs",
  "/en-lb/beirut/contact",
  "/en-lb/beirut/corporate",
  "/en-lb/beirut/weddings",
  "/en-ae/dubai/faqs",
  "/en-lb/beirut/careers",
  "/en-lb/beirut/privacy",
  "/en-lb/beirut/terms",
  "/en-lb/beirut/partner",
  "/en-lb/beirut/blog",
  "/en-lb/beirut/brands",
  "/en-lb/beirut/occasions",
  "/en-lb/beirut/",
] as const;

function extractMeta(html: string, name: string): string | null {
  const m =
    html.match(
      new RegExp(
        `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`,
        "i",
      ),
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`,
        "i",
      ),
    );
  return m ? m[1] : null;
}

function extractProperty(html: string, prop: string): string | null {
  const m =
    html.match(
      new RegExp(
        `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`,
        "i",
      ),
    ) ??
    html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`,
        "i",
      ),
    );
  return m ? m[1] : null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractCanonical(html: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1] : null;
}

function extractH1(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]*>/g, "").trim();
}

function extractJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown>;
      if (data["@type"]) types.push(String(data["@type"]));
      if (data["@graph"] && Array.isArray(data["@graph"])) {
        for (const node of data["@graph"] as Array<Record<string, unknown>>) {
          if (node["@type"]) types.push(String(node["@type"]));
        }
      }
    } catch {
    }
  }
  return [...new Set(types)];
}

interface AuditRowInput {
  statusCode: number;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  path: string;
  inSitemap: boolean;
}

function buildWarnings(row: AuditRowInput): string[] {
  const w: string[] = [];
  if (row.statusCode >= 400) {
    w.push(`HTTP ${row.statusCode}`);
  }
  if (!row.title) {
    w.push("missing <title>");
  } else {
    if (row.titleLength < 10) w.push(`title too short (${row.titleLength} chars)`);
    if (row.titleLength > 70) w.push(`title too long (${row.titleLength} chars)`);
    if (row.title === "Presentail") w.push("duplicate/bare title — no page-specific text");
  }
  if (!row.metaDescription) {
    w.push("missing meta description");
  } else {
    if (row.metaDescriptionLength < 50) w.push(`description too short (${row.metaDescriptionLength} chars)`);
    if (row.metaDescriptionLength > 165) w.push(`description too long (${row.metaDescriptionLength} chars)`);
  }
  if (!row.canonical) w.push("missing canonical");
  const isNoindex = row.robots?.includes("noindex") ?? false;
  if (isNoindex && row.inSitemap) w.push("noindex page is in sitemap");
  if (!isNoindex && !row.inSitemap && row.statusCode === 200 && !row.path.endsWith("/")) {
    const probablyShouldBeInSitemap =
      /^\/(en-lb\/beirut|en-ae\/dubai)\/(faqs|contact|corporate|weddings|brands|occasions)$/.test(
        row.path,
      ) || /^\/(en-lb\/beirut|en-ae\/dubai)$/.test(row.path);
    if (probablyShouldBeInSitemap) w.push("indexable page not found in sitemap");
  }
  if (!row.h1 && row.statusCode === 200) w.push("missing <h1>");
  const isGroupBPath = /\/(careers|privacy|terms|partner|blog)$/.test(row.path);
  if (isGroupBPath && !isNoindex && row.statusCode === 200) {
    w.push("Group B page should be noindex but robots is missing noindex");
  }
  return w;
}

// Second pass: cross-row checks that cannot be done per-row in isolation.
//   - Duplicate title: same <title> text on two or more indexable (non-noindex) pages
//   - Duplicate description: same meta description on two or more indexable pages
//   - Canonical mismatch: the <link rel="canonical"> href in the HTML does not
//     match the expected canonical URL (origin + path, trailing slash stripped).
//     For redirect rows (statusCode 301) we skip this check because the row
//     follows the redirect and the canonical belongs to the redirected URL.
function applyXRowWarnings(
  rows: Array<AuditRowInput & { warnings: string[]; finalUrl: string }>,
  origin: string,
): void {
  // Build frequency maps — only over indexable pages that returned HTML.
  const titleCount = new Map<string, number>();
  const descCount = new Map<string, number>();
  for (const row of rows) {
    const isNoindex = row.robots?.includes("noindex") ?? false;
    if (isNoindex || row.statusCode !== 200) continue;
    if (row.title) titleCount.set(row.title, (titleCount.get(row.title) ?? 0) + 1);
    if (row.metaDescription) descCount.set(row.metaDescription, (descCount.get(row.metaDescription) ?? 0) + 1);
  }

  for (const row of rows) {
    const isNoindex = row.robots?.includes("noindex") ?? false;

    // Duplicate title / description (indexable pages only).
    if (!isNoindex && row.statusCode === 200) {
      if (row.title && (titleCount.get(row.title) ?? 0) > 1) {
        row.warnings.push(`duplicate title shared with ${(titleCount.get(row.title)! - 1)} other page(s)`);
      }
      if (row.metaDescription && (descCount.get(row.metaDescription) ?? 0) > 1) {
        row.warnings.push(`duplicate meta description shared with ${(descCount.get(row.metaDescription)! - 1)} other page(s)`);
      }
    }

    // Canonical mismatch: skip 301 rows (path ends with "/" — trailing-slash
    // test), skip rows with no canonical extracted (already warned above).
    if (row.statusCode === 200 && row.canonical) {
      const expectedCanonical = `${origin}${row.path.replace(/\/$/, "") || "/"}`;
      if (row.canonical !== expectedCanonical) {
        row.warnings.push(`canonical mismatch: expected <${expectedCanonical}> but got <${row.canonical}>`);
      }
    }
  }
}

router.get("/admin/seo-qa", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const timeout = Math.min(
    Number(req.query["timeout"] ?? 8000) || 8000,
    20000,
  );

  const rawOrigin = (req.query["origin"] as string | undefined)?.trim();

  if (rawOrigin !== undefined) {
    let parsedHostname: string | null = null;
    try {
      parsedHostname = new URL(rawOrigin).hostname.toLowerCase();
    } catch {
      res.status(400).json({ ok: false, message: "Invalid origin: must be an absolute URL" }); // i18n-ignore
      return;
    }
    const isPresentailHost =
      parsedHostname === "presentail.com" ||
      parsedHostname.endsWith(".presentail.com");
    const isLoopbackInDev =
      process.env.NODE_ENV !== "production" &&
      (parsedHostname === "localhost" || parsedHostname === "127.0.0.1");
    const allowed = isPresentailHost || isLoopbackInDev;
    if (!allowed) {
      res.status(400).json({ ok: false, message: "origin is not an allowed Presentail domain" }); // i18n-ignore
      return;
    }
  }

  const origin =
    rawOrigin ??
    process.env.SEO_QA_ORIGIN ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  try {
    const controller = new AbortController();
    const sitemapTimer = setTimeout(() => controller.abort(), timeout);
    let sitemapXml = "";
    try {
      const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
        signal: controller.signal,
      });
      if (sitemapRes.ok) sitemapXml = await sitemapRes.text();
    } catch {
    } finally {
      clearTimeout(sitemapTimer);
    }

    const rows = await Promise.all(
      TEST_PATHS.map(async (path) => {
        const url = origin + path;
        let statusCode = 0;
        let finalUrl = url;
        let html = "";

        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeout);
          try {
            const resp = await fetch(url, {
              redirect: "follow",
              signal: ctrl.signal,
            });
            statusCode = resp.status;
            finalUrl = resp.url || url;
            const ct = resp.headers.get("content-type") ?? "";
            if (ct.includes("text/html")) {
              html = await resp.text();
            }
          } finally {
            clearTimeout(timer);
          }
        } catch (err: unknown) {
          statusCode = 0;
          logger.warn({ path, err }, "seo-qa fetch error");
        }

        const title = extractTitle(html);
        const titleLength = title?.length ?? 0;
        const metaDescription = extractMeta(html, "description");
        const metaDescriptionLength = metaDescription?.length ?? 0;
        const canonical = extractCanonical(html);
        const robots = extractMeta(html, "robots");
        const h1 = extractH1(html);
        const ogTitle = extractProperty(html, "og:title");
        const ogDescription = extractProperty(html, "og:description");
        const structuredDataTypes = extractJsonLdTypes(html);
        const inSitemap = sitemapXml.includes(origin + path);

        const warnings = buildWarnings({
          statusCode,
          title,
          titleLength,
          metaDescription,
          metaDescriptionLength,
          canonical,
          robots,
          h1,
          path,
          inSitemap,
        });

        return {
          path,
          url,
          finalUrl,
          statusCode,
          title,
          titleLength,
          metaDescription,
          metaDescriptionLength,
          canonical,
          robots,
          h1,
          ogTitle,
          ogDescription,
          structuredDataTypes,
          inSitemap,
          warnings,
        };
      }),
    );

    // Second pass: cross-row checks (duplicate titles/descriptions, canonical
    // mismatch) that require all rows to be collected first.
    applyXRowWarnings(rows, origin);

    const totalWarnings = rows.reduce((sum, r) => sum + r.warnings.length, 0);
    res.json({ ok: true, origin, totalWarnings, rows });
  } catch (err: unknown) {
    logger.error({ err }, "seo-qa unexpected error");
    res.status(500).json({ ok: false, message: "Internal error" }); // i18n-ignore
  }
});

export default router;

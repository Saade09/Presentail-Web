import { Router, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

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

function parseMetaTag(
  html: string,
  selector: { property?: string; name?: string },
): string | null {
  const attr = selector.property ? `property` : `name`;
  const value = selector.property ?? selector.name ?? "";
  const re = new RegExp(
    `<meta\\s[^>]*${attr}="${escapeRegex(value)}"[^>]*content="([^"]*)"`,
    "i",
  );
  let m = re.exec(html);
  if (m) return m[1];
  const re2 = new RegExp(
    `<meta\\s[^>]*content="([^"]*)"[^>]*${attr}="${escapeRegex(value)}"`,
    "i",
  );
  m = re2.exec(html);
  return m ? m[1] : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTitleTag(html: string): string | null {
  const m = /<title>([^<]*)<\/title>/i.exec(html);
  return m ? m[1] : null;
}

function parseCanonical(html: string): string | null {
  const m = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i.exec(html);
  if (m) return m[1];
  const m2 = /<link[^>]*href="([^"]*)"[^>]*rel="canonical"[^>]*>/i.exec(html);
  return m2 ? m2[1] : null;
}

async function fetchPageHtml(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: { "user-agent": "Presentail-SeoDebug/1.0" },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkImageReachability(
  imageUrl: string,
): Promise<{ reachable: boolean; bytes: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(imageUrl, {
      method: "HEAD",
      signal: controller.signal,
    });
    const contentLength = resp.headers.get("content-length");
    return {
      reachable: resp.ok,
      bytes: contentLength != null ? parseInt(contentLength, 10) : null,
    };
  } catch {
    return { reachable: false, bytes: null };
  } finally {
    clearTimeout(timer);
  }
}

router.get("/seo/debug", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) {
    res.status(400).json({ ok: false, message: "Missing required query param: url" });
    return;
  }

  let targetUrl: string;
  try {
    const parsed = new URL(rawUrl);
    targetUrl = parsed.toString();
  } catch {
    const origin =
      process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, "") ??
      `http://localhost:${process.env.PORT ?? 80}`;
    const path = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
    targetUrl = `${origin}${path}`;
  }

  logger.info({ targetUrl }, "seo.debug: fetching page");
  const html = await fetchPageHtml(targetUrl);
  if (!html) {
    res.status(502).json({ ok: false, message: "Could not fetch the page HTML", url: targetUrl });
    return;
  }

  const title = parseTitleTag(html);
  const description = parseMetaTag(html, { name: "description" });
  const canonical = parseCanonical(html);
  const ogImage = parseMetaTag(html, { property: "og:image" });
  const ogImageWidth = parseMetaTag(html, { property: "og:image:width" });
  const ogImageHeight = parseMetaTag(html, { property: "og:image:height" });
  const ogImageAlt = parseMetaTag(html, { property: "og:image:alt" });
  const twitterImageAlt = parseMetaTag(html, { name: "twitter:image:alt" });

  const defaultOgImagePath = "/opengraph.jpg";
  const fallbackUsed = !ogImage || ogImage.endsWith(defaultOgImagePath);

  let ogImageReachable: boolean | null = null;
  let ogImageBytes: number | null = null;
  if (ogImage) {
    const { reachable, bytes } = await checkImageReachability(ogImage);
    ogImageReachable = reachable;
    ogImageBytes = bytes;
  }

  res.json({
    ok: true,
    url: targetUrl,
    title,
    description,
    canonical,
    ogImage,
    ogImageWidth,
    ogImageHeight,
    ogImageAlt,
    twitterImageAlt,
    ogImageReachable,
    ogImageBytes,
    fallbackUsed,
  });
});

export default router;

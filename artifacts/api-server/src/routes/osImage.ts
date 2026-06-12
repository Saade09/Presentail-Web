import { Router } from "express";

const router = Router();

const ALLOWED_HOSTNAME = "os.presentail.com";
const ALLOWED_PATH_PREFIX = "/api/storage/";

/**
 * GET /api/os/image?url=<encoded-os-image-url>
 *
 * Proxies product images from Presentail OS storage. The OS storage endpoint
 * requires `x-api-key` auth; browsers cannot supply this directly, so we
 * proxy here and add the key server-side.
 *
 * Security: only proxies os.presentail.com URLs under /api/storage/ to
 * prevent SSRF. No caller auth required — images are product photos that
 * should be visible to all shoppers.
 *
 * Responses are cached for 24 h at the browser / CDN level.
 */
router.get("/os/image", async (req, res) => {
  const urlParam = typeof req.query.url === "string" ? req.query.url.trim() : null;
  if (!urlParam) {
    return res.status(400).json({ ok: false, message: "Missing url" }); // i18n-ignore
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid url" }); // i18n-ignore
  }

  if (
    target.hostname !== ALLOWED_HOSTNAME ||
    !target.pathname.startsWith(ALLOWED_PATH_PREFIX)
  ) {
    return res.status(403).json({ ok: false, message: "Forbidden" }); // i18n-ignore
  }

  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  try {
    const upstream = await fetch(target.toString(), {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      redirect: "follow",
    });

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    const data = await upstream.arrayBuffer();
    return res.send(Buffer.from(data));
  } catch (err) {
    req.log.warn({ err }, "os-image-proxy: upstream fetch failed");
    return res.status(502).end();
  }
});

export default router;

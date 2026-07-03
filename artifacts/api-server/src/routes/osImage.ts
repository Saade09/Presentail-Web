import { Router } from "express";

const router = Router();

const ALLOWED_HOSTNAME = "os.presentail.com";
const ALLOWED_PATH_PREFIX = "/api/storage/public-objects/";

/**
 * GET /api/os/image?url=<encoded-os-image-url>
 *
 * Proxies product images from Presentail OS public storage. The OS storage
 * endpoint requires `x-api-key` auth; browsers cannot supply this directly,
 * so we proxy here and add the key server-side.
 *
 * Security: only proxies os.presentail.com URLs under /api/storage/public-objects/
 * to prevent both SSRF and credential-misuse against private OS storage objects.
 * Redirects are rejected so the allowlist cannot be bypassed by a redirect chain.
 * The upstream response Content-Type must be an image/ type before the body is
 * forwarded — non-image responses (e.g. HTML error pages) are dropped.
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
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    // Reject redirects — the allowlist only covers the requested URL, not
    // wherever a redirect might lead.
    if (upstream.status >= 300 && upstream.status < 400) {
      req.log.warn({ status: upstream.status, url: urlParam }, "os-image-proxy: upstream redirected; rejecting");
      return res.status(502).end();
    }

    if (!upstream.ok) {
      return res.status(upstream.status).end();
    }

    const contentType = upstream.headers.get("content-type") ?? "";
    // Only forward actual image responses. Non-image responses (e.g. the OS
    // web-app HTML shell returned for private/missing objects) are dropped.
    if (!contentType.startsWith("image/")) {
      req.log.warn({ contentType, url: urlParam }, "os-image-proxy: upstream returned non-image content-type; rejecting");
      return res.status(404).end();
    }

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

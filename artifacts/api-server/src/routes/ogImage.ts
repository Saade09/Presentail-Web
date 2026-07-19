/**
 * GET /api/og-image/product/:slug
 * GET /api/og-image/occasion/:slug
 *
 * On-demand 1200×630 JPEG generator for per-product and per-occasion Open
 * Graph share images. Each image composites the entity's primary photo with
 * the Presentail brand panel (dark green background, product name, PRESENTAIL
 * wordmark, gold accent strip).
 *
 * Images are generated with `sharp` on the first request and cached
 * in-process for 1 hour. WhatsApp / iMessage / Slack crawlers retry
 * aggressively, so the in-memory cache prevents repeated upstream fetches
 * for the same product.
 *
 * When the OS product cache is cold (server just started) or the slug is
 * unknown, the route returns 404 so crawlers don't cache a broken image.
 * Any sharp / upstream error returns 500 (also not cached).
 *
 * Output: image/jpeg, Cache-Control: public, max-age=3600.
 * Budget: target ≤ 300 kB (JPEG q=80 with mozjpeg; consistent with the
 * check-public-image-budget constraint on the web artifact's static images).
 */

import { Router } from "express";
import sharp from "sharp";
import {
  getOsProductBySlug,
  getOsOccasions,
  getOsBrands,
} from "../lib/osProductsCache";

const router = Router();

// ── Dimensions ────────────────────────────────────────────────────────────
const W = 1200;
const H = 630;

// Width of the photo panel on the left side of the card.
const PHOTO_W = 560;

// ── Brand colours ─────────────────────────────────────────────────────────
const BG = "#1a2e1e";
const GOLD = "#c9a96e";
const WHITE = "#ffffff";
const CREAM = "#f5ede0";

// ── Caching ───────────────────────────────────────────────────────────────
const OG_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 h

type CacheEntry = { buffer: Buffer; generatedAt: number };
const ogCache = new Map<string, CacheEntry>();

function getCached(key: string): Buffer | null {
  const entry = ogCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.generatedAt > OG_CACHE_TTL_MS) {
    ogCache.delete(key);
    return null;
  }
  return entry.buffer;
}

function setCached(key: string, buffer: Buffer): void {
  // Evict oldest entry when the map gets large (>500 items).
  if (ogCache.size >= 500) {
    const oldest = ogCache.keys().next().value;
    if (oldest !== undefined) ogCache.delete(oldest);
  }
  ogCache.set(key, { buffer, generatedAt: Date.now() });
}

// ── Image fetch ───────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Hostnames from which it is safe to fetch entity photos AND attach the OS
 * API key. This list covers the Presentail OS API itself and any CDN/storage
 * origins it serves images from. Extend when new origins are added.
 *
 * A URL whose hostname does NOT appear here is still fetched (so public CDN
 * images work), but the API key is never sent to untrusted hosts.
 */
const TRUSTED_IMAGE_HOSTNAMES = new Set<string>([
  "os.presentail.com",
  "storage.presentail.com",
  "cdn.presentail.com",
  "api.presentail.com",
]);

function isTrustedImageHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only trust HTTPS origins. Never attach credentials to plain HTTP.
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (TRUSTED_IMAGE_HOSTNAMES.has(host)) return true;
    // Also accept any subdomain of presentail.com (e.g. assets.os.presentail.com).
    if (host.endsWith(".presentail.com")) return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  const apiKey = process.env.PRESENTAIL_OS_API_KEY ?? "";
  // Only attach the API key for trusted Presentail-owned origins to prevent
  // accidental credential forwarding / SSRF if a catalog entry ever contains
  // an attacker-controlled image URL.
  const trusted = isTrustedImageHost(url);
  const headers: Record<string, string> =
    apiKey && trusted ? { "x-api-key": apiKey } : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap text into lines where each line is at most `maxChars` characters.
 * Returns at most `maxLines` lines; excess text is truncated with an ellipsis.
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines && current && current !== lines[maxLines - 1]) {
    // We still have remaining words — truncate last line.
    const last = lines[maxLines - 1];
    if (last && last.length > 1) lines[maxLines - 1] = last.slice(0, -1) + "…";
  }
  return lines.slice(0, maxLines);
}

// ── Image generator ───────────────────────────────────────────────────────

/**
 * Compose a 1200×630 branded JPEG for a named entity.
 *
 * Layout:
 *   Left (0–PHOTO_W):  entity photo, cover-cropped to PHOTO_W×H.
 *                      A gradient blends it into the green panel at the edge.
 *   Right (PHOTO_W–W): dark-green panel with entity name + PRESENTAIL wordmark.
 *   Bottom strip:      semi-transparent gold band + "LEBANON · UAE · CYPRUS".
 */
async function generateOgImage(
  name: string,
  imageUrl: string | null,
): Promise<Buffer> {
  // ── 1. Fetch and resize entity photo ──────────────────────────────────
  let photoComposite: sharp.OverlayOptions | null = null;

  if (imageUrl) {
    const rawBuf = await fetchImageBuffer(imageUrl);
    if (rawBuf) {
      try {
        const resized = await sharp(rawBuf)
          .resize(PHOTO_W, H, { fit: "cover", position: "centre" })
          .toBuffer();
        photoComposite = { input: resized, top: 0, left: 0 };
      } catch {
        // Photo processing failed — fall through to text-only card.
      }
    }
  }

  // ── 2. Build text layout ────────────────────────────────────────────
  const TEXT_LEFT = PHOTO_W + 44; // left edge of the text column (px)
  const TEXT_RIGHT = W - 48; // right edge (used for line-length estimate)
  // Each char is roughly 0.54 × font-size px wide for the serif font at these
  // sizes — a rough but effective line-length guard so names don't overflow.
  const MAX_LINES = 3;

  // Choose font size based on name length so short names are big and long ones fit.
  let nameFontSize = 52;
  if (name.length > 40) nameFontSize = 36;
  else if (name.length > 26) nameFontSize = 44;

  // Approximate chars-per-line at the chosen font size.
  const charsPerLine = Math.floor((TEXT_RIGHT - TEXT_LEFT) / (nameFontSize * 0.55));
  const nameLines = wrapText(name, charsPerLine, MAX_LINES);

  const lineH = nameFontSize + 12; // line-height
  const nameBlockH = nameLines.length * lineH;

  // Vertically centre the text block (excluding the bottom strip, ~58 px).
  const usableH = H - 58;
  const nameTopY = Math.round((usableH - nameBlockH - 64) / 2);

  // Tagline appears below the name block.
  const taglineY = nameTopY + nameBlockH + 28;
  const wordmarkY = taglineY + 38;

  // ── 3. Build SVG overlay ─────────────────────────────────────────────
  const nameTextSvg = nameLines
    .map((line, i) => {
      const y = nameTopY + i * lineH + nameFontSize;
      return `<text
        x="${TEXT_LEFT}" y="${y}"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${nameFontSize}"
        font-weight="400"
        fill="${WHITE}"
        opacity="0.96"
      >${escapeXml(line)}</text>`;
    })
    .join("\n");

  const svgOverlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <!-- Gradient that fades the photo into the green panel at its right edge -->
    <linearGradient id="photoFade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="60%"  style="stop-color:${BG};stop-opacity:0"/>
      <stop offset="100%" style="stop-color:${BG};stop-opacity:1"/>
    </linearGradient>
  </defs>

  ${
    photoComposite
      ? `<!-- Blend gradient over photo right edge -->
    <rect x="${Math.round(PHOTO_W * 0.45)}" y="0"
          width="${Math.round(PHOTO_W * 0.55)}" height="${H}"
          fill="url(#photoFade)"/>`
      : ""
  }

  <!-- ── Thin gold border frame ── -->
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}"
        fill="none" stroke="${GOLD}" stroke-width="0.8" opacity="0.3" rx="2"/>

  <!-- ── Vertical separator line ── -->
  ${
    photoComposite
      ? `<line x1="${PHOTO_W}" y1="60" x2="${PHOTO_W}" y2="${H - 70}"
              stroke="${GOLD}" stroke-width="0.6" opacity="0.0"/>`
      : ""
  }

  <!-- ── Entity name ── -->
  ${nameTextSvg}

  <!-- ── Gold accent rule beneath the name ── -->
  <line x1="${TEXT_LEFT}" y1="${taglineY - 4}"
        x2="${Math.min(TEXT_LEFT + 220, TEXT_RIGHT)}" y2="${taglineY - 4}"
        stroke="${GOLD}" stroke-width="1" opacity="0.7"/>

  <!-- ── PRESENTAIL wordmark ── -->
  <text
    x="${TEXT_LEFT}" y="${wordmarkY}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="18"
    font-weight="300"
    letter-spacing="4"
    fill="${GOLD}"
    opacity="0.9"
  >PRESENTAIL</text>

  <!-- ── Tagline ── -->
  <text
    x="${TEXT_LEFT}" y="${wordmarkY + 28}"
    font-family="Georgia, 'Times New Roman', serif"
    font-style="italic"
    font-size="14"
    fill="${CREAM}"
    opacity="0.65"
  >Luxury flowers &amp; gifts, delivered.</text>

  <!-- ── Bottom strip background ── -->
  <rect x="0" y="${H - 58}" width="${W}" height="58"
        fill="${GOLD}" opacity="0.10"/>

  <!-- ── Thin divider above strip ── -->
  <line x1="60" y1="${H - 58}" x2="${W - 60}" y2="${H - 58}"
        stroke="${GOLD}" stroke-width="0.7" opacity="0.45"/>

  <!-- ── Country callout ── -->
  <text
    x="${W / 2}" y="${H - 22}"
    text-anchor="middle"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="11"
    font-weight="400"
    letter-spacing="3.5"
    fill="${GOLD}"
    opacity="0.85"
  >LEBANON  ·  UAE  ·  CYPRUS</text>
</svg>`;

  // ── 4. Composite layers onto background ─────────────────────────────
  const composites: sharp.OverlayOptions[] = [];
  if (photoComposite) composites.push(photoComposite);
  composites.push({ input: Buffer.from(svgOverlay), top: 0, left: 0 });

  const jpeg = await sharp({
    create: { width: W, height: H, channels: 3, background: BG },
  })
    .composite(composites)
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return jpeg;
}

// ── Store key list (for product lookup) ──────────────────────────────────
const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

// ── Budget guard ──────────────────────────────────────────────────────────
// Log a warning when the generated JPEG exceeds 300 kB so regressions are
// caught in the server logs before they affect users.
const JPEG_BUDGET_BYTES = 300 * 1024; // 300 kB

function checkJpegBudget(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  buffer: Buffer,
  context: string,
): void {
  if (buffer.byteLength > JPEG_BUDGET_BYTES) {
    req.log.warn(
      { context, sizeKb: Math.round(buffer.byteLength / 1024) },
      "og-image: generated JPEG exceeds 300 kB budget — consider reducing quality or resizing the source photo",
    );
  }
}

// ── Shared send helper ────────────────────────────────────────────────────
function sendJpeg(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  buffer: Buffer,
  maxAge = 3600,
): void {
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader(
    "Cache-Control",
    `public, max-age=${maxAge}, stale-while-revalidate=600`,
  );
  res.send(buffer);
}

// ── Routes ─────────────────────────────────────────────────────────────
/**
 * GET /api/og-image/product/:slug
 *
 * Returns a 1200×630 JPEG branded card for the product identified by `slug`.
 * Looks the product up in the OS product cache (all stores; first match wins).
 *
 * Fallback strategy — the og:image URL is embedded in HTML served to crawlers
 * before the image is generated; a broken URL would be permanently cached by
 * WhatsApp / iMessage. To guarantee this URL always resolves to a valid JPEG:
 *   - Found product  → branded card with product name + photo
 *   - Cold cache / unknown slug → generic Presentail branded card (no name /
 *     photo) cached for only 5 minutes so the correct card is served once the
 *     cache warms up
 */
router.get("/og-image/product/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const cacheKey = `product:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendJpeg(res, cached);
  }

  let name = "";
  let imageUrl: string | null = null;
  let found = false;

  for (const storeKey of STORE_KEYS) {
    const p = getOsProductBySlug(slug, storeKey);
    if (p) {
      name = p.name ?? "";
      // images[0].url is the primary photo (the URL is already absolute).
      imageUrl = p.images[0]?.url ?? null;
      found = true;
      break;
    }
  }

  try {
    // When the entity is not found (cold cache or unknown slug) we still render
    // a generic branded card so the og:image URL never returns a non-image
    // response. The short max-age (5 min vs 1 h) means crawlers will re-fetch
    // once the cache warms up and serve the entity-specific card going forward.
    const buffer = await generateOgImage(name, imageUrl);
    checkJpegBudget(req, buffer, `product:${slug}`);
    const maxAge = found ? 3600 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image product: generation failed");
    return res.status(500).end();
  }
});

/**
 * GET /api/og-image/brand/:slug
 *
 * Returns a 1200×630 JPEG branded card for the brand identified by `slug`.
 * Same fallback strategy as the product route above.
 */
router.get("/og-image/brand/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const cacheKey = `brand:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendJpeg(res, cached);
  }

  const brands = getOsBrands();
  const brand = brands?.find((b) => b.slug === slug);
  const found = !!brand;

  const name = brand?.name ?? "";
  const imageUrl = (typeof brand?.image === "string" && brand.image) ? brand.image : null;

  try {
    const buffer = await generateOgImage(name, imageUrl);
    checkJpegBudget(req, buffer, `brand:${slug}`);
    const maxAge = found ? 3600 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image brand: generation failed");
    return res.status(500).end();
  }
});

/**
 * GET /api/og-image/occasion/:slug
 *
 * Returns a 1200×630 JPEG branded card for the occasion identified by `slug`.
 * Same fallback strategy as the product route above.
 */
router.get("/og-image/occasion/:slug", async (req, res) => {
  const slug = (req.params.slug ?? "").trim();
  if (!slug) return res.status(400).end();

  const cacheKey = `occasion:${slug}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return sendJpeg(res, cached);
  }

  const occasions = getOsOccasions();
  const occasion = occasions?.find((o) => o.slug === slug);
  const found = !!occasion;

  const name = occasion?.name ?? "";
  // Prefer the public CDN URL (no auth required); fall back to the private URL
  // (fetched with PRESENTAIL_OS_API_KEY, only for trusted origins).
  const imageUrl = occasion?.imagePublicUrl ?? occasion?.image ?? null;

  try {
    const buffer = await generateOgImage(name, imageUrl);
    checkJpegBudget(req, buffer, `occasion:${slug}`);
    const maxAge = found ? 3600 : 300;
    setCached(cacheKey, buffer);
    return sendJpeg(res, buffer, maxAge);
  } catch (err) {
    req.log.warn({ err, slug }, "og-image occasion: generation failed");
    return res.status(500).end();
  }
});

export default router;

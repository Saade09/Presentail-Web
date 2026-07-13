#!/usr/bin/env node
/**
 * generate-og-image.mjs
 *
 * Generates the default Open Graph share image for Presentail.com.
 * Output: public/opengraph.jpg  (1280×720, JPEG quality 82)
 *
 * Design: full-bleed photo background (spring sourcing trip hero),
 * cinematic dark gradient overlay, centred white wordmark, italic tagline,
 * gold "LEBANON · UAE · CYPRUS" strip, thin gold border, botanical corners.
 *
 * Uses sharp (already a devDependency) — no extra native binaries needed.
 *
 * Usage:
 *   node scripts/generate-og-image.mjs
 *   pnpm --filter @workspace/presentail-web run generate-og-image
 */

import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const W = 1280;
const H = 720;
const GOLD = "#c9a96e";
const CREAM = "#f5ede0";

const LOGO_SRC = path.resolve(
  __dirname,
  "../../../attached_assets/Presentail_PNG-01_white.png",
);
const BG_SRC = path.resolve(
  ROOT,
  "public/blog/inside-spring-sourcing-trip.webp",
);
const OUT = path.resolve(ROOT, "public/opengraph.jpg");

const LOGO_RENDER_W = 360;
const LOGO_RENDER_H = Math.round((2383 / 4167) * LOGO_RENDER_W);

const LOGO_X = Math.round((W - LOGO_RENDER_W) / 2);
const LOGO_Y = 200;

const TAGLINE_Y = LOGO_Y + LOGO_RENDER_H + 44;
const STRIP_Y = H - 72;

const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Cinematic gradient: dark at top + bottom, lighter window in the centre -->
    <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#000" stop-opacity="0.72"/>
      <stop offset="30%"  stop-color="#000" stop-opacity="0.38"/>
      <stop offset="55%"  stop-color="#000" stop-opacity="0.22"/>
      <stop offset="72%"  stop-color="#000" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.80"/>
    </linearGradient>

    <!-- Subtle teal tint blended into the gradient at the very top -->
    <linearGradient id="tealTint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#00414E" stop-opacity="0.45"/>
      <stop offset="40%"  stop-color="#00414E" stop-opacity="0.00"/>
    </linearGradient>

    <style>
      .flourish { fill: none; stroke: ${GOLD}; stroke-width: 1.2; opacity: 0.60; }
      .dot      { fill: ${GOLD}; opacity: 0.50; }
    </style>
  </defs>

  <!-- ── Full-frame gradient overlays ── -->
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <rect width="${W}" height="${H}" fill="url(#tealTint)"/>

  <!-- ── Bottom country strip (solid dark teal tint for legibility) ── -->
  <rect x="0" y="${STRIP_Y}" width="${W}" height="${H - STRIP_Y}"
        fill="#00414E" opacity="0.55"/>

  <!-- ── Thin divider line above strip ── -->
  <line x1="64" y1="${STRIP_Y}" x2="${W - 64}" y2="${STRIP_Y}"
        stroke="${GOLD}" stroke-width="0.8" opacity="0.55"/>

  <!-- ── Thin gold border frame ── -->
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}"
        fill="none" stroke="${GOLD}" stroke-width="0.9" opacity="0.40" rx="2"/>

  <!-- ══════════════ Botanical corner flourishes ══════════════ -->

  <!-- Top-left -->
  <g transform="translate(48,44)">
    <path class="flourish" d="M0,80 Q10,40 40,10"/>
    <path class="flourish" d="M0,80 Q-8,50 10,20"/>
    <path class="flourish" d="M10,60 Q-12,42 4,22 Q16,38 10,60Z"/>
    <path class="flourish" d="M22,48 Q42,32 28,14 Q18,30 22,48Z"/>
    <circle class="dot" cx="4"  cy="20" r="2.5"/>
    <circle class="dot" cx="28" cy="13" r="2"/>
    <circle class="dot" cx="40" cy="9"  r="1.5"/>
    <path class="flourish" d="M10,80 Q30,90 60,78"/>
    <path class="flourish" d="M55,78 Q65,65 58,55"/>
    <circle class="dot" cx="58" cy="54" r="1.8"/>
  </g>

  <!-- Top-right (mirrored) -->
  <g transform="translate(${W - 48},44) scale(-1,1)">
    <path class="flourish" d="M0,80 Q10,40 40,10"/>
    <path class="flourish" d="M0,80 Q-8,50 10,20"/>
    <path class="flourish" d="M10,60 Q-12,42 4,22 Q16,38 10,60Z"/>
    <path class="flourish" d="M22,48 Q42,32 28,14 Q18,30 22,48Z"/>
    <circle class="dot" cx="4"  cy="20" r="2.5"/>
    <circle class="dot" cx="28" cy="13" r="2"/>
    <circle class="dot" cx="40" cy="9"  r="1.5"/>
    <path class="flourish" d="M10,80 Q30,90 60,78"/>
    <path class="flourish" d="M55,78 Q65,65 58,55"/>
    <circle class="dot" cx="58" cy="54" r="1.8"/>
  </g>

  <!-- Bottom-left (flipped) -->
  <g transform="translate(48,${H - 44}) scale(1,-1)">
    <path class="flourish" d="M0,80 Q10,40 40,10"/>
    <path class="flourish" d="M0,80 Q-8,50 10,20"/>
    <path class="flourish" d="M10,60 Q-12,42 4,22 Q16,38 10,60Z"/>
    <path class="flourish" d="M22,48 Q42,32 28,14 Q18,30 22,48Z"/>
    <circle class="dot" cx="4"  cy="20" r="2.5"/>
    <circle class="dot" cx="28" cy="13" r="2"/>
    <circle class="dot" cx="40" cy="9"  r="1.5"/>
    <path class="flourish" d="M10,80 Q30,90 60,78"/>
    <path class="flourish" d="M55,78 Q65,65 58,55"/>
    <circle class="dot" cx="58" cy="54" r="1.8"/>
  </g>

  <!-- Bottom-right (mirrored + flipped) -->
  <g transform="translate(${W - 48},${H - 44}) scale(-1,-1)">
    <path class="flourish" d="M0,80 Q10,40 40,10"/>
    <path class="flourish" d="M0,80 Q-8,50 10,20"/>
    <path class="flourish" d="M10,60 Q-12,42 4,22 Q16,38 10,60Z"/>
    <path class="flourish" d="M22,48 Q42,32 28,14 Q18,30 22,48Z"/>
    <circle class="dot" cx="4"  cy="20" r="2.5"/>
    <circle class="dot" cx="28" cy="13" r="2"/>
    <circle class="dot" cx="40" cy="9"  r="1.5"/>
    <path class="flourish" d="M10,80 Q30,90 60,78"/>
    <path class="flourish" d="M55,78 Q65,65 58,55"/>
    <circle class="dot" cx="58" cy="54" r="1.8"/>
  </g>

  <!-- ══════════════ Text content ══════════════ -->

  <!-- Tagline -->
  <text
    x="${W / 2}" y="${TAGLINE_Y}"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-style="italic"
    font-size="23"
    letter-spacing="0.6"
    fill="${CREAM}"
    opacity="0.92"
  >Luxury flowers &amp; gifts, delivered.</text>

  <!-- Gold accent dots flanking tagline -->
  <circle cx="${W / 2 - 198}" cy="${TAGLINE_Y - 4}" r="1.8" fill="${GOLD}" opacity="0.65"/>
  <circle cx="${W / 2 + 198}" cy="${TAGLINE_Y - 4}" r="1.8" fill="${GOLD}" opacity="0.65"/>

  <!-- Country callout -->
  <text
    x="${W / 2}" y="${STRIP_Y + 44}"
    text-anchor="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="13"
    font-weight="400"
    letter-spacing="3.8"
    fill="${GOLD}"
    opacity="0.95"
  >LEBANON  ·  UAE  ·  CYPRUS</text>
</svg>`;

async function main() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error(`Logo not found at: ${LOGO_SRC}`);
    process.exit(1);
  }
  if (!fs.existsSync(BG_SRC)) {
    console.error(`Background photo not found at: ${BG_SRC}`);
    process.exit(1);
  }

  const bgBuffer = await sharp(BG_SRC)
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const logoBuffer = await sharp(LOGO_SRC)
    .resize(LOGO_RENDER_W, LOGO_RENDER_H, { fit: "inside" })
    .png()
    .toBuffer();

  const overlayBuffer = Buffer.from(overlaySvg);

  await sharp(bgBuffer)
    .composite([
      { input: overlayBuffer, top: 0, left: 0 },
      { input: logoBuffer, top: LOGO_Y, left: LOGO_X },
    ])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(OUT);

  const stat = fs.statSync(OUT);
  const kb = Math.round(stat.size / 1024);
  console.log(`✓ Generated ${path.relative(ROOT, OUT)} — ${kb} kB`);
  if (kb > 300) {
    console.warn(`  ⚠ ${kb} kB exceeds the 300 kB JPEG budget — lower quality or dimensions.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("OG image generation failed:", err);
  process.exit(1);
});

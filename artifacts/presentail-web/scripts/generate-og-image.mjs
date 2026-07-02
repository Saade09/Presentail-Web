#!/usr/bin/env node
/**
 * generate-og-image.mjs
 *
 * Generates the default Open Graph share image for Presentail.com.
 * Output: public/opengraph.jpg  (1200×630, JPEG quality 85)
 *
 * Design: deep forest-green background (#1a2e1e), centred white wordmark,
 * elegant italic tagline, subtle botanical corner flourishes, and a country
 * callout strip at the bottom.
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

const W = 1200;
const H = 630;
const BG = "#1a2e1e";
const GOLD = "#c9a96e";
const CREAM = "#f5ede0";
const WHITE = "#ffffff";

const LOGO_SRC = path.resolve(
  __dirname,
  "../../../attached_assets/Presentail_PNG-01_white.png",
);
const OUT = path.resolve(ROOT, "public/opengraph.jpg");

const LOGO_RENDER_W = 380;
const LOGO_RENDER_H = Math.round((2383 / 4167) * LOGO_RENDER_W);

const LOGO_X = Math.round((W - LOGO_RENDER_W) / 2);
const LOGO_Y = 175;

const decorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      .flourish { fill: none; stroke: ${GOLD}; stroke-width: 1.2; opacity: 0.55; }
      .dot      { fill: ${GOLD}; opacity: 0.45; }
      .strip    { fill: ${GOLD}; opacity: 0.12; }
    </style>
  </defs>

  <!-- ── Top-left botanical corner ── -->
  <g transform="translate(48,44)">
    <!-- outer arc sweep -->
    <path class="flourish" d="M0,80 Q10,40 40,10"/>
    <path class="flourish" d="M0,80 Q-8,50 10,20"/>
    <!-- leaf left -->
    <path class="flourish" d="M10,60 Q-12,42 4,22 Q16,38 10,60Z"/>
    <!-- leaf right -->
    <path class="flourish" d="M22,48 Q42,32 28,14 Q18,30 22,48Z"/>
    <!-- small stem buds -->
    <circle class="dot" cx="4" cy="20" r="2.5"/>
    <circle class="dot" cx="28" cy="13" r="2"/>
    <circle class="dot" cx="40" cy="9"  r="1.5"/>
    <!-- thin trailing vine -->
    <path class="flourish" d="M10,80 Q30,90 60,78"/>
    <path class="flourish" d="M55,78 Q65,65 58,55"/>
    <circle class="dot" cx="58" cy="54" r="1.8"/>
  </g>

  <!-- ── Top-right botanical corner (mirrored) ── -->
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

  <!-- ── Bottom-left botanical corner (flipped vertically) ── -->
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

  <!-- ── Bottom-right botanical corner ── -->
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

  <!-- ── Thin gold border frame ── -->
  <rect x="28" y="28" width="${W - 56}" height="${H - 56}"
        fill="none" stroke="${GOLD}" stroke-width="0.8" opacity="0.35" rx="2"/>

  <!-- ── Bottom country strip background ── -->
  <rect x="0" y="${H - 72}" width="${W}" height="72" class="strip"/>

  <!-- ── Thin divider line above strip ── -->
  <line x1="80" y1="${H - 72}" x2="${W - 80}" y2="${H - 72}"
        stroke="${GOLD}" stroke-width="0.7" opacity="0.5"/>

  <!-- ── Tagline ── -->
  <text
    x="${W / 2}" y="${LOGO_Y + LOGO_RENDER_H + 46}"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-style="italic"
    font-size="22"
    letter-spacing="0.5"
    fill="${CREAM}"
    opacity="0.88"
  >Luxury flowers &amp; gifts, delivered.</text>

  <!-- ── Decorative divider dots around tagline ── -->
  <circle cx="${W / 2 - 180}" cy="${LOGO_Y + LOGO_RENDER_H + 42}" r="1.6" fill="${GOLD}" opacity="0.6"/>
  <circle cx="${W / 2 + 180}" cy="${LOGO_Y + LOGO_RENDER_H + 42}" r="1.6" fill="${GOLD}" opacity="0.6"/>

  <!-- ── Country callout ── -->
  <text
    x="${W / 2}" y="${H - 27}"
    text-anchor="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="13"
    font-weight="400"
    letter-spacing="3.5"
    fill="${GOLD}"
    opacity="0.9"
  >LEBANON  ·  UAE  ·  CYPRUS</text>
</svg>`;

async function main() {
  if (!fs.existsSync(LOGO_SRC)) {
    console.error(`Logo not found at: ${LOGO_SRC}`);
    process.exit(1);
  }

  const logoBuffer = await sharp(LOGO_SRC)
    .resize(LOGO_RENDER_W, LOGO_RENDER_H, { fit: "inside" })
    .png()
    .toBuffer();

  const decorBuffer = Buffer.from(decorSvg);

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: BG,
    },
  })
    .composite([
      { input: decorBuffer, top: 0, left: 0 },
      { input: logoBuffer, top: LOGO_Y, left: LOGO_X },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
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

/**
 * checkFaqSync
 *
 * Cross-validates the server-rendered FAQ copy in
 *   artifacts/presentail-web/src/lib/seo-shop-faqs.mjs
 * against the on-page translation strings in
 *   artifacts/presentail-web/src/locales/shop.ts
 *
 * The two files must stay identical. If someone updates the copy in shop.ts
 * they must also update seo-shop-faqs.mjs (and vice-versa) or the
 * server-rendered JSON-LD will silently drift from what SEOContentSection.tsx
 * renders at runtime.
 *
 * Checks all three locales (en, ar, fr) for both category and occasion FAQs.
 *
 * Exit codes:
 *   0 — all strings match
 *   1 — at least one mismatch found
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-faq-sync
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const SEO_FAQS_MJS = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/lib/seo-shop-faqs.mjs",
);
const SHOP_TS = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/locales/shop.ts",
);

type Locale = "en" | "ar" | "fr";
const LOCALES: Locale[] = ["en", "ar", "fr"];

interface FaqItem {
  q: string;
  a: string;
}
interface FaqCopy {
  en: FaqItem[];
  ar: FaqItem[];
  fr: FaqItem[];
}

// ── Load seo-shop-faqs.mjs via dynamic import ─────────────────────────────

async function loadFaqsMjs(): Promise<{
  CATEGORY_FAQ_COPY: FaqCopy;
  OCCASION_FAQ_COPY: FaqCopy;
}> {
  const url = pathToFileURL(SEO_FAQS_MJS).href;
  return import(url);
}

// ── Load shop.ts strings via tsx-compatible import ───────────────────────

async function loadShopStrings(): Promise<{
  shopStrings: Record<string, { en: string; ar: string }>;
  shopStringsFr: Record<string, string>;
}> {
  const url = pathToFileURL(SHOP_TS).href;
  return import(url);
}

// ── Compare helpers ───────────────────────────────────────────────────────

interface Mismatch {
  locale: Locale;
  kind: "cat" | "occ";
  index: number;
  field: "q" | "a";
  fromShop: string | undefined;
  fromMjs: string | undefined;
}

function getShopFaqValue(
  shopStrings: Record<string, { en: string; ar: string }>,
  shopStringsFr: Record<string, string>,
  kind: "cat" | "occ",
  index: number,
  field: "q" | "a",
  locale: Locale,
): string | undefined {
  const key = `seo.content.${kind}.faq.${index}.${field}`;
  if (locale === "fr") {
    return shopStringsFr[key];
  }
  return shopStrings[key]?.[locale];
}

function collectMismatches(
  faqCopy: FaqCopy,
  kind: "cat" | "occ",
  shopStrings: Record<string, { en: string; ar: string }>,
  shopStringsFr: Record<string, string>,
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const locale of LOCALES) {
    const items = faqCopy[locale];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const index = i + 1;
      for (const field of ["q", "a"] as const) {
        const fromMjs = item[field];
        const fromShop = getShopFaqValue(
          shopStrings,
          shopStringsFr,
          kind,
          index,
          field,
          locale,
        );
        if (fromShop !== fromMjs) {
          mismatches.push({ locale, kind, index, field, fromShop, fromMjs });
        }
      }
    }
  }
  return mismatches;
}

function formatKey(
  kind: "cat" | "occ",
  index: number,
  field: "q" | "a",
  locale: Locale,
): string {
  const key = `seo.content.${kind}.faq.${index}.${field}`;
  if (locale === "fr") {
    return `shopStringsFr["${key}"]`;
  }
  return `shopStrings["${key}"].${locale}`;
}

function printMismatches(mismatches: Mismatch[]): void {
  for (const m of mismatches) {
    const shopKey = formatKey(m.kind, m.index, m.field, m.locale);
    const mjsKey = `${m.kind === "cat" ? "CATEGORY" : "OCCASION"}_FAQ_COPY.${m.locale}[${m.index - 1}].${m.field}`;
    console.error(`\n  ✗ Mismatch: ${shopKey}`);
    console.error(`      shop.ts (${SHOP_TS.replace(REPO_ROOT + "/", "")}):`);
    console.error(
      `        ${m.fromShop === undefined ? "<MISSING>" : JSON.stringify(m.fromShop)}`,
    );
    console.error(
      `      seo-shop-faqs.mjs (${SEO_FAQS_MJS.replace(REPO_ROOT + "/", "")}) [${mjsKey}]:`,
    );
    console.error(
      `        ${m.fromMjs === undefined ? "<MISSING>" : JSON.stringify(m.fromMjs)}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [{ CATEGORY_FAQ_COPY, OCCASION_FAQ_COPY }, { shopStrings, shopStringsFr }] =
    await Promise.all([loadFaqsMjs(), loadShopStrings()]);

  const catMismatches = collectMismatches(
    CATEGORY_FAQ_COPY,
    "cat",
    shopStrings,
    shopStringsFr,
  );
  const occMismatches = collectMismatches(
    OCCASION_FAQ_COPY,
    "occ",
    shopStrings,
    shopStringsFr,
  );

  const allMismatches = [...catMismatches, ...occMismatches];

  if (allMismatches.length === 0) {
    console.log(
      "✓ FAQ copy is in sync: seo-shop-faqs.mjs matches shop.ts for all locales (en, ar, fr).",
    );
    process.exit(0);
  }

  console.error(
    `\nFAQ sync check failed: ${allMismatches.length} mismatch${allMismatches.length === 1 ? "" : "es"} found.\n`,
  );
  console.error(
    "  The server-rendered FAQ copy in seo-shop-faqs.mjs has drifted from the",
  );
  console.error(
    "  on-page translation strings in shop.ts. Update both files together so",
  );
  console.error(
    "  the JSON-LD emitted by seo-inject.mjs matches what SEOContentSection.tsx",
  );
  console.error("  renders at runtime.\n");

  printMismatches(allMismatches);

  console.error(
    "\n  To fix: edit the mismatched strings in both files so they are identical.",
  );
  console.error(
    "  Run `pnpm --filter @workspace/scripts run check-faq-sync` to verify.\n",
  );

  process.exit(1);
}

main().catch((err) => {
  console.error("check-faq-sync: unexpected error:", err);
  process.exit(1);
});

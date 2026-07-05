/**
 * checkFaqSync
 *
 * Cross-validates the server-rendered copy in
 *   artifacts/presentail-web/src/lib/seo-shop-faqs.mjs
 * against the on-page translation strings in
 *   artifacts/presentail-web/src/locales/shop.ts
 *
 * Checks two kinds of exported values:
 *
 *   1. FAQ copy (FaqCopy — arrays of { q, a } objects):
 *        seo.content.cat.faq.{1,2,3}.{q,a}
 *        seo.content.occ.faq.{1,2,3}.{q,a}
 *        seo.content.brand.faq.{1,2,3}.{q,a}
 *
 *   2. Heading / intro strings (StringCopy — plain strings):
 *        seo.content.cat.heading        ← CATEGORY_HEADING_COPY
 *        seo.content.cat.introFlower    ← CATEGORY_INTRO_FLOWER_COPY
 *        seo.content.cat.introNonFlower ← CATEGORY_INTRO_NONFLOWER_COPY
 *        seo.content.occ.heading        ← OCCASION_HEADING_COPY
 *        seo.content.occ.intro          ← OCCASION_INTRO_COPY
 *        seo.content.brand.heading      ← BRAND_HEADING_COPY
 *        seo.content.brand.intro.flowers ← BRAND_INTRO_FLOWERS_COPY
 *        seo.content.brand.intro.food    ← BRAND_INTRO_FOOD_COPY
 *        seo.content.brand.intro.general ← BRAND_INTRO_GENERAL_COPY
 *
 * The two files must stay identical for all three locales (en, ar, fr). If
 * someone updates the copy in shop.ts they must also update seo-shop-faqs.mjs
 * (and vice-versa) or the server-rendered output will silently drift from what
 * SEOContentSection.tsx renders at runtime.
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
interface StringCopy {
  en: string;
  ar: string;
  fr: string;
}

// ── Load seo-shop-faqs.mjs via dynamic import ─────────────────────────────

async function loadFaqsMjs(): Promise<{
  CATEGORY_FAQ_COPY: FaqCopy;
  OCCASION_FAQ_COPY: FaqCopy;
  BRAND_FAQ_COPY: FaqCopy;
  CATEGORY_HEADING_COPY: StringCopy;
  CATEGORY_INTRO_FLOWER_COPY: StringCopy;
  CATEGORY_INTRO_NONFLOWER_COPY: StringCopy;
  OCCASION_HEADING_COPY: StringCopy;
  OCCASION_INTRO_COPY: StringCopy;
  BRAND_HEADING_COPY: StringCopy;
  BRAND_INTRO_FLOWERS_COPY: StringCopy;
  BRAND_INTRO_FOOD_COPY: StringCopy;
  BRAND_INTRO_GENERAL_COPY: StringCopy;
}> {
  const url = pathToFileURL(SEO_FAQS_MJS).href;
  return import(url);
}

// ── Load shop.ts strings via tsx-compatible import ────────────────────────

async function loadShopStrings(): Promise<{
  shopStrings: Record<string, { en: string; ar: string }>;
  shopStringsFr: Record<string, string>;
}> {
  const url = pathToFileURL(SHOP_TS).href;
  return import(url);
}

// ── Lookup helpers ────────────────────────────────────────────────────────

function getShopValue(
  shopStrings: Record<string, { en: string; ar: string }>,
  shopStringsFr: Record<string, string>,
  key: string,
  locale: Locale,
): string | undefined {
  if (locale === "fr") {
    return shopStringsFr[key];
  }
  return shopStrings[key]?.[locale];
}

// ── Mismatch types ────────────────────────────────────────────────────────

interface FaqMismatch {
  type: "faq";
  locale: Locale;
  kind: "cat" | "occ" | "brand";
  index: number;
  field: "q" | "a";
  shopKey: string;
  mjsExport: string;
  fromShop: string | undefined;
  fromMjs: string | undefined;
}

interface StringMismatch {
  type: "string";
  locale: Locale;
  shopKey: string;
  mjsExport: string;
  fromShop: string | undefined;
  fromMjs: string | undefined;
}

type AnyMismatch = FaqMismatch | StringMismatch;

// ── Collect FAQ mismatches ────────────────────────────────────────────────

function collectFaqMismatches(
  faqCopy: FaqCopy,
  kind: "cat" | "occ" | "brand",
  shopStrings: Record<string, { en: string; ar: string }>,
  shopStringsFr: Record<string, string>,
): FaqMismatch[] {
  const mismatches: FaqMismatch[] = [];
  for (const locale of LOCALES) {
    const items = faqCopy[locale];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const index = i + 1;
      for (const field of ["q", "a"] as const) {
        const shopKey = `seo.content.${kind}.faq.${index}.${field}`;
        const mjsExport =
          kind === "cat"
            ? "CATEGORY_FAQ_COPY"
            : kind === "occ"
              ? "OCCASION_FAQ_COPY"
              : "BRAND_FAQ_COPY";
        const fromMjs = item[field];
        const fromShop = getShopValue(shopStrings, shopStringsFr, shopKey, locale);
        if (fromShop !== fromMjs) {
          mismatches.push({
            type: "faq",
            locale,
            kind,
            index,
            field,
            shopKey,
            mjsExport,
            fromShop,
            fromMjs,
          });
        }
      }
    }
  }
  return mismatches;
}

// ── Collect heading/intro string mismatches ───────────────────────────────

function collectStringMismatches(
  copy: StringCopy,
  shopKey: string,
  mjsExport: string,
  shopStrings: Record<string, { en: string; ar: string }>,
  shopStringsFr: Record<string, string>,
): StringMismatch[] {
  const mismatches: StringMismatch[] = [];
  for (const locale of LOCALES) {
    const fromMjs = copy[locale];
    const fromShop = getShopValue(shopStrings, shopStringsFr, shopKey, locale);
    if (fromShop !== fromMjs) {
      mismatches.push({
        type: "string",
        locale,
        shopKey,
        mjsExport,
        fromShop,
        fromMjs,
      });
    }
  }
  return mismatches;
}

// ── Format mismatch for output ────────────────────────────────────────────

function shopKeyRef(shopKey: string, locale: Locale): string {
  if (locale === "fr") return `shopStringsFr["${shopKey}"]`;
  return `shopStrings["${shopKey}"].${locale}`;
}

function printMismatch(m: AnyMismatch): void {
  if (m.type === "faq") {
    const shopRef = shopKeyRef(m.shopKey, m.locale);
    const mjsRef = `${m.mjsExport}.${m.locale}[${m.index - 1}].${m.field}`;
    console.error(`\n  ✗ FAQ mismatch: ${shopRef}`);
    console.error(`      shop.ts (${SHOP_TS.replace(REPO_ROOT + "/", "")}):`);
    console.error(
      `        ${m.fromShop === undefined ? "<MISSING>" : JSON.stringify(m.fromShop)}`,
    );
    console.error(
      `      seo-shop-faqs.mjs (${SEO_FAQS_MJS.replace(REPO_ROOT + "/", "")}) [${mjsRef}]:`,
    );
    console.error(
      `        ${m.fromMjs === undefined ? "<MISSING>" : JSON.stringify(m.fromMjs)}`,
    );
  } else {
    const shopRef = shopKeyRef(m.shopKey, m.locale);
    const mjsRef = `${m.mjsExport}.${m.locale}`;
    console.error(`\n  ✗ String mismatch: ${shopRef}`);
    console.error(`      shop.ts (${SHOP_TS.replace(REPO_ROOT + "/", "")}):`);
    console.error(
      `        ${m.fromShop === undefined ? "<MISSING>" : JSON.stringify(m.fromShop)}`,
    );
    console.error(
      `      seo-shop-faqs.mjs (${SEO_FAQS_MJS.replace(REPO_ROOT + "/", "")}) [${mjsRef}]:`,
    );
    console.error(
      `        ${m.fromMjs === undefined ? "<MISSING>" : JSON.stringify(m.fromMjs)}`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [
    {
      CATEGORY_FAQ_COPY,
      OCCASION_FAQ_COPY,
      BRAND_FAQ_COPY,
      CATEGORY_HEADING_COPY,
      CATEGORY_INTRO_FLOWER_COPY,
      CATEGORY_INTRO_NONFLOWER_COPY,
      OCCASION_HEADING_COPY,
      OCCASION_INTRO_COPY,
      BRAND_HEADING_COPY,
      BRAND_INTRO_FLOWERS_COPY,
      BRAND_INTRO_FOOD_COPY,
      BRAND_INTRO_GENERAL_COPY,
    },
    { shopStrings, shopStringsFr },
  ] = await Promise.all([loadFaqsMjs(), loadShopStrings()]);

  const allMismatches: AnyMismatch[] = [
    // FAQ copy — category, occasion, brand
    ...collectFaqMismatches(CATEGORY_FAQ_COPY, "cat", shopStrings, shopStringsFr),
    ...collectFaqMismatches(OCCASION_FAQ_COPY, "occ", shopStrings, shopStringsFr),
    ...collectFaqMismatches(BRAND_FAQ_COPY, "brand", shopStrings, shopStringsFr),
    // Heading / intro copy — category
    ...collectStringMismatches(
      CATEGORY_HEADING_COPY,
      "seo.content.cat.heading",
      "CATEGORY_HEADING_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      CATEGORY_INTRO_FLOWER_COPY,
      "seo.content.cat.introFlower",
      "CATEGORY_INTRO_FLOWER_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      CATEGORY_INTRO_NONFLOWER_COPY,
      "seo.content.cat.introNonFlower",
      "CATEGORY_INTRO_NONFLOWER_COPY",
      shopStrings,
      shopStringsFr,
    ),
    // Heading / intro copy — occasion
    ...collectStringMismatches(
      OCCASION_HEADING_COPY,
      "seo.content.occ.heading",
      "OCCASION_HEADING_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      OCCASION_INTRO_COPY,
      "seo.content.occ.intro",
      "OCCASION_INTRO_COPY",
      shopStrings,
      shopStringsFr,
    ),
    // Heading / intro copy — brand
    ...collectStringMismatches(
      BRAND_HEADING_COPY,
      "seo.content.brand.heading",
      "BRAND_HEADING_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      BRAND_INTRO_FLOWERS_COPY,
      "seo.content.brand.intro.flowers",
      "BRAND_INTRO_FLOWERS_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      BRAND_INTRO_FOOD_COPY,
      "seo.content.brand.intro.food",
      "BRAND_INTRO_FOOD_COPY",
      shopStrings,
      shopStringsFr,
    ),
    ...collectStringMismatches(
      BRAND_INTRO_GENERAL_COPY,
      "seo.content.brand.intro.general",
      "BRAND_INTRO_GENERAL_COPY",
      shopStrings,
      shopStringsFr,
    ),
  ];

  if (allMismatches.length === 0) {
    console.log(
      "✓ Copy is in sync: seo-shop-faqs.mjs matches shop.ts for all locales (en, ar, fr).",
    );
    console.log(
      "  Checked: category/occasion/brand FAQ copy, heading copy, and intro copy.",
    );
    process.exit(0);
  }

  const faqCount = allMismatches.filter((m) => m.type === "faq").length;
  const stringCount = allMismatches.filter((m) => m.type === "string").length;
  const total = allMismatches.length;
  console.error(
    `\nFAQ/copy sync check failed: ${total} mismatch${total === 1 ? "" : "es"} found` +
      (faqCount > 0 && stringCount > 0
        ? ` (${faqCount} FAQ, ${stringCount} heading/intro)`
        : "") +
      ".\n",
  );
  console.error(
    "  The server-rendered copy in seo-shop-faqs.mjs has drifted from the",
  );
  console.error(
    "  on-page translation strings in shop.ts. Update both files together so",
  );
  console.error(
    "  the output emitted by seo-inject.mjs matches what SEOContentSection.tsx",
  );
  console.error("  renders at runtime.\n");

  for (const m of allMismatches) {
    printMismatch(m);
  }

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

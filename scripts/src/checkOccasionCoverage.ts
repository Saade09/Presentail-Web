/**
 * checkOccasionCoverage
 *
 * Detects occasions present in the Presentail OS catalog that are missing from
 * the OCCASIONS array in Shop.tsx or that lack a translation key in shop.ts.
 * This prevents the raw-slug fallback heading from appearing on live occasion
 * pages when a new occasion is added to the OS catalog without a matching
 * front-end entry.
 *
 * Two checks run in sequence:
 *
 *   1. Static check (no network required)
 *      Verifies that every entry in the OCCASIONS array in Shop.tsx has a
 *      matching translation key in src/locales/shop.ts.  This catches cases
 *      where a developer added the slug to OCCASIONS but forgot the locale
 *      entry (or vice-versa).
 *
 *   2. OS catalog check (requires PRESENTAIL_OS_API_KEY)
 *      Fetches all occasions from the OS /api/occasions endpoint and checks
 *      each slug against the OCCASIONS array and the shop.ts translation keys.
 *      When PRESENTAIL_OS_API_KEY is not set the check is skipped with a
 *      notice (exit code 0) so CI does not break on environments without
 *      access to the OS API.
 *
 * Exit codes:
 *   0 — all checks passed (or OS check skipped because key is absent)
 *   1 — at least one slug is uncovered
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-occasion-coverage
 *
 * Required env vars (optional — OS check is skipped when absent):
 *   PRESENTAIL_OS_API_URL   — defaults to https://os.presentail.com
 *   PRESENTAIL_OS_API_KEY   — read-only key is sufficient
 *   PRESENTAIL_OS_WORKSPACE — defaults to "presentail"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

// ── Paths ──────────────────────────────────────────────────────────────────

const SHOP_TSX = path.join(REPO_ROOT, "artifacts/presentail-web/src/pages/Shop.tsx");
const SHOP_LOCALE = path.join(REPO_ROOT, "artifacts/presentail-web/src/locales/shop.ts");

// ── OS API config ──────────────────────────────────────────────────────────

const OS_BASE_URL = (process.env.PRESENTAIL_OS_API_URL ?? "https://os.presentail.com").replace(/\/$/, "");
const OS_API_KEY = process.env.PRESENTAIL_OS_API_KEY ?? "";
const OS_WORKSPACE = process.env.PRESENTAIL_OS_WORKSPACE ?? "presentail";

// ── Parse OCCASIONS array from Shop.tsx ────────────────────────────────────

/**
 * Extracts { slug, labelKey } entries from the OCCASIONS const in Shop.tsx.
 * Matches lines of the form:
 *   { slug: "some-slug", labelKey: "shop.occ.someKey" },
 */
function parseOccasionsFromShopTsx(): Array<{ slug: string; labelKey: string }> {
  const src = fs.readFileSync(SHOP_TSX, "utf8");

  // Find the OCCASIONS block between `const OCCASIONS = [` and the matching `];`
  const blockMatch = src.match(/const OCCASIONS\s*=\s*\[([\s\S]*?)\];/);
  if (!blockMatch) {
    throw new Error(`Could not find OCCASIONS array in ${SHOP_TSX}`);
  }

  const block = blockMatch[1];
  const entryRe = /\{\s*slug:\s*"([^"]+)"\s*,\s*labelKey:\s*"([^"]+)"\s*\}/g;
  const entries: Array<{ slug: string; labelKey: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(block)) !== null) {
    entries.push({ slug: m[1], labelKey: m[2] });
  }

  if (entries.length === 0) {
    throw new Error(`Parsed 0 entries from OCCASIONS array in ${SHOP_TSX} — regex may need updating`);
  }

  return entries;
}

// ── Parse shop.occ.* translation keys from shop.ts ─────────────────────────

/**
 * Returns the set of translation keys defined in shop.ts whose key starts
 * with "shop.occ.".
 */
function parseOccasionTranslationKeys(): Set<string> {
  const src = fs.readFileSync(SHOP_LOCALE, "utf8");
  // Match "shop.occ.someKey": { … } lines.
  const re = /"(shop\.occ\.[^"]+)"\s*:/g;
  const keys = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

// ── Fetch OS occasions ─────────────────────────────────────────────────────

type OSOccasion = { id: string; slug: string; name: string };

async function fetchOsOccasions(): Promise<OSOccasion[]> {
  const url = new URL(`${OS_BASE_URL}/api/occasions`);
  url.searchParams.set("workspace", OS_WORKSPACE);
  url.searchParams.set("apiKey", OS_API_KEY);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "PresentailApp/1.0",
      "x-api-key": OS_API_KEY,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`OS occasions API returned HTTP ${res.status} ${res.statusText}`);
  }

  // The OS API returns { items: [...] } with snake_case fields.
  // Some deployments may also return { occasions: [...] } with camelCase.
  // Normalise both shapes to a common OSOccasion array.
  const data = (await res.json()) as {
    items?: Array<{ id: number | string; slug: string; name: string }>;
    occasions?: Array<{ id: number | string; slug: string; name: string }>;
  };

  const rawItems = data.items ?? data.occasions ?? null;
  if (!Array.isArray(rawItems)) {
    throw new Error(`Unexpected OS occasions response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return rawItems.map((item) => ({
    id: String(item.id),
    slug: item.slug,
    name: item.name,
  }));
}

// ── Checks ─────────────────────────────────────────────────────────────────

let hasFailure = false;

function fail(msg: string) {
  console.error(`  ✗  ${msg}`);
  hasFailure = true;
}

function pass(msg: string) {
  console.log(`  ✓  ${msg}`);
}

// ── Static check ───────────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────────────────────────────────────");
console.log("  Check 1 / 2 — Static: OCCASIONS entries vs shop.ts translation keys");
console.log("─────────────────────────────────────────────────────────────────────────\n");

const occasions = parseOccasionsFromShopTsx();
const translationKeys = parseOccasionTranslationKeys();

console.log(`  Found ${occasions.length} OCCASIONS entries in Shop.tsx`);
console.log(`  Found ${translationKeys.size} shop.occ.* keys in shop.ts\n`);

for (const { slug, labelKey } of occasions) {
  if (translationKeys.has(labelKey)) {
    pass(`${slug}  →  ${labelKey}  (translated)`);
  } else {
    fail(`${slug}  →  labelKey "${labelKey}" is missing from shop.ts`);
  }
}

// Also warn about translation keys that have no matching OCCASIONS entry
// (orphaned keys — the translation check already covers these, but log for
//  completeness so the developer can see everything in one place).
const knownLabelKeys = new Set(occasions.map((o) => o.labelKey));
const orphaned = [...translationKeys].filter((k) => !knownLabelKeys.has(k));
if (orphaned.length > 0) {
  console.log(`\n  Note: ${orphaned.length} shop.occ.* key(s) in shop.ts have no matching OCCASIONS entry:`);
  for (const k of orphaned) {
    console.log(`    - ${k}  (no OCCASIONS slug uses this labelKey)`);
  }
}

// ── OS catalog check ───────────────────────────────────────────────────────

console.log("\n─────────────────────────────────────────────────────────────────────────");
console.log("  Check 2 / 2 — OS catalog: OS occasions vs OCCASIONS array + shop.ts");
console.log("─────────────────────────────────────────────────────────────────────────\n");

if (!OS_API_KEY) {
  console.log("  PRESENTAIL_OS_API_KEY is not set — skipping OS catalog check.\n");
  console.log("  Set PRESENTAIL_OS_API_KEY to compare live catalog occasions against");
  console.log("  the OCCASIONS array in Shop.tsx.  Without this check, new occasions");
  console.log("  added to the OS catalog will only show the hyphen-split fallback");
  console.log("  heading on the web storefront until a developer notices and adds them.\n");
} else {
  /**
   * Some OS occasion ids differ from the canonical web URL slug we register in
   * the OCCASIONS array.  Map OS slug → web slug so the coverage check
   * recognises them as covered even after the rename.
   * e.g. OS returns slug "newborn" but the web OCCASIONS entry uses "new-born".
   */
  const OS_SLUG_TO_WEB_SLUG: Record<string, string> = {
    "newborn": "new-born",
  };

  const slugToLabelKey = new Map(occasions.map((o) => [o.slug, o.labelKey]));

  let osOccasions: OSOccasion[];
  try {
    osOccasions = await fetchOsOccasions();
  } catch (err) {
    console.error(`  ERROR fetching OS occasions: ${(err as Error).message}`);
    console.error("  Cannot complete OS catalog check.\n");
    hasFailure = true;
    osOccasions = [];
  }

  if (osOccasions.length > 0) {
    console.log(`  Found ${osOccasions.length} occasion(s) in the OS catalog\n`);

    for (const occ of osOccasions) {
      // Resolve the OS slug to the canonical web slug if an alias exists.
      const webSlug = OS_SLUG_TO_WEB_SLUG[occ.slug] ?? occ.slug;
      const labelKey = slugToLabelKey.get(webSlug);

      if (!labelKey) {
        fail(
          `"${occ.slug}" (OS id: ${occ.id}, name: "${occ.name}") — ` +
          `no entry in OCCASIONS array in Shop.tsx`,
        );
        console.error(
          `       Fix: add { slug: "${webSlug}", labelKey: "shop.occ.TODO" } to the OCCASIONS array\n` +
          `            in artifacts/presentail-web/src/pages/Shop.tsx and add the translation\n` +
          `            key "shop.occ.TODO" to artifacts/presentail-web/src/locales/shop.ts.`,
        );
      } else if (!translationKeys.has(labelKey)) {
        fail(
          `"${occ.slug}" — OCCASIONS entry points to labelKey "${labelKey}" which is missing from shop.ts`,
        );
        console.error(
          `       Fix: add "${labelKey}": { en: "…", ar: "…", fr: "…" } to\n` +
          `            artifacts/presentail-web/src/locales/shop.ts.`,
        );
      } else {
        pass(`"${occ.slug}"  →  ${labelKey}  (covered)`);
      }
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log("\n═════════════════════════════════════════════════════════════════════════");
if (hasFailure) {
  console.error("  ✗  check-occasion-coverage FAILED — see above for details.");
  console.error(
    "\n  Each uncovered OS occasion will show a generic hyphen-split heading\n" +
    "  (e.g. \"New Born\") on the web storefront instead of the correct,\n" +
    "  translated title.  Add the missing OCCASIONS entry and translation key\n" +
    "  to fix it.\n",
  );
  process.exit(1);
} else {
  console.log("  ✓  check-occasion-coverage passed.\n");
  process.exit(0);
}

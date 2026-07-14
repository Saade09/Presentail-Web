/**
 * checkCrossPlatformCopySync
 *
 * Detects copy drift between the mobile and web translation catalogues for
 * strings that must stay identical across both platforms.
 *
 * Currently tracked pairs (mobile key → web key):
 *
 *   translations.{EN,AR,FR}.ifNeeded
 *     ↔  productStrings["product.benefit.noAddress.sub"].{en,ar}
 *        productStringsFr["product.benefit.noAddress.sub"]
 *
 * Files are read as plain text and parsed with regex — no dynamic import() —
 * so this checker can run as a spawned child process inside the check-translations
 * orchestrator without triggering ES Module loader cycles.
 *
 * When someone updates one side and forgets the other, this script exits 1
 * and prints the mismatch so CI catches it before merge.
 *
 * Exit codes:
 *   0 — all paired strings match across all locales
 *   1 — at least one mismatch found
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-cross-platform-copy-sync
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const MOBILE_TRANSLATIONS_FILE = path.join(
  REPO_ROOT,
  "artifacts/presentail/lib/translations.ts",
);
const WEB_PRODUCT_FILE = path.join(
  REPO_ROOT,
  "artifacts/presentail-web/src/locales/product.ts",
);

// ── Text parsers ───────────────────────────────────────────────────────────────

/**
 * Extract the value of a camelCase key from a named locale block in
 * artifacts/presentail/lib/translations.ts.
 *
 * The blocks look like:
 *   const EN = {
 *     ...
 *     ifNeeded: "some string",
 *     ...
 *   };
 *
 * Returns undefined when the block or key is not found.
 */
function extractMobileLocaleValue(
  src: string,
  localeName: string,
  key: string,
): string | undefined {
  // Match the locale block: `const EN = { ... };` where `};` is at column 0
  const blockRe = new RegExp(
    `^const ${localeName}(?:[^=]*)=\\s*\\{([\\s\\S]*?)^};`,
    "m",
  );
  const blockMatch = src.match(blockRe);
  if (!blockMatch) return undefined;
  const block = blockMatch[1];

  // Match `  key: "value"` or `  key: 'value'` inside the block.
  // Escaped characters inside the string are allowed via `(?:[^"\\]|\\.)*`.
  const doubleRe = new RegExp(
    `^\\s+${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
    "m",
  );
  const singleRe = new RegExp(
    `^\\s+${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`,
    "m",
  );

  const dm = block.match(doubleRe);
  if (dm) return dm[1];
  const sm = block.match(singleRe);
  if (sm) return sm[1];
  return undefined;
}

/**
 * Extract the `en` or `ar` field of a Dict entry from a web locale module.
 *
 * Dict entries look like:
 *   "product.benefit.noAddress.sub": { en: "…", ar: "…" },
 *
 * Returns undefined when the entry or field is not found, or when the value
 * is a template literal (which we conservatively skip).
 */
function extractWebDictField(
  src: string,
  dotKey: string,
  field: "en" | "ar",
): string | undefined {
  // Escape the dot-separated key for use in a regex
  const escapedKey = dotKey.replace(/\./g, "\\.");

  // Match the Dict entry — the key followed by `{ ... }` on one or more lines.
  // We use a non-greedy match for the inner object up to the closing `}`.
  const entryRe = new RegExp(
    `["']${escapedKey}["']:\\s*\\{([^}]*)\\}`,
    "s",
  );
  const entryMatch = src.match(entryRe);
  if (!entryMatch) return undefined;
  const inner = entryMatch[1];

  // Extract `en: "…"` or `ar: "…"` (double- or single-quoted)
  const fieldDoubleRe = new RegExp(`\\b${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const fieldSingleRe = new RegExp(`\\b${field}:\\s*'((?:[^'\\\\]|\\\\.)*)'`);

  const dm = inner.match(fieldDoubleRe);
  if (dm) return dm[1];
  const sm = inner.match(fieldSingleRe);
  if (sm) return sm[1];
  return undefined;
}

/**
 * Extract a plain string value from a `Record<string, string>` export.
 *
 * Entries look like:
 *   "product.benefit.noAddress.sub": "Nous collecterons l'adresse pour vous",
 *
 * Returns undefined when not found.
 */
function extractWebFrValue(src: string, dotKey: string): string | undefined {
  const escapedKey = dotKey.replace(/\./g, "\\.");

  // Match `"key": "value"` — must NOT be followed by `{` (that would be a
  // Dict entry, not a plain-string entry).
  const doubleRe = new RegExp(
    `["']${escapedKey}["']:\\s*"((?:[^"\\\\]|\\\\.)*)"(?!\\s*,?\\s*\\{)`,
  );
  const singleRe = new RegExp(
    `["']${escapedKey}["']:\\s*'((?:[^'\\\\]|\\\\.)*)'(?!\\s*,?\\s*\\{)`,
  );

  const dm = src.match(doubleRe);
  if (dm) return dm[1];
  const sm = src.match(singleRe);
  if (sm) return sm[1];
  return undefined;
}

// ── Pair definitions ──────────────────────────────────────────────────────────

interface LocalePair {
  /** Human-readable label for error messages */
  description: string;
  /** camelCase key in the mobile locale block (e.g. "ifNeeded") */
  mobileKey: string;
  /** Locale block name in translations.ts (e.g. "EN", "AR", "FR") */
  mobileLang: "EN" | "AR" | "FR";
  /** Dot-notation key in the web locale module (e.g. "product.benefit.noAddress.sub") */
  webKey: string;
  /** How to extract the value from the web module */
  webExtract: (src: string) => string | undefined;
  /** Human-readable locale label for the mobile side */
  mobileLocaleLabel: string;
  /** Human-readable locale label for the web side */
  webLocaleLabel: string;
}

const WEB_PRODUCT_KEY = "product.benefit.noAddress.sub";

const PAIRS: LocalePair[] = [
  {
    description: "No Address Hassle — sub-copy (EN)",
    mobileKey: "ifNeeded",
    mobileLang: "EN",
    webKey: WEB_PRODUCT_KEY,
    webExtract: (src) => extractWebDictField(src, WEB_PRODUCT_KEY, "en"),
    mobileLocaleLabel: "EN",
    webLocaleLabel: "en",
  },
  {
    description: "No Address Hassle — sub-copy (AR)",
    mobileKey: "ifNeeded",
    mobileLang: "AR",
    webKey: WEB_PRODUCT_KEY,
    webExtract: (src) => extractWebDictField(src, WEB_PRODUCT_KEY, "ar"),
    mobileLocaleLabel: "AR",
    webLocaleLabel: "ar",
  },
  {
    description: "No Address Hassle — sub-copy (FR)",
    mobileKey: "ifNeeded",
    mobileLang: "FR",
    webKey: WEB_PRODUCT_KEY,
    webExtract: (src) => extractWebFrValue(src, WEB_PRODUCT_KEY),
    mobileLocaleLabel: "FR",
    webLocaleLabel: "fr",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

interface Mismatch {
  pair: LocalePair;
  mobileValue: string | undefined;
  webValue: string | undefined;
}

const mobileSrc = fs.readFileSync(MOBILE_TRANSLATIONS_FILE, "utf8");
const webProductSrc = fs.readFileSync(WEB_PRODUCT_FILE, "utf8");

const mismatches: Mismatch[] = [];

for (const pair of PAIRS) {
  const mobileValue = extractMobileLocaleValue(
    mobileSrc,
    pair.mobileLang,
    pair.mobileKey,
  );
  const webValue = pair.webExtract(webProductSrc);

  if (mobileValue !== webValue) {
    mismatches.push({ pair, mobileValue, webValue });
  }
}

if (mismatches.length === 0) {
  console.log(
    "✓ Cross-platform copy is in sync: all tracked pairs match across EN, AR, and FR.",
  );
  process.exit(0);
}

const mobileRel = MOBILE_TRANSLATIONS_FILE.replace(REPO_ROOT + "/", "");
const webRel = WEB_PRODUCT_FILE.replace(REPO_ROOT + "/", "");

console.error(
  `\nCross-platform copy drift detected: ${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"} found.\n`,
);
console.error(
  "  The following strings must be kept identical between the mobile and web",
);
console.error(
  "  translation catalogues. Update both sides together so the copy stays in sync.\n",
);

for (const { pair, mobileValue, webValue } of mismatches) {
  const mobileRef = `translations.${pair.mobileLang}.${pair.mobileKey}`;
  const webRef =
    pair.webLocaleLabel === "fr"
      ? `productStringsFr["${pair.webKey}"]`
      : `productStrings["${pair.webKey}"].${pair.webLocaleLabel}`;

  console.error(`  ✗ ${pair.description}`);
  console.error(`      mobile (${mobileRel}) [${mobileRef}]:`);
  console.error(
    `        ${mobileValue === undefined ? "<MISSING>" : JSON.stringify(mobileValue)}`,
  );
  console.error(`      web    (${webRel}) [${webRef}]:`);
  console.error(
    `        ${webValue === undefined ? "<MISSING>" : JSON.stringify(webValue)}`,
  );
  console.error();
}

console.error(
  "  To fix: update the mismatched string in the lagging file so both sides are identical.",
);
console.error(
  "  Run `pnpm --filter @workspace/scripts run check-cross-platform-copy-sync` to verify.\n",
);

process.exit(1);

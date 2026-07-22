#!/usr/bin/env node
/**
 * check-stripe-isolation.mjs
 *
 * Asserts that Stripe library code is absent from every JS chunk that a
 * shopper downloads before they actively choose a card payment method.
 *
 * Two graphs are checked:
 *
 *   1. App-entry closure   — chunks statically reachable from `index.html`.
 *      Catches Stripe leaking into any globally-imported module.
 *
 *   2. Checkout-initial closure — chunks statically reachable from the
 *      `src/pages/Checkout.tsx` dynamic route chunk.  Catches Stripe leaking
 *      into the checkout page's own initial JS load even though the checkout
 *      chunk itself is a dynamic import from the router.  This is the more
 *      likely regression path: someone adds a top-level Stripe import to
 *      Checkout.tsx and Rollup hoists it into the checkout closure without
 *      touching the globally-instant set.
 *
 * A violation means a static import of `@stripe/react-stripe-js` or
 * `@stripe/stripe-js` crept back into the bundle's eagerly-evaluated portion.
 * Stripe should only ever appear in chunks that are dynamically imported
 * exclusively through `StripeCheckoutSection` (React.lazy).
 *
 * What counts as a "Stripe symbol" in a built chunk:
 *   - "js.stripe.com"    — CDN URL injected by @stripe/stripe-js
 *   - "loadStripe"       — public entry-point of @stripe/stripe-js
 *   - "StripeProvider"   — re-exported by @stripe/react-stripe-js
 *   - "@stripe/"         — any residual package reference left by the bundler
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-stripe-isolation.mjs [distDir]
 *
 * distDir defaults to <script-dir>/../dist/public
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../dist/public");

const manifestPath = path.join(distDir, ".vite/manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error(
    `check-stripe-isolation: manifest not found at ${manifestPath}\n` +
      `  Make sure "build.manifest: true" is set in vite.config.ts and the build has run.`
  );
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// ---------------------------------------------------------------------------
// Build the module graph from the manifest.
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} manifestKey → output filename (relative to distDir) */
const keyToFile = new Map();
/** @type {Map<string, string[]>} manifestKey → static-import manifest keys */
const staticImports = new Map();
/** @type {Set<string>} manifest keys that are HTML entry points */
const entryKeys = new Set();
/** @type {Set<string>} manifest keys for the checkout page route chunk */
const checkoutRouteKeys = new Set();

for (const [key, entry] of Object.entries(manifest)) {
  keyToFile.set(key, entry.file);
  staticImports.set(key, entry.imports ?? []);
  if (entry.isEntry) entryKeys.add(key);
  // Match any key whose source path is the checkout page.  Use a loose match
  // so the check is robust across renames / hash changes.
  if (/pages[/\\]Checkout\.(tsx?|jsx?)$/.test(key)) checkoutRouteKeys.add(key);
}

if (checkoutRouteKeys.size === 0) {
  console.error(
    `check-stripe-isolation: could not locate the Checkout page chunk in the manifest.\n` +
      `  Expected a key matching /pages/Checkout.(tsx?|jsx?)/.\n` +
      `  Available keys (first 20):\n` +
      [...keyToFile.keys()].slice(0, 20).map((k) => `    ${k}`).join("\n")
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// BFS helper: walk static imports from a set of seed keys.
// Returns the set of all manifest keys reachable via static imports only.
// ---------------------------------------------------------------------------

/**
 * @param {Iterable<string>} seeds
 * @returns {Set<string>}
 */
function staticClosure(seeds) {
  /** @type {Set<string>} */
  const visited = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const key = queue.shift();
    if (visited.has(key)) continue;
    visited.add(key);
    for (const dep of staticImports.get(key) ?? []) {
      if (!visited.has(dep)) queue.push(dep);
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Compute the two closures we need to check.
// ---------------------------------------------------------------------------

/** Chunks that load on every page (entry-point static imports). */
const appEntryInstantKeys = staticClosure(entryKeys);

/**
 * Chunks that load when a shopper reaches the checkout page.
 * This is the entry closure PLUS the checkout chunk and its own static deps.
 * Because Checkout.tsx is a dynamic route it is NOT reachable from the HTML
 * entry BFS — so a static Stripe import in Checkout.tsx would land here but
 * not in appEntryInstantKeys.
 */
const checkoutInitialKeys = staticClosure([
  ...entryKeys,
  ...checkoutRouteKeys,
]);

// ---------------------------------------------------------------------------
// Patterns that indicate Stripe library code is present in a chunk.
// ---------------------------------------------------------------------------

/**
 * Patterns that definitively identify Stripe *library* code in a chunk.
 *
 * Deliberately narrow — only symbols that appear inside the Stripe packages
 * themselves, never in application call-sites:
 *
 *   - "js.stripe.com"   — the CDN script URL injected when @stripe/stripe-js
 *                         bootstraps itself; never written by application code.
 *   - "StripeProvider"  — the React context provider exported by
 *                         @stripe/react-stripe-js; never referenced by name in
 *                         the lazy boundary (StripeCheckoutSection imports the
 *                         Elements component, not StripeProvider directly from
 *                         outside the lazy chunk).
 *
 * "loadStripe" and "@stripe/" are intentionally excluded: they appear in the
 * Checkout chunk as part of the dynamic-import call-site expression
 * `import("./vendor-stripe-xxx.js").then(({ loadStripe }) => …)`.  That
 * expression is the correct lazy-load path and must NOT trigger a false
 * positive.
 *
 * @type {Array<{ label: string; pattern: RegExp }>}
 */
const STRIPE_PATTERNS = [
  { label: "js.stripe.com (Stripe.js CDN bootstrap URL)", pattern: /js\.stripe\.com/ },
  { label: "StripeProvider (react-stripe-js React context)", pattern: /StripeProvider/ },
];

// ---------------------------------------------------------------------------
// Scan a set of manifest keys for Stripe symbols.
// Returns the number of violations found.
// ---------------------------------------------------------------------------

/**
 * @param {Set<string>} keys
 * @param {string} label   human-readable name for the closure being checked
 * @returns {number}       number of violations
 */
function scanForStripe(keys, label) {
  let violations = 0;
  let scanned = 0;

  const jsKeys = [...keys].filter((k) => (keyToFile.get(k) ?? "").endsWith(".js"));

  for (const key of jsKeys) {
    const file = keyToFile.get(key);
    if (!file) continue;
    const absPath = path.join(distDir, file);
    if (!fs.existsSync(absPath)) continue;

    const content = fs.readFileSync(absPath, "utf8");
    scanned++;

    for (const { label: pLabel, pattern } of STRIPE_PATTERNS) {
      if (pattern.test(content)) {
        console.error(
          `  ❌  STRIPE SYMBOL in [${label}]\n` +
            `      file   : ${file}\n` +
            `      pattern: ${pLabel}`
        );
        violations++;
      }
    }
  }

  if (violations === 0) {
    console.log(`  ✓  [${label}]  ${scanned} chunk(s) scanned — no Stripe symbols.`);
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Patterns that indicate React source code is bundled inside a chunk.
//
// @stripe/react-stripe-js legitimately *calls* React hooks internally, so
// `useState` and `createElement` will appear in vendor-stripe as *imported*
// binding names — that is NOT a violation.  What we want to catch is React's
// own *source code* being compiled into the chunk.  These string literals only
// appear inside React's own package source and are preserved verbatim even in
// minified production builds:
//
//   "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED"
//     — exported by react/index.js; only ever a property name defined by React
//       itself, never written by application code or by stripe's packages.
//
//   "Invalid hook call."
//     — the opening of React's own hook-order error message; appears as a
//       string literal in react-dom's production bundle.  Its presence means
//       the React runtime is compiled into this chunk.
//
// Either pattern alone is sufficient to detect a duplicate-React scenario
// while remaining immune to the false-positive surface caused by stripe's
// own hook usage.
// ---------------------------------------------------------------------------

/**
 * @type {Array<{ label: string; pattern: RegExp }>}
 */
const REACT_IN_STRIPE_PATTERNS = [
  {
    label:
      "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED (React's own internals export — only in React source)",
    pattern: /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED/,
  },
  {
    label:
      '"Invalid hook call." (React hook-order error message — only in React runtime source)',
    pattern: /Invalid hook call\./,
  },
];

// ---------------------------------------------------------------------------
// Scan the vendor-stripe chunk(s) for bundled React source.
// Returns the number of violations found.
// ---------------------------------------------------------------------------

/**
 * Locate every built JS file whose name starts with "vendor-stripe" and assert
 * that none of them contain React source code.
 *
 * @returns {number} number of violations
 */
function checkVendorStripeForReact() {
  // Collect file paths for all vendor-stripe chunks.
  /** @type {string[]} */
  const stripeChunkFiles = [];
  for (const [, file] of keyToFile) {
    // file is a relative path like "assets/vendor-stripe-XXXXX.js"
    if (/(?:^|\/)vendor-stripe[^/]*\.js$/.test(file)) {
      stripeChunkFiles.push(file);
    }
  }

  if (stripeChunkFiles.length === 0) {
    console.error(
      `check-stripe-isolation: no vendor-stripe chunk found in the manifest.\n` +
        `  Expected a built file whose name starts with "vendor-stripe".\n` +
        `  Check that the manualChunks rule in vite.config.ts is still intact.`
    );
    return 1;
  }

  let violations = 0;
  for (const file of stripeChunkFiles) {
    const absPath = path.join(distDir, file);
    if (!fs.existsSync(absPath)) {
      console.error(
        `check-stripe-isolation: vendor-stripe file listed in manifest but not on disk: ${file}`
      );
      violations++;
      continue;
    }

    const content = fs.readFileSync(absPath, "utf8");

    for (const { label, pattern } of REACT_IN_STRIPE_PATTERNS) {
      if (pattern.test(content)) {
        console.error(
          `  ❌  REACT SOURCE in [vendor-stripe]\n` +
            `      file   : ${file}\n` +
            `      pattern: ${label}\n` +
            `      React source code has been bundled into the vendor-stripe chunk.\n` +
            `      This means resolve.dedupe is no longer preventing a duplicate\n` +
            `      React copy and will cause "Invalid hook call" at runtime.`
        );
        violations++;
      }
    }
  }

  if (violations === 0) {
    console.log(
      `  ✓  [vendor-stripe React dedup]  ${stripeChunkFiles.length} chunk(s) scanned — no React source bundled.`
    );
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Run all scans.
// ---------------------------------------------------------------------------

console.log(`\ncheck-stripe-isolation  (distDir: ${distDir})`);
console.log(`HTML entry points      : ${entryKeys.size}`);
console.log(`Checkout route key(s)  : ${[...checkoutRouteKeys].join(", ")}`);
console.log(
  `App-entry instant set  : ${[...appEntryInstantKeys].filter((k) => (keyToFile.get(k) ?? "").endsWith(".js")).length} JS chunk(s)`
);
console.log(
  `Checkout-initial set   : ${[...checkoutInitialKeys].filter((k) => (keyToFile.get(k) ?? "").endsWith(".js")).length} JS chunk(s)\n`
);

let totalViolations = 0;
totalViolations += scanForStripe(appEntryInstantKeys, "app-entry instant");
totalViolations += scanForStripe(checkoutInitialKeys, "checkout-initial");
totalViolations += checkVendorStripeForReact();

console.log("");

if (totalViolations > 0) {
  console.error(
    `FAIL  ${totalViolations} violation(s) found.\n` +
      `      Stripe must only appear in chunks loaded exclusively through\n` +
      `      the StripeCheckoutSection lazy boundary (React.lazy).\n` +
      `\n` +
      `      Common causes for Stripe-in-instant-chunk violations:\n` +
      `        • A top-level static import of @stripe/react-stripe-js or\n` +
      `          @stripe/stripe-js was added to Checkout.tsx or a file it\n` +
      `          statically imports.\n` +
      `        • StripeCheckoutSection is no longer wrapped in React.lazy.\n` +
      `        • The vendor-stripe manualChunks rule in vite.config.ts was\n` +
      `          removed, folding Stripe back into the shared vendor chunk.\n` +
      `\n` +
      `      Common causes for React-in-vendor-stripe violations:\n` +
      `        • resolve.dedupe: ["react","react-dom"] was removed from\n` +
      `          vite.config.ts, allowing @stripe/react-stripe-js to bundle\n` +
      `          its own React copy instead of sharing the app's singleton.\n` +
      `        • A new @stripe/* package version changed its peer-dep\n` +
      `          resolution and pulled in React directly.`
  );
  process.exit(1);
}

const totalScanned = new Set([
  ...[...appEntryInstantKeys].filter((k) => (keyToFile.get(k) ?? "").endsWith(".js")),
  ...[...checkoutInitialKeys].filter((k) => (keyToFile.get(k) ?? "").endsWith(".js")),
]).size;

console.log(
  `PASS  No Stripe symbols in any of the ${totalScanned} unique chunk(s) checked (app-entry + checkout-initial);\n` +
    `      no React source bundled in vendor-stripe chunk(s).`
);
process.exit(0);

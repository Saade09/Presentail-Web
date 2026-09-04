/**
 * locales/index.ts — Synchronous core string catalogue for the Presentail web storefront.
 *
 * ─── Catalogue structure ──────────────────────────────────────────────────────
 *
 * Translation keys live in per-domain files under `src/locales/`:
 *
 *   nav.ts · home.ts · shop.ts · product.ts · cart.ts · checkout.ts
 *   account.ts · auth.ts · brands.ts · order.ts · seo.ts · footer.ts
 *   common.ts
 *
 * Each domain file exports two objects:
 *   • `<domain>Strings`   — Dict  { en: "…", ar: "…" }  (assembled into STRINGS)
 *   • `<domain>StringsFr` — Record<string, string>       (assembled into `fr.ts`)
 *
 * This index merges the English/Arabic core map. French and Greek are assembled
 * by their own modules and loaded on demand by `locales/load.ts`.
 *
 * ─── Three-language contract ─────────────────────────────────────────────────
 *
 * Every user-facing string must appear in all four locales: EN, AR, FR, and EL.
 * EN + AR live together in the Dict entry; FR and EL live in matching companion
 * objects and are loaded only after those languages are selected.
 *
 * ─── Adding new strings (do all three in the same commit) ───────────────────
 *
 * 1. Pick the most relevant domain file (or create a new one and re-export it
 *    here).
 * 2. Add the key to `<domain>Strings` with both `en` and `ar` values.
 * 3. Add the matching French string to `<domain>StringsFr` under the same key.
 *
 * All three changes must land in the same commit.  A PR that adds an EN + AR
 * entry without its FR counterpart (or vice-versa) will be caught by the CI
 * `check-translations` step and blocked from merging.
 *
 * ─── Brand names and short values ────────────────────────────────────────────
 *
 * Strings under 25 characters are skipped by the copy-paste identical check,
 * so short brand names, abbreviations, and internationally recognised terms
 * (e.g. "PayPal", "Express", "USD") are safe to leave identical across locales
 * without any annotation.
 *
 * ─── // no-translate annotation ──────────────────────────────────────────────
 *
 * For longer strings (25+ characters) that are legitimately identical in every
 * locale — e.g. a brand tagline used verbatim worldwide, a URL, or a legal
 * company name — add a trailing `// no-translate` comment to the Dict entry so
 * the checker knows the match is intentional rather than a copy-paste mistake.
 *
 * Single-line Dict entry:
 *   "brand.name": { en: "Presentail — Flowers & Gifts", ar: "Presentail — Flowers & Gifts" }, // no-translate
 *
 * Multi-line Dict entry (comment on the closing brace line):
 *   "brand.tagline": {
 *     en: "Gift with Love — Presentail",
 *     ar: "Gift with Love — Presentail",
 *   }, // no-translate — brand tagline, used verbatim in all locales
 *
 * FR string entry:
 *   "brand.name": "Presentail — Flowers & Gifts", // no-translate
 *
 * See `seo.siteName` in `locales/seo.ts` for a concrete reference example.
 *
 * Note: the annotation is only needed when both conditions apply — the value is
 * identical across locales AND the EN string is 25+ characters.  Shorter
 * strings (< 25 chars) are auto-skipped regardless of any annotation.
 *
 * ─── Catching issues locally before push ─────────────────────────────────────
 *
 * Run the translation-consistency script before opening a PR to catch problems
 * before CI does:
 *
 *   pnpm --filter @workspace/scripts run check-translations
 *
 * The script covers both the mobile catalogue (`artifacts/presentail/lib/translations.ts`)
 * and this web catalogue.  For the web it runs six checks:
 *
 *   1. UNUSED KEYS       — keys defined in STRINGS / STRINGS_FR but never
 *                          referenced by a t("…") call in any web source file.
 *                          This is the check that catches orphan keys like
 *                          `nav.expressDelivery` after they are removed from
 *                          source but left behind in the locale files.
 *   2. FR COVERAGE       — keys in STRINGS that have no matching FR entry, and
 *                          FR-only orphan keys absent from STRINGS.
 *   3. UNDEFINED REFS    — static t("key") call sites whose key is not in
 *                          STRINGS (would render as blank text).
 *   4. ARABIC FIELD      — Dict entries missing the `ar` field entirely.
 *   5. EMPTY VALUES      — Dict entries where `en` or `ar` is present but
 *                          blank after trimming (silently renders as "").
 *   6. COPY-PASTE VALUES — AR or FR values byte-for-byte identical to EN for
 *                          strings of 25+ characters (likely untranslated).
 *
 * Exit 0 = all checks pass.  Exit 1 = details printed to stderr.
 * Add --verbose to list every scanned source file.
 *
 * ─── CI gates ─────────────────────────────────────────────────────────────────
 *
 * All six checks above run automatically in the `check-translations` GitHub
 * Actions workflow on every PR that touches `artifacts/presentail-web/**` or
 * `lib/**`.  A PR with an unused key — including one left behind after its
 * t("…") call-site was deleted — will be blocked from merging.
 *
 * The same script also runs in the `.husky/pre-commit` hook (alongside the
 * hardcoded-strings check) so violations are caught locally before the push:
 *
 *   cp .husky/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Rule of thumb when removing a t("…") call-site:
 *   Always delete the matching key from the locale domain file in the same
 *   commit.  The unused-key checker will catch it if you forget, but fixing
 *   it after the fact means an extra round-trip through CI.
 *
 * See the header comment in `artifacts/presentail/lib/translations.ts` for the
 * mobile catalogue workflow and the `// no-translate` annotation convention
 * used there for longer brand strings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Dict } from "./types";

import { navStrings } from "./nav";
import { homeStrings } from "./home";
import { shopStrings } from "./shop";
import { productStrings } from "./product";
import { cartStrings } from "./cart";
import { checkoutStrings } from "./checkout";
import { accountStrings } from "./account";
import { authStrings } from "./auth";
import { brandsStrings } from "./brands";
import { orderStrings } from "./order";
import { seoStrings } from "./seo";
import { footerStrings } from "./footer";
import { commonStrings } from "./common";
import { partnerStrings } from "./partner";
import { campaignStrings } from "./campaign";

export type { Dict };

export const STRINGS: Dict = {
  ...navStrings,
  ...homeStrings,
  ...shopStrings,
  ...productStrings,
  ...cartStrings,
  ...checkoutStrings,
  ...accountStrings,
  ...authStrings,
  ...brandsStrings,
  ...orderStrings,
  ...seoStrings,
  ...footerStrings,
  ...commonStrings,
  ...partnerStrings,
  ...campaignStrings,
};

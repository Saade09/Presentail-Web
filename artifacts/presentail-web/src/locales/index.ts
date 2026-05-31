/**
 * locales/index.ts — Three-language string catalogue for the Presentail web storefront.
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
 *   • `<domain>StringsFr` — Record<string, string>       (assembled into STRINGS_FR)
 *
 * This index merges them into the two flat maps that `LocaleContext` consumes.
 *
 * ─── Three-language contract ─────────────────────────────────────────────────
 *
 * Every user-facing string must appear in all three locales: EN, AR, and FR.
 * EN + AR live together in the Dict entry; FR lives in the matching *Fr object.
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
 * For longer strings that are legitimately identical in every locale (very
 * rare — e.g. a URL or a long brand tagline used verbatim in Arabic and
 * French), add an inline comment so reviewers understand it is intentional:
 *
 *   "brand.tagline": { en: "Presentail — Gift with Love", ar: "Presentail — Gift with Love" }, // brand name, same in AR
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
 * See the header comment in `artifacts/presentail/lib/translations.ts` for the
 * mobile catalogue workflow and the `// no-translate` annotation convention
 * used there for longer brand strings.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Dict } from "./types";

import { navStrings, navStringsFr } from "./nav";
import { homeStrings, homeStringsFr } from "./home";
import { shopStrings, shopStringsFr } from "./shop";
import { productStrings, productStringsFr } from "./product";
import { cartStrings, cartStringsFr } from "./cart";
import { checkoutStrings, checkoutStringsFr } from "./checkout";
import { accountStrings, accountStringsFr } from "./account";
import { authStrings, authStringsFr } from "./auth";
import { brandsStrings, brandsStringsFr } from "./brands";
import { orderStrings, orderStringsFr } from "./order";
import { seoStrings, seoStringsFr } from "./seo";
import { footerStrings, footerStringsFr } from "./footer";
import { commonStrings, commonStringsFr } from "./common";

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
};

export const STRINGS_FR: Record<string, string> = {
  ...navStringsFr,
  ...homeStringsFr,
  ...shopStringsFr,
  ...productStringsFr,
  ...cartStringsFr,
  ...checkoutStringsFr,
  ...accountStringsFr,
  ...authStringsFr,
  ...brandsStringsFr,
  ...orderStringsFr,
  ...seoStringsFr,
  ...footerStringsFr,
  ...commonStringsFr,
};

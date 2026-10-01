# CI baseline on `main` (diagnostic report)

Requested by Lea Farah (QA). Diagnostic only: no application, test, workflow or
config code was changed. This file is the only change in the PR.

| | |
|---|---|
| Commit tested | `799c3f248b0a72b8f10fdac6ba99ca386143696e` (`main`, unmodified, nothing from PR #4 applied) |
| Date | 2026-10-01 (UTC) |
| Node | v24.21.0 |
| pnpm | 10.26.1 (reported by `pnpm install`) |
| Install | `pnpm install --frozen-lockfile` — OK, lockfile unchanged |
| Runner | GitHub Actions `ubuntu` runner (Linux 6.17, Azure) driven by an agent with a restricted command allowlist |

Each command was copied from `.github/workflows/*.yml` and run locally from the
repo root, after `pnpm run typecheck:libs` (which passed). A CI job stops at its
first failing step. Where a job has several steps, the table shows the
**first failing step** as the job result. Later steps are listed separately
under "Additional steps".

## Results

| # | Job (workflow file) | Command(s) run | Result on main | Failure count | Cause (quoted) |
|---|---|---|---|---|---|
| 1 | ESLint – web app (`web-lint.yml`) | `pnpm --filter @workspace/presentail-web run lint` then `… run typecheck` | **fail** (lint step) | 140 errors (99 `presentail/no-orphan-translation-key`, 41 `@typescript-eslint/no-unused-vars`) | `✖ 140 problems (140 errors, 0 warnings)` — e.g. `src/App.tsx 27:3 error 'loadFavorites' is defined but never used` |
| 2 | Unit tests – web app (`web-lint.yml`) | `pnpm --filter @workspace/presentail-web run test` | **fail** | 186 failed tests in 41 of 169 files, plus 6 unhandled errors (2363 passed, 369 skipped) | `Test Files 41 failed \| 128 passed (169)` / `Tests 186 failed \| 2363 passed \| 369 skipped (2918)`. Main causes: `Error: [vitest] No "trackFunnelEvent" export is defined on the "@/lib/analytics" mock` (Cart*/Checkout*/CheckoutSignInCard…), and 13 suites `Error: serve.mjs on :<port> did not become ready within 12000ms` (see note A) |
| 3 | Type-check test files (`typecheck-tests.yml`) | `pnpm run typecheck:tests` then `pnpm run test:publish-provenance` | **fail** (first step) | 20 TS errors, all in `artifacts/presentail-web` test files (api-server passed) | e.g. `src/components/delivery/cartDeliveryAvailability.test.ts(85,40): error TS2353: Object literal may only specify known properties, and 'slotId' does not exist in type …`; `src/lib/weekly-seo-regressions.test.ts(5,33): error TS7016: Could not find a declaration file for module '../../sitemap.mjs'` |
| 4 | Locale dictionary tests (web) (`check-translations.yml`) | `pnpm --filter @workspace/presentail-web run test` (same as #2; CI uses **Node 20**, I ran Node 24 because Node 20 isn't available here) | Command: **fail** (same 186 failures as #2). **CI job: green by construction** (note B) | 186 (command) / 0 (job) | Command fails as in #2, but the workflow step can never fail. See note B |
| 5 | Unified translation check (mobile + web + API) (`check-translations.yml`) | `pnpm --filter @workspace/scripts run test` → `… run check-legacy-domain` → `… run check-translations` | **fail** (first step) | 12 failed tests in 4 files (1145 passed) | `Tests 12 failed \| 1145 passed (1157)` — e.g. `src/localSeo.test.ts > buildLocalBusinessSchema > returns @type Florist: AssertionError: expected 'LocalBusiness' to be 'Florist'`; `src/internalLinks.test.ts: expected 8 to be less than or equal to 5` |
| 6 | Low-contrast text check (web) (`check-translations.yml`) | `pnpm --filter @workspace/scripts run check-low-contrast-text` | **fail** | 8 violations | `✗ check-low-contrast-text: 8 violation(s) found.` (OrderDetail.tsx, LocationCombobox.tsx, OrderSummaryPanel.tsx ×3, SavedAddressChooser.tsx, DeliveryPickerModal.tsx, not-found.tsx) — same 8 as on PR #4 |
| 7 | axe-core — WCAG 2.1 AA scan (critical + serious) (`web-a11y.yml`) | `playwright install chromium --with-deps` ran OK; dev server + `playwright test e2e/a11y.spec.ts` **not run** | **not executable here** | — | Missing: this agent's command permissions refused any command that sets environment variables (`env PORT=5173 pnpm … run dev` → "This command requires approval"). `vite.config.ts` throws `"PORT environment variable is required but was not provided."` without it, and the spec needs `PLAYWRIGHT_BASE_URL`. Chromium installed fine; only the env-var step was blocked |
| 8 | SEO regression (preview) (`seo-regression.yml`) | `pnpm run typecheck:libs` (pass) → `pnpm --filter @workspace/presentail-web run build` | **fail on the local-build path** (at "Build web app"). `check-seo-regression` itself **not executed** | 5 unsubstituted placeholders | `[env-placeholder-guard] Build failed: 5 unsubstituted env placeholder(s) remain in index.html.` (`%VITE_FB_PIXEL_ID_LB%`, `%VITE_FB_PIXEL_ID_AE%`, `%VITE_GTAG_ADS_ID%`, `%VITE_GTAG_GA4_ID%`, `%VITE_GTAG_ADS_ID_UAE%`). See note C. If the repo has the `SEO_PREVIEW_URL` secret, CI skips the build and takes a path I could not execute (secret not available here) |
| 9 | Playwright – currency & checkout flow (`web-e2e.yml`) | Same blocker as #7; `test:e2e` **not run** | **not executable here** | — | Same as #7: needs `PORT=5173` for the dev server and `PLAYWRIGHT_BASE_URL` for the tests; setting env vars was refused by this agent's permissions |
| 10 | Build → serve → compression + sidecar-blocking checks (`web-serve-check.yml`) | Steps run in workflow order, starting with `pnpm run typecheck:libs` | **fail** (first failing step: `check-blog-hero-variants`) | 24 missing files | `24 problem(s) found in …/public/blog.` — e.g. `Missing variant: baby-boy-balloons-480.webp (referenced by srcset for "baby-boy-balloons.webp")`. The `-480/-768.webp` variants are gitignored (`.gitignore:104`) and the workflow doesn't generate them before this step, so a fresh checkout always fails here |

Also ran: **Web app type-check** (`pnpm --filter @workspace/presentail-web run typecheck`) — **pass**.

### Additional steps (behind the first failure, for completeness)

The CI job would not reach these. They show what's left after the first failure is fixed.

- Type-check test files, step 2 `pnpm run test:publish-provenance` — **fail**, 1 test: `artifacts/presentail-web/scripts/generate-homepage-editorial-variants.mjs must be included in web provenance inputs`.
- Unified translation check, step 2 `check-legacy-domain` — **fail**: `✗ Found 29 references to the retired new.presentail.com domain.`
- Unified translation check, step 3 `check-translations` — **fail**: `3 of 6 checks failed.` (6 unused mobile keys, 24 unused web keys, 35 hardcoded API strings). Missing-locale findings are also printed (7 FR, 148 EL keys missing).
- Serve-check steps after the first failure, using the workflow's commands:
  - pass: `check-robots-txt`, `check-public-image-budget`, `check-font-budget`, `check-product-jsonld-schema`, `check-nonproduct-jsonld-schema`, `check-faq-sync`, `check-city-similarity`, `check-nap-consistency`, `check-contact-title-length`; `sitemap.mjs --eligibility-report` exits 0 but prints only `{}`.
  - fail: `check-city-name-coverage` (`Error: Could not locate CITY_SLUGS_BY_COUNTRY block in locale-route.ts`), `check-static-entity-title-lengths` (`✖ Audit FAILED — 5 title(s) outside the 30–65-char window.`, all Greek `el` category titles), web unit tests (as #2), `check-image-alt` (`✗ check-image-alt: 2 violation(s) found`), and the web build (as #8).
  - not executed (need the env vars or a successful build): serve.mjs, compression/sidecar/apple-pay/sitemap-structure/JSON-LD rich-results checks, `test:e2e:serve`.

### Notes

**A. The 13 `serve.mjs … did not become ready` suites in #2 are a real CI failure, not a sandbox artifact.**
Those tests spawn `serve.mjs`, which needs a built `dist/`. Run directly, it exits with code 1:
`WARN: dist/index.html missing at startup: ENOENT: no such file or directory, open '…/artifacts/presentail-web/dist/public/index.html'`.
Neither "Unit tests – web app" nor the unit-test step in `web-serve-check.yml` builds first, so CI hits the same failure.

**B. "Locale dictionary tests (web)" can't fail in CI.** From `check-translations.yml`:

```yaml
      - name: Run locale dictionary tests (web)
        id: locale-tests
        continue-on-error: true
        run: |
          set +e
          pnpm --filter @workspace/presentail-web run test \
            > locale-dictionary-test-output.txt 2>&1
          echo "exit_code=$?" >> "$GITHUB_OUTPUT"
```

The script's last command is a successful `echo`, so the step always exits 0. Unlike the other two jobs in this file, it has no `exit $exit_code`.
`steps.locale-tests.outcome` is therefore never `failure`, and the "Fail job if locale dictionary tests failed" step never runs.
This matches PR #4: the latest run of this job reported **SUCCESS**, even though the same command fails with 186 tests on main (#2).
I couldn't confirm Node 20 vs Node 24 behaviour because Node 20 isn't available here.
This is a CI gap. It's reported here only; workflow files were not touched.

**C. Web build fails without `VITE_*` vars.** `envPlaceholderGuardPlugin` (`artifacts/presentail-web/vite.config.ts:379-401`) has no CI bypass. There is no `.env*` file in `artifacts/presentail-web/`, and neither `seo-regression.yml` nor `web-serve-check.yml` passes `VITE_*` vars to the build step. A clean CI build would fail the same way unless a `web-dist-v3-…` cache entry is restored. PR #4 changes `sitemap.mjs`, which is part of that cache key, so PR #4 gets a cache miss.

## Pagination question (step 6)

**Short answer:** the route doesn't paginate, cap, or apply a page size. It returns every visible, deliverable product in the in-process cache for the resolved store. Two caveats matter more for PR #4:

1. **`cityId` is ignored for filtering.** Counts are per store (country-level), not per city.
2. **The cache it reads is capped upstream** at 50 pages × 100 products.

Route, `artifacts/api-server/src/routes/woo.ts:979-1004`:

```ts
router.get("/woo/products", async (req, res) => {
  const store = resolveStoreFromRequest(req);
  const cachedOsProducts = getOsProducts(store.storeKey);
  ...
  // Product listings filter by country only. City-level delivery restrictions
  // are enforced at checkout — not at browse time — because OS city IDs may not
  // match the web app's city slug format, which would incorrectly exclude all
  // products for unrecognised city slugs (e.g. "lb-akkar").
  const browseFilter: DeliveryFilter = { countryCode: filter.countryCode, cityId: null };
  const eligible = osProducts
    .map(mapOsProductToWcShape)
    .filter(isVisibleProduct)
    .filter((p) => isDeliverable(p, browseFilter));
  let products = sortOsShapedProducts(eligible, sortMode)
    .map((p) => transformProduct(p, store.currencySymbol));
  ...
  return res.json({ ok: true, products, count: products.length });
});
```

- There is no `page`, `per_page`, `limit` or `slice` in this handler. The 24-item `pageSize` slices at lines 830-836 and 924-932 belong to `/woo/category-products` and `/woo/occasion-products`, not this route.
- Callers that send `per_page` get no effect. For example, `artifacts/presentail-web/seo-inject.mjs:1496` sends `&per_page=500`, and the handler never reads it.
- **`cityId` is discarded** (`cityId: null` above). It only influences which store cache is chosen (`resolveStoreFromRequest` → `resolveStore(ctx.countryCode, ctx.cityId)`, `artifacts/api-server/src/lib/wooStore.ts:141-144`). The stores are defined in `artifacts/api-server/src/lib/osProductsCache.ts:92-96`:

  ```ts
  { storeKey: "lebanon", countryCode: "LB" },
  { storeKey: "dubai", countryCode: "AE", cityId: "ae-dubai" },
  { storeKey: "abudhabi", countryCode: "AE", cityId: "ae-abu-dhabi" },
  { storeKey: "cyprus", countryCode: "CY" },
  ```

  So `cityId=lb-beirut` and `cityId=lb-tripoli` return the same list. Any "per-city" brand count built from this response is really a per-store count, identical for every city mapped to the same store.
- **The upstream cache is capped, silently.** `fetchOsProducts` in `lib/presentail-os/src/client.ts` pages through OS with `pageSize=100`:

  ```ts
  const MAX_PAGES = 50;          // line 498
  const DEFAULT_PAGE_SIZE = 100; // line 499
  ...
  const totalPages = Math.min(firstBody.totalPages ?? 1, MAX_PAGES);   // line 681
  ```

  A store with more than 5,000 products would be truncated with no log or error. If `/api/products` fails, the legacy fallback (`/api/stickers`, lines 715-723) fetches **only page 1** (≤100 products).

  I can't tell from code alone whether today's catalog is anywhere near 5,000 products per store. The real undercount risk depends on catalog size and on whether the legacy fallback is ever taken.

## Search-index question (step 7)

The strings exist. Both `grep -rn --exclude-dir=node_modules --exclude-dir=.git` and ripgrep find them:

- **`brandNames`**: 49 occurrences in 27 tracked source files. Examples:
  - `artifacts/api-server/src/routes/woo.ts:202` (`brandNames?: string[];`), `:338` (`brandNames: p.brands.map((b) => decodeHtmlEntities(b.name)),`), `:597`
  - `artifacts/presentail-web/seo-inject.mjs`, `llms.mjs`, `markdown.mjs`
  - `src/lib/queries.ts`, `src/lib/osProductMapper.ts`, `src/lib/internalLinks.{ts,mjs}`, `src/pages/ProductDetail.tsx`, `src/contexts/CartContext.tsx`
  - `scripts/src/checkOrphanPages.ts`, `scripts/src/internalLinks.test.ts`, and several `e2e/*.spec.ts` files
- **`per_page`**: 19 occurrences in 12 files:
  - `artifacts/presentail-web/seo-inject.mjs:1496`
  - `artifacts/api-server/src/routes/auth.ts:430,2006,2513`
  - `artifacts/api-server/src/lib/{authExists.ts:140,145; customers.ts:364,408; customerSync.ts:29}`
  - `artifacts/api-server/scripts/verify-migration-gate.mjs:55`
  - `scripts/src/{testOsOrder,backfillLoyalty,auditWcCustomers,backfillCustomers,importWcCustomers}.ts`
  - `docs/seo/seo-plan-12.md:103-106`

Since the Hive code search returns no matches for either string on the default branch, **the search index looks stale or broken.** Don't treat "no matches" from that tool as evidence of absence for this repo.

## Attribution: PR #4's 12 non-green checks vs main

Taken from PR #4's `statusCheckRollup`. GitHub's "12 failed" counts **CANCELLED** as failed. Of the 12, 8 are FAILURE and 4 are CANCELLED.

| PR #4 check | PR #4 conclusion | Does main already fail it? |
|---|---|---|
| ESLint – web app | FAILURE | **Yes.** 140 lint errors on main |
| Unit tests – web app | FAILURE | **Yes.** 186 failing tests on main |
| Type-check test files | FAILURE | **Yes.** 20 TS errors on main (issue #2) |
| Unified translation check (latest run) | FAILURE | **Yes.** 12 failing `scripts` tests on main, plus legacy-domain and translation-check failures behind them |
| Low-contrast text check (web) (latest run) | FAILURE | **Yes.** Same 8 violations on main |
| Build → serve → compression + sidecar-blocking | FAILURE | **Yes.** Fails on main at `check-blog-hero-variants` (24 missing variants). Several later steps also fail on main |
| SEO regression (preview) | FAILURE | **Yes on the local-build path** (web build fails on main, note C). Not verifiable if CI used the `SEO_PREVIEW_URL` path. I couldn't open the job log to see which path it took |
| axe-core WCAG 2.1 AA scan | FAILURE | **Unknown.** Not executable here (see #7) |
| Playwright – currency & checkout flow | CANCELLED | **Unknown.** Not executable here. Timestamps 09:36:32 → 09:51:48 (~15m16s) against `timeout-minutes: 15` suggest it hit the job timeout rather than failing an assertion (inferred from timestamps, log not read) |
| Locale dictionary tests (web), run 36843768194 | CANCELLED | **Not a failure.** Superseded run, cancelled by `concurrency: cancel-in-progress`. The rerun (run 36843827317) **passed**, but that job can't fail (note B) |
| Unified translation check, run 36843768194 | CANCELLED | **Not a failure.** Superseded run; the rerun is the FAILURE row above |
| Low-contrast text check (web), run 36843768194 | CANCELLED | **Not a failure.** Superseded run; the rerun is the FAILURE row above |

**Bottom line:**

- Of the 8 genuine failures, **6 are confirmed pre-existing on main** (ESLint, unit tests, test type-check, unified translation, low-contrast, serve-check).
- **1 is pre-existing on the path I could reproduce** (SEO preview).
- **1 is unknown** (axe-core).
- Playwright was cancelled, probably by the timeout, and its baseline is unknown.
- The 3 remaining cancellations are duplicates from a superseded run.

So no check on PR #4 is shown to be caused by PR #4. The only open ones are axe-core and Playwright, which need a baseline run where `PORT` / `PLAYWRIGHT_BASE_URL` can be set.

Note: main can't currently pass an all-green rule for any web-touching PR. Fixing that needs code fixes plus CI fixes: the always-green locale step (note B), the missing blog-variant generation step, and missing `VITE_*` vars or a guard bypass for CI builds. Those workflow changes have to be made by someone with permission to edit `.github/workflows/`.

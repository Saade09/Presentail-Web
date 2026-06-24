---
name: OS occasion pages — empty products root causes
description: Why occasion/category pages show 0 products even when OS has tagged products; the two-bug pattern and the OS data-quality issues.
---

# Occasion/category pages showing 0 products

When occasion or category browse pages show 0 products despite products being
tagged in Presentail OS, there are TWO independent failure modes plus an OS
data-quality issue. All three can be in play at once.

## Bug 1 — API-server fallback path returns occasions: []
The web fetches catalog **directly from OS** when `VITE_OS_API_KEY` is set, but
**CORS blocks the browser→os.presentail.com fetch** (both in the Replit dev
preview and apparently in production), so it silently falls back to the API
server's `/woo/products`. If `transformProduct` (routes/woo.ts) hardcodes
`occasions: []`, the web's occasion filter `p.occasions.includes(slug)` matches
nothing → 0 products. Fix: derive occasions from the merged WcProduct categories
(`mapOsProductToWcShape` puts occasion entries at category id >= 10000), i.e.
`occasions: (p.categories ?? []).filter(c => c.id >= 10000).map(c => c.slug)`.

**How to tell which path is live:** if the direct-OS path were active, occasions
would always have worked (web `mapOsProduct` maps them correctly). Seeing 0
means the fallback path is live.

## Bug 2 — OCCASION_TYPE_CATEGORIES slug mismatch (grouping drops products)
Occasion pages group products by product-type category. OS uses different
category slugs than the app's `OCCASION_TYPE_CATEGORIES` list (duplicated in
`artifacts/api-server/src/routes/woo.ts` AND `artifacts/presentail-web/src/lib/queries.ts`).
Products whose category slug isn't in the list get silently dropped from all
groups. Known OS aliases that must be present: `hand-bouquet` (not just
`hand-bouquets`), `gift-baskets` (not just `baskets`), `vases` (not just
`flower-vases`), `roses-bouquets`. For "congratulations" this raised grouped
products from 18 → 24.

## OS data-quality issue (report to OS team, not fixable in app)
Some products are tagged with an occasion but have an **empty category array**
in OS (or only a hidden category like `electronics`). These can never be grouped
by product type, so they stay invisible on occasion pages. For "congratulations":
36 tagged → 3 hidden (electronics) → 8 have no category at all → 24 groupable.
Ask OS to (a) give every product at least one real category, and (b) standardise
category slugs to the app's expected values (rename `hand-bouquet`→`hand-bouquets`,
`gift-baskets`→`baskets`, `vases`→`flower-vases`).

## Env quirk
The api-server dev service runs `pnpm dev` = `build && start` (NO watch). Code
edits do NOT hot-reload — the service must be rebuilt+restarted to take effect.
Artifact dev services are children of the platform supervisor (pid2), are NOT
`.replit` workflows, so `restart_workflow` can't target them, and bash-spawned
daemons get cgroup-killed after each command. Verify catalog/transform logic
with a standalone node script against live OS data instead of a running server.

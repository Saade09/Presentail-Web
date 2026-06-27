---
name: app-shared manualChunks rules
description: What belongs (and what must NOT go) in the app-shared Vite manualChunk for the web app.
---

# app-shared manualChunks rules

## The rule
`APP_SHARED_BASENAMES` in `artifacts/presentail-web/vite.config.ts` must only list **pure UI primitive** filenames — components that import from `vendor-react`, `vendor-radix`, `vendor-lucide`, `@/lib/utils`, and other ui/ primitives **only**.

Any component that imports from a context (`AuthContext`, `LocaleContext`, `CartContext`, etc.) or from a custom hook that itself imports a context **must NOT** be in this set.

**Why:** If a context-importing component is in app-shared, Rollup pulls that context module into app-shared. Because the entry bundle also uses that context (e.g. `FavoritesContext → useAuth → AuthContext`), the entry chunk must statically import app-shared to resolve the shared context module. This adds the full app-shared brotli weight (~40 kB) to every page's startup cost.

## How to apply
When adding a new entry to `APP_SHARED_BASENAMES`, check its imports:
- Run `grep "^import" artifacts/presentail-web/src/path/to/Component.tsx`
- If it imports from `@/contexts/*` or from any hook that does, **do not add it** to APP_SHARED_BASENAMES
- Pure shadcn primitives (`button`, `dialog`, `input`, `label`, etc.) are safe

## Safe entries (as of fix)
`dialog`, `input`, `label`, `select`, `textarea`, `useNow`

## Removed entries (had context imports — caused the bug)
`DeleteAccountDialog` (AuthContext + LocaleContext), `PageBreadcrumb` (LocaleContext), `LoyaltyTiersInfo` (LocaleContext), `ScheduleInlinePanel` (LocaleContext), `LegalPage`

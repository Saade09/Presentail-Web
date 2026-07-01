---
name: Stale-chunk blank-page recovery (web)
description: Why the web app force-reloads on dynamic-import failures, and the loop-safety rules that must hold
---

# Stale dynamic-chunk recovery on presentail-web

Root cause of the intermittent iOS Safari blank page: after a redeploy the server
purges old hashed JS chunks, but Safari can still serve a stale `index.html`
(disk/bfcache on flaky networks) that references the old chunk hashes. The lazy
`import()` then 404s; when it happens in an entry/provider chunk, nothing renders
→ blank page that "randomly" self-heals on a manual refresh (which revalidates the
no-cache index.html). Not reproducible with server tools — it is device/cache
specific.

**Fix lives in `src/lib/chunkReload.ts`**: global handlers (installed in
`main.tsx` before React mount) for Vite's `vite:preloadError` and chunk-classified
`unhandledrejection`, plus `ErrorBoundary.componentDidCatch` routing render-time
chunk errors through the same path. Recovery = force one reload to fetch a fresh
index.html + chunk set.

**Why:** a lazy chunk 404 has no built-in recovery in React/Vite; without this the
user is stranded on a blank screen until they manually refresh.

**How to apply / invariants that must never regress:**
- Reload MUST be loop-safe. Two independent guards, both cap at 2 reloads:
  - primary: a `sessionStorage` counter with a rolling 60s incident window
    (self-resets so a later genuine deploy can recover again);
  - fallback (only when `sessionStorage` throws — some privacy modes): a `_cr`
    URL query counter that also survives reloads. The final `try/catch` fails
    CLOSED (does nothing) rather than reloading. Never change the storage-failure
    path to reload unconditionally — that was the original bug the reviewer caught.
- `isChunkLoadError()` must NOT match plain `"Load failed"` — that is WebKit's
  generic fetch/network failure message; matching it forces reloads on unrelated
  API errors. Only match dynamic-import / module-script / ChunkLoadError text.
- The fix only helps once **deployed** — it is client-side recovery, so it must
  ship to production to have any effect.

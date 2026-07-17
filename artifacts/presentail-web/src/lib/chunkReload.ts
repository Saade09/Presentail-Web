// Recovery for stale/failed dynamic chunk loads.
//
// After a redeploy, iOS Safari can serve a stale index.html (from its disk cache
// or the back/forward cache on a flaky connection) that references JS chunk
// hashes the server no longer has. The lazy import() then 404s. When that
// happens in the entry / provider chunks nothing renders and the user sees a
// blank page — which "randomly" self-heals on a manual retry once Safari
// revalidates the no-cache index.html and picks up the fresh chunk set.
//
// The fix: when we detect a chunk-load failure, reload once to force a fresh
// index.html + chunk set. Guarded so a genuinely broken deploy (where the
// reload does not help) can never turn into an infinite loop:
//   • Primary guard: a sessionStorage counter with a rolling incident window.
//     Invisible, survives reloads, and self-resets after the window elapses.
//   • Fallback guard (when sessionStorage is unavailable, e.g. some privacy
//     modes): a `_cr` URL query counter. It also survives reloads and is
//     self-limiting, so we still cannot loop when storage throws.

const CHUNK_RELOAD_KEY = "presentail_chunk_reload_v1";
const RELOAD_MARKER = "_cr";
const INCIDENT_WINDOW_MS = 60_000;
const MAX_RELOADS_PER_INCIDENT = 2;

/**
 * Best-effort classifier for the messages browsers use when a dynamically
 * imported module fails to load. Covers Chromium ("Failed to fetch dynamically
 * imported module"), Firefox ("error loading dynamically imported module") and
 * WebKit/Safari ("Importing a module script failed"). Plain "Load failed" is
 * intentionally NOT matched: WebKit uses it for any fetch/network failure, so
 * matching it would force reloads on unrelated errors.
 */
export function isChunkLoadError(reason: unknown): boolean {
  const msg =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : "";
  if (!msg) return false;
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|module script failed|ChunkLoadError/i.test(
    msg,
  );
}

/** Read the current incident reload count from sessionStorage, or throw. */
function readStorageCount(now: number): number {
  const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const state = raw ? (JSON.parse(raw) as { count: number; ts: number }) : null;
  // A failure more than INCIDENT_WINDOW_MS after the last one is a fresh
  // incident (e.g. a new deploy long after the tab was opened) → counter resets.
  const recent = state != null && now - state.ts < INCIDENT_WINDOW_MS;
  return recent ? state.count : 0;
}

/** Reload via sessionStorage-guarded counter. Throws if storage is unusable. */
function reloadViaStorage(): void {
  const now = Date.now();
  const count = readStorageCount(now);
  if (count >= MAX_RELOADS_PER_INCIDENT) return;
  sessionStorage.setItem(
    CHUNK_RELOAD_KEY,
    JSON.stringify({ count: count + 1, ts: now }),
  );
  window.location.reload();
}

/**
 * Fallback reload guarded by a `_cr` URL query counter, used only when
 * sessionStorage is unavailable. Survives reloads (so it cannot loop) without
 * depending on storage. Uses replace() so it does not pile up history entries.
 */
function reloadViaUrlMarker(): void {
  const url = new URL(window.location.href);
  const parsed = Number(url.searchParams.get(RELOAD_MARKER));
  const count = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  if (count >= MAX_RELOADS_PER_INCIDENT) return;
  url.searchParams.set(RELOAD_MARKER, String(count + 1));
  window.location.replace(url.toString());
}

/** Reload the page to recover from a stale chunk, unless a loop guard trips. */
export function reloadForStaleChunk(): void {
  try {
    reloadViaStorage();
  } catch {
    // sessionStorage unavailable — fall back to the URL-marker guard so we are
    // still bounded and can never loop. Swallow any final error (e.g. URL cannot
    // be constructed) rather than risk an unguarded reload.
    try {
      reloadViaUrlMarker();
    } catch {
      /* give up — do nothing rather than loop */
    }
  }
}

let installed = false;

/**
 * Install global listeners that recover from failed dynamic chunk loads.
 * Idempotent and safe to call before React mounts.
 */
export function installChunkReloadHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Vite fires this CustomEvent when a modulepreload / dynamic import fails.
  // Typed via the generic string overload so we do not depend on vite/client
  // WindowEventMap augmentation being present in the app's tsconfig.
  window.addEventListener("vite:preloadError", (event: Event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });

  // Safari surfaces failed dynamic imports as unhandled promise rejections.
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadForStaleChunk();
    }
  });

  // Belt-and-suspenders: if the page is restored from Safari's Back/Forward
  // Cache (BFCache), the frozen JS snapshot may reference chunk hashes that
  // no longer exist on the server after a redeploy. The no-store header on
  // index.html opts the page out of BFCache, but older Safari versions may
  // not honour that. Forcing a reload on persisted restoration guarantees the
  // browser fetches a fresh shell with the correct chunk hashes.
  window.addEventListener("pageshow", (event) => {
    if ((event as PageTransitionEvent).persisted) {
      reloadForStaleChunk();
    }
  });
}

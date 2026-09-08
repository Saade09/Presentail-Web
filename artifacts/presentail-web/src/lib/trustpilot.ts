declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

export const TRUSTPILOT_SCRIPT_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

const RETRY_DELAY_MS = 2000;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 250;

// ── Shared script-load state ──────────────────────────────────────────────────
// Module-level queues so EVERY concurrently mounted widget is notified on
// script success *or* final failure, even after a retry removes the original
// script element. Attaching listeners directly to a <script> tag loses all
// piggy-backed callbacks the moment that tag is removed; the queue survives
// across script element replacements.

type LoadState = "idle" | "loading" | "loaded" | "failed";

let _loadState: LoadState = "idle";
const _loadQueue: Array<() => void> = [];
const _errorQueue: Array<() => void> = [];
let _emptyScriptRecoveryUsed = false;

function _flushLoad() {
  _loadState = "loaded";
  const cbs = _loadQueue.splice(0);
  for (const cb of cbs) cb();
}

function _flushError() {
  _loadState = "failed";
  const cbs = _errorQueue.splice(0);
  for (const cb of cbs) cb();
}

function _doInject(isRetry: boolean) {
  // Remove any stale/failed tag before injecting a replacement.
  document
    .querySelector(`script[src="${TRUSTPILOT_SCRIPT_SRC}"]`)
    ?.remove();

  const script = document.createElement("script");
  script.src = TRUSTPILOT_SCRIPT_SRC;
  script.async = true;

  script.addEventListener(
    "load",
    () => {
      script.dataset.loaded = "1";
      _flushLoad(); // notifies every queued widget
    },
    { once: true },
  );

  script.addEventListener(
    "error",
    () => {
      script.remove();
      if (isRetry) {
        console.warn(
          "[Trustpilot] Script failed to load after retry; giving up.",
        );
        _flushError(); // notifies every queued widget
      } else {
        // loadState stays "loading"; retry will either flush or terminally fail.
        setTimeout(() => _doInject(true), RETRY_DELAY_MS);
      }
    },
    { once: true },
  );

  document.head.appendChild(script);
}

/**
 * Inject the Trustpilot bootstrap script once and notify all queued
 * callbacks when it loads. Safe to call concurrently from many widgets:
 * subsequent calls while the script is already in-flight simply enqueue
 * their callbacks and return.
 *
 * On a load error a single automatic retry fires after ~2 s. Every
 * queued callback (not just the first caller's) is notified on success
 * or final failure, so concurrently mounted widgets are never silently
 * abandoned when the original script element is removed and replaced.
 */
export function injectTrustpilotScript(
  onLoad: () => void,
  onError?: () => void,
): void {
  if (window.Trustpilot) {
    _loadState = "loaded";
    onLoad();
    return;
  }
  if (_loadState === "loaded") {
    onLoad();
    return;
  }
  if (_loadState === "failed") {
    onError?.();
    return;
  }

  _loadQueue.push(onLoad);
  if (onError) _errorQueue.push(onError);

  if (_loadState === "loading") return; // already in-flight — just enqueued

  _loadState = "loading";
  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"]`,
  );
  if (existingScript) {
    existingScript.addEventListener(
      "load",
      () => {
        existingScript.dataset.loaded = "1";
        _flushLoad();
      },
      { once: true },
    );
    existingScript.addEventListener(
      "error",
      () => {
        existingScript.remove();
        setTimeout(() => _doInject(true), RETRY_DELAY_MS);
      },
      { once: true },
    );
    return;
  }
  _doInject(false);
}

/**
 * Reset shared load state and re-inject the script.
 *
 * Used by the polling-exhaustion recovery path when the script element
 * reported a successful load event (and `data-loaded="1"` was set) but
 * `window.Trustpilot` never appeared — e.g. because an ad-blocker served
 * an empty 200 response. In that scenario `_loadState` is already "loaded"
 * so a plain `injectTrustpilotScript` call would return the stale success
 * immediately without fetching a new script.
 *
 * The stale queues are cleared: every widget that reached polling exhaustion
 * registers fresh callbacks through the `injectTrustpilotScript` call below.
 */
function _resetAndReinject(onLoad: () => void, onError?: () => void) {
  const completedStaleScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"][data-loaded="1"]`,
  );
  completedStaleScript?.remove();

  // The first exhausted poller starts the recovery injection. Other widgets
  // exhausting in the same tick must join that in-flight request rather than
  // resetting its queues or replacing its script.
  if (_loadState === "loading") {
    injectTrustpilotScript(onLoad, onError);
    return;
  }
  if (_emptyScriptRecoveryUsed) {
    console.warn("[Trustpilot] Widget bootstrap stayed empty after recovery; giving up.");
    _flushError();
    return;
  }
  _emptyScriptRecoveryUsed = true;
  _loadState = "idle";
  injectTrustpilotScript(onLoad, onError);
}

/**
 * Build a polling loader for a Trustpilot widget element.
 *
 * Returns `{ onScriptLoad, cleanup }`:
 *
 * - `onScriptLoad` — pass as the `onLoad` argument to `injectTrustpilotScript`.
 *   Polls for `window.Trustpilot` to appear up to MAX_POLL_ATTEMPTS times
 *   (every POLL_INTERVAL_MS ms), then calls `loadFromElement`. If polling
 *   exhausts without the SDK, the shared state is reset and a fresh script
 *   injection is attempted (bounded: `_doInject`'s `isRetry` flag caps that
 *   at one additional attempt) before giving up with a `console.warn`.
 *
 * - `cleanup` — call from useEffect's return value to cancel pending timers
 *   on unmount and prevent calls into a detached element.
 *
 * `loadFromElement` errors are caught and logged as warnings so they never
 * surface as unhandled exceptions.
 */
export function pollAndLoadTrustpilotWidget(
  el: Element,
  onGiveUp?: () => void,
): { onScriptLoad: () => void; cleanup: () => void } {
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollAttempts = 0;
  let cancelled = false;

  const tryLoadFromElement = () => {
    if (cancelled) return;
    try {
      window.Trustpilot!.loadFromElement(el, true);
    } catch (err) {
      console.warn("[Trustpilot] loadFromElement threw:", err);
      onGiveUp?.();
    }
  };

  const onScriptLoad = () => {
    if (cancelled) return;
    if (!window.Trustpilot) {
      if (pollAttempts < MAX_POLL_ATTEMPTS) {
        pollAttempts++;
        pollTimer = setTimeout(onScriptLoad, POLL_INTERVAL_MS);
      } else {
        // Script loaded (data-loaded="1") but the SDK global never appeared.
        // Reset the shared state and fetch a genuinely fresh script so this
        // widget (and any others in the same situation) get another chance.
        console.warn(
          "[Trustpilot] window.Trustpilot not available after polling; re-injecting.",
        );
        _resetAndReinject(
          () => {
            if (!cancelled) tryLoadFromElement();
          },
          () => {
            console.warn("[Trustpilot] Widget failed to load; giving up.");
            onGiveUp?.();
          },
        );
      }
      return;
    }
    tryLoadFromElement();
  };

  const cleanup = () => {
    cancelled = true;
    if (pollTimer !== null) clearTimeout(pollTimer);
  };

  return { onScriptLoad, cleanup };
}

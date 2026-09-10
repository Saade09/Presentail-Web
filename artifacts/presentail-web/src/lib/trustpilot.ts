declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

export const TRUSTPILOT_SCRIPT_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";
export const TRUSTPILOT_PROFILE_URL =
  "https://www.trustpilot.com/review/presentail.com";

const RETRY_DELAY_MS = 2000;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 250;
const MAX_SCRIPT_WATCH_ATTEMPTS = 20;

// ── Shared script-load state ──────────────────────────────────────────────────
// Module-level waiters mean EVERY concurrently mounted widget is notified on
// script success *or* final failure, even after a retry removes the original
// script element. Attaching listeners directly to a <script> tag loses all
// piggy-backed callbacks the moment that tag is removed; the waiter list
// survives across script element replacements.

type LoadState = "idle" | "loading" | "loaded" | "failed";
type LoadWaiter = {
  onLoad: () => void;
  onError?: () => void;
};

let _loadState: LoadState = "idle";
const _waiters: LoadWaiter[] = [];
let _emptyScriptRecoveryUsed = false;
let _retryUsed = false;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _watchTimer: ReturnType<typeof setTimeout> | null = null;
let _activeScript: HTMLScriptElement | null = null;

function _flushLoad() {
  if (_loadState === "loaded") return;
  _loadState = "loaded";
  if (_watchTimer !== null) {
    clearTimeout(_watchTimer);
    _watchTimer = null;
  }
  const waiters = _waiters.splice(0);
  for (const waiter of waiters) waiter.onLoad();
}

function _flushError() {
  if (_loadState === "failed") return;
  _loadState = "failed";
  if (_watchTimer !== null) {
    clearTimeout(_watchTimer);
    _watchTimer = null;
  }
  const waiters = _waiters.splice(0);
  for (const waiter of waiters) waiter.onError?.();
}

function _scheduleRetry() {
  if (_retryTimer !== null) return;
  if (_retryUsed) {
    console.warn("[Trustpilot] Script failed to load after retry; giving up.");
    _flushError();
    return;
  }
  _retryUsed = true;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    _doInject();
  }, RETRY_DELAY_MS);
}

function _watchScript(script: HTMLScriptElement, attempts = 0) {
  if (_activeScript !== script || _loadState !== "loading") return;

  // A vendor script can execute after its load event, and a script tag may
  // already have completed before this module attaches its listeners. Treat
  // either signal as enough to hand control to the per-widget SDK poller.
  if (window.Trustpilot || script.dataset.loaded === "1") {
    _flushLoad();
    return;
  }

  if (attempts >= MAX_SCRIPT_WATCH_ATTEMPTS) {
    script.remove();
    _activeScript = null;
    _scheduleRetry();
    return;
  }
  _watchTimer = setTimeout(
    () => _watchScript(script, attempts + 1),
    POLL_INTERVAL_MS,
  );
}

function _attachScript(script: HTMLScriptElement) {
  if (_activeScript === script) return;
  _activeScript = script;

  script.addEventListener(
    "load",
    () => {
      if (_activeScript !== script) return;
      script.dataset.loaded = "1";
      _flushLoad();
    },
    { once: true },
  );

  script.addEventListener(
    "error",
    () => {
      if (_activeScript !== script) return;
      script.remove();
      _activeScript = null;
      if (_watchTimer !== null) {
        clearTimeout(_watchTimer);
        _watchTimer = null;
      }
      _scheduleRetry();
    },
    { once: true },
  );

  // `data-loaded` covers an existing tag whose load event happened before
  // injectTrustpilotScript was called. The watchdog covers delayed SDK
  // initialization and browsers that do not replay a missed load event.
  const readyState = (script as HTMLScriptElement & { readyState?: string }).readyState;
  if (
    script.dataset.loaded === "1" ||
    readyState === "loaded" ||
    readyState === "complete" ||
    window.Trustpilot
  ) {
    _flushLoad();
    return;
  }
  _watchTimer = setTimeout(() => _watchScript(script), POLL_INTERVAL_MS);
}

function _doInject() {
  // Remove any stale/failed tag before injecting a replacement.
  document
    .querySelector(`script[src="${TRUSTPILOT_SCRIPT_SRC}"]`)
    ?.remove();

  const script = document.createElement("script");
  script.src = TRUSTPILOT_SCRIPT_SRC;
  script.async = true;
  _attachScript(script);
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

  _waiters.push({ onLoad, onError });

  if (_loadState === "loading") return; // already in-flight — just enqueued

  _loadState = "loading";
  const existingScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"]`,
  );
  if (existingScript) {
    _attachScript(existingScript);
    return;
  }
  _doInject();
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
  // The first exhausted poller starts the recovery injection. Other widgets
  // exhausting in the same tick must join that in-flight request rather than
  // resetting its queues or replacing its script.
  if (_loadState === "loading") {
    injectTrustpilotScript(onLoad, onError);
    return;
  }
  if (_emptyScriptRecoveryUsed) {
    console.warn(
      "[Trustpilot] Widget bootstrap stayed empty after recovery; giving up.",
    );
    onError?.();
    return;
  }
  const completedStaleScript = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"][data-loaded="1"]`,
  );
  completedStaleScript?.remove();
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
 *   injection is attempted (bounded by the shared recovery flag) before giving
 *   up with a `console.warn`.
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
  onLoaded?: () => void,
): { onScriptLoad: () => void; cleanup: () => void } {
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollAttempts = 0;
  let cancelled = false;
  let completed = false;

  const tryLoadFromElement = () => {
    if (cancelled || completed) return;
    completed = true;
    try {
      window.Trustpilot!.loadFromElement(el, true);
      onLoaded?.();
    } catch (err) {
      console.warn("[Trustpilot] loadFromElement threw:", err);
      onGiveUp?.();
    }
  };

  const onScriptLoad = () => {
    if (cancelled || completed) return;
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
             if (!cancelled) {
               pollAttempts = 0;
               onScriptLoad();
             }
           },
           () => {
             if (cancelled || completed) return;
             completed = true;
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

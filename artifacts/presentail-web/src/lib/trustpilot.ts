declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => unknown;
    };
  }
}

export const TRUSTPILOT_SCRIPT_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";
export const TRUSTPILOT_PROFILE_URL =
  "https://www.trustpilot.com/review/presentail.com";

type LoadState = "idle" | "loading" | "loaded" | "failed";
type LoadWaiter = {
  onLoad: () => void;
  onError?: () => void;
};

let loadState: LoadState = "idle";
let activeScript: HTMLScriptElement | null = null;
const waiters: LoadWaiter[] = [];
const initializedElements = new WeakSet<Element>();

// Diagnostics are intentionally bounded and contain no URLs, identifiers, or
// customer data. They can be removed after production verification without
// changing the loader contract.
const MAX_DIAGNOSTIC_EVENTS = 80;
let diagnosticEvents = 0;

function diagnostic(event: string, details: Record<string, boolean | number | string> = {}) {
  if (diagnosticEvents >= MAX_DIAGNOSTIC_EVENTS) return;
  diagnosticEvents += 1;
  console.debug(`[Trustpilot] ${event}`, details);
}

function flushLoaded() {
  if (loadState === "loaded") return;
  loadState = "loaded";
  diagnostic("bootstrap-loaded", {
    trustpilotPresent: Boolean(window.Trustpilot),
  });
  const pending = waiters.splice(0);
  for (const waiter of pending) waiter.onLoad();
}

function flushFailed(reason: string) {
  if (loadState === "failed") return;
  loadState = "failed";
  diagnostic("bootstrap-failed", { reason });
  const pending = waiters.splice(0);
  for (const waiter of pending) waiter.onError?.();
}

function handleScriptLoad(script: HTMLScriptElement) {
  if (activeScript !== script || loadState !== "loading") return;

  // A load event fires after the external script has executed. Queueing this
  // check lets any script load listeners finish before we inspect the global,
  // without introducing an availability timer or polling loop.
  queueMicrotask(() => {
    if (activeScript !== script || loadState !== "loading") return;
    script.dataset.loaded = "1";
    if (window.Trustpilot) {
      flushLoaded();
    } else {
      flushFailed("sdk-global-missing-after-load");
    }
  });
}

function attachScript(script: HTMLScriptElement) {
  if (activeScript === script) return;
  activeScript = script;
  diagnostic("bootstrap-requested", {});

  script.addEventListener("load", () => handleScriptLoad(script), { once: true });
  script.addEventListener(
    "error",
    () => {
      if (activeScript !== script || loadState !== "loading") return;
      flushFailed("script-error");
    },
    { once: true },
  );

  // A script loaded by an earlier SPA route is usable immediately when the
  // vendor has already installed its global. There is no reliable, portable
  // way to replay a missed load event without polling, so a loaded tag with no
  // SDK global is treated as a real bootstrap failure.
  if (window.Trustpilot || script.dataset.loaded === "1") {
    if (window.Trustpilot) {
      flushLoaded();
    } else {
      flushFailed("sdk-global-missing-from-existing-script");
    }
  }
}

function injectScript() {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"]`,
  );
  const script = existing ?? document.createElement("script");
  if (!existing) {
    script.src = TRUSTPILOT_SCRIPT_SRC;
    script.async = true;
  }
  attachScript(script);
  if (!existing) document.head.appendChild(script);
}

/**
 * Request the official Trustpilot bootstrap once per page session.
 *
 * Concurrent consumers share the same script element and receive the same
 * terminal result. A failed bootstrap is not retried: retrying would violate
 * Trustpilot's one-request contract and makes a healthy load look like a
 * loader timeout.
 */
export function injectTrustpilotScript(
  onLoad: () => void,
  onError?: () => void,
): void {
  if (window.Trustpilot) {
    if (loadState !== "loaded") loadState = "loaded";
    diagnostic("sdk-already-present", {});
    onLoad();
    return;
  }

  if (loadState === "loaded" || loadState === "failed") {
    if (loadState === "loaded") onLoad();
    else onError?.();
    return;
  }

  waiters.push({ onLoad, onError });
  if (loadState === "loading") return;

  loadState = "loading";
  injectScript();
}

/**
 * Prepare one mounted TrustBox element for the shared bootstrap callback.
 *
 * The historical function name is retained for the existing consumers, but
 * this is no longer a poller. It performs one guarded SDK call after the
 * bootstrap succeeds and reports only real initialization failures.
 */
export function pollAndLoadTrustpilotWidget(
  el: Element,
  onGiveUp?: () => void,
  onLoaded?: () => void,
): { onScriptLoad: () => void; cleanup: () => void } {
  let cancelled = false;
  let completed = false;
  let iframeSeen = false;
  let observer: MutationObserver | null = null;

  const fail = (reason: string) => {
    if (cancelled || completed) return;
    completed = true;
    diagnostic("widget-failed", { reason });
    onGiveUp?.();
  };

  const succeed = () => {
    if (cancelled || completed) return;
    completed = true;
    diagnostic("loadFromElement-result", { success: true });
    onLoaded?.();
  };

  const onScriptLoad = () => {
    if (cancelled || completed || initializedElements.has(el)) return;
    const sdk = window.Trustpilot;
    if (!sdk) {
      fail("sdk-global-missing");
      return;
    }

    initializedElements.add(el);
    diagnostic("loadFromElement-called", { trustpilotPresent: true });

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver((records) => {
        if (iframeSeen) return;
        const created = records.some((record) =>
          Array.from(record.addedNodes).some(
            (node) =>
              node instanceof HTMLIFrameElement ||
              (node instanceof Element && Boolean(node.querySelector("iframe"))),
          ),
        );
        if (created) {
          iframeSeen = true;
          diagnostic("iframe-created", {});
        }
      });
      observer.observe(el, { childList: true, subtree: true });
    }

    try {
      const result = sdk.loadFromElement(el, true);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).then(
          (value) => (value === false ? fail("loadFromElement-returned-false") : succeed()),
          () => fail("loadFromElement-rejected"),
        );
      } else if (result === false) {
        fail("loadFromElement-returned-false");
      } else {
        succeed();
      }
    } catch {
      fail("loadFromElement-threw");
    }
  };

  const cleanup = () => {
    cancelled = true;
    observer?.disconnect();
    observer = null;
  };

  return { onScriptLoad, cleanup };
}
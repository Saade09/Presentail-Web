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

function flushLoaded() {
  if (loadState === "loaded") return;
  loadState = "loaded";
  const pending = waiters.splice(0);
  for (const waiter of pending) waiter.onLoad();
}

function flushFailed() {
  if (loadState === "failed") return;
  loadState = "failed";
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
      flushFailed();
    }
  });
}

function attachScript(script: HTMLScriptElement) {
  if (activeScript === script) return;
  activeScript = script;

  script.addEventListener("load", () => handleScriptLoad(script), { once: true });
  script.addEventListener(
    "error",
    () => {
      if (activeScript !== script || loadState !== "loading") return;
      flushFailed();
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
      flushFailed();
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

  const fail = () => {
    if (cancelled || completed) return;
    completed = true;
    onGiveUp?.();
  };

  const succeed = () => {
    if (cancelled || completed) return;
    completed = true;
    onLoaded?.();
  };

  const onScriptLoad = () => {
    if (cancelled || completed || initializedElements.has(el)) return;
    const sdk = window.Trustpilot;
    if (!sdk) {
      fail();
      return;
    }

    initializedElements.add(el);

    try {
      const result = sdk.loadFromElement(el, true);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).then(
          (value) => (value === false ? fail() : succeed()),
          () => fail(),
        );
      } else if (result === false) {
        fail();
      } else {
        succeed();
      }
    } catch {
      fail();
    }
  };

  const cleanup = () => {
    cancelled = true;
  };

  return { onScriptLoad, cleanup };
}
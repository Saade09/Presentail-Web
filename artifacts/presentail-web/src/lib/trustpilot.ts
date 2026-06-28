export const TRUSTPILOT_SCRIPT_SRC =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";

/**
 * Inject the Trustpilot bootstrap script once into <head> and invoke
 * `onLoad` when ready. Safe to call from multiple widgets concurrently —
 * a second call while the script is already loading will piggy-back on
 * the existing onload event rather than injecting a duplicate tag.
 */
export function injectTrustpilotScript(onLoad: () => void): void {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${TRUSTPILOT_SCRIPT_SRC}"]`,
  );
  if (existing) {
    if (existing.dataset.loaded === "1") {
      onLoad();
    } else {
      existing.addEventListener("load", onLoad, { once: true });
    }
    return;
  }
  const script = document.createElement("script");
  script.src = TRUSTPILOT_SCRIPT_SRC;
  script.async = true;
  script.addEventListener(
    "load",
    () => {
      script.dataset.loaded = "1";
      onLoad();
    },
    { once: true },
  );
  document.head.appendChild(script);
}

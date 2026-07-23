const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SCRIPT_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

const LOADED_ATTR = "data-auth-loaded";

const LOAD_TIMEOUT_MS = 10_000;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.getAttribute(LOADED_ATTR) === "true") {
        resolve();
      } else {
        const existingTimer = setTimeout(() => {
          reject(new Error(`Timed out loading script: ${src}`));
        }, LOAD_TIMEOUT_MS);
        existing.addEventListener("load", () => { clearTimeout(existingTimer); resolve(); }, { once: true });
        existing.addEventListener("error", () => { clearTimeout(existingTimer); reject(new Error(`Failed to load script: ${src}`)); }, { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;

    const timer = setTimeout(() => {
      reject(new Error(`Timed out loading script: ${src}`));
    }, LOAD_TIMEOUT_MS);

    script.addEventListener(
      "load",
      () => {
        clearTimeout(timer);
        script.setAttribute(LOADED_ATTR, "true");
        resolve();
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error(`Failed to load script: ${src}`));
      },
      { once: true }
    );
    document.head.appendChild(script);
  });
}

export function loadAuthScripts(): Promise<void> {
  return Promise.all([
    loadScript(GOOGLE_SCRIPT_SRC),
    loadScript(APPLE_SCRIPT_SRC),
  ]).then(() => undefined);
}

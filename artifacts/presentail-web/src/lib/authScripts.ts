const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SCRIPT_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

const LOADED_ATTR = "data-auth-loaded";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`
    );
    if (existing) {
      if (existing.getAttribute(LOADED_ATTR) === "true") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.setAttribute(LOADED_ATTR, "true");
        resolve();
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

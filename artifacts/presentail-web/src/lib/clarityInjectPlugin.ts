import type { Plugin } from "vite";

export const CLARITY_PROJECT_ID = "mik1damp04"; // i18n-ignore

/**
 * Inject the Microsoft Clarity analytics snippet into the built index.html.
 * Only applied in production mode so dev / Replit preview environments never
 * send data to Clarity. The snippet is inlined into <head> as a single <script>
 * block — identical to the official tag. Because it is a static <head> tag
 * (not React), it loads exactly once per page load and is never duplicated by
 * SPA navigation.
 */
export function clarityInjectPlugin(): Plugin {
  const snippet =
    `<script>(function(c,l,a,r,i,t,y){` +
    `c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};` +
    `t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;` + // i18n-ignore
    `y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);` +
    `})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");</script>`;
  return {
    name: "presentail-clarity-inject",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("</head>", `  ${snippet}\n  </head>`);
    },
  };
}

/**
 * Returns `[clarityInjectPlugin()]` for production builds and an empty array
 * for all other modes (development, staging, etc.).
 *
 * This is the single authoritative gate used by vite.config.ts:
 *   plugins: [...clarityPluginsForMode(mode), ...]
 *
 * Exporting the guard as a named function makes it directly unit-testable, so
 * a future refactor cannot silently break the production-only restriction.
 */
export function clarityPluginsForMode(mode: string): Plugin[] {
  return mode === "production" ? [clarityInjectPlugin()] : [];
}

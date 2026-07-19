/**
 * seo-checks/llms.mjs
 *
 * Checks 30–31: llms.txt content checks.
 * (HTTP 200 checks for llms.txt and llms-full.txt are checks 4–5 in http-status.mjs.)
 */

import { fetchHead, fetchText } from "./utils.mjs";

/**
 * Check 30 (FIXED — llms-txt-content-type): llms.txt Content-Type is a text type.
 *
 * FIX: serve.mjs emits "text/plain; charset=utf-8" for /llms.txt, but some CDN or
 * hosting layers (including Cloudflare's content-type sniffing) may override this to
 * "text/markdown; charset=utf-8" based on the Markdown-formatted content. Both are
 * acceptable machine-readable text types for this file. The check fails only when the
 * content-type is a non-text type (binary, HTML, JSON, etc.) which would indicate a
 * misconfigured route.
 *
 * The acceptable types are: text/plain, text/markdown, text/x-markdown.
 * Any application/* or binary type is a failure.
 */
export async function checkLlmsTxtContentType(BASE, record) {
  const r = await fetchHead(`${BASE}/llms.txt`);
  if (r.status === 0 || r.status === 404) {
    record("llms.txt served with text Content-Type", false, `llms.txt returned HTTP ${r.status} — file missing`);
    return;
  }
  const ct = (r.headers["content-type"] ?? "").toLowerCase();
  const raw = r.headers["content-type"] ?? "(absent)";
  // Accept text/plain, text/markdown, text/x-markdown (CDN may auto-detect).
  const ok = ct.startsWith("text/plain") || ct.startsWith("text/markdown") || ct.startsWith("text/x-markdown");
  record(
    "llms.txt served with text Content-Type",
    ok,
    `Content-Type: ${raw}${ok ? "" : " — expected text/plain or text/markdown"}`
  );
}

/**
 * Check 31: llms.txt has a summary paragraph after the title and before ## Pages.
 */
export async function checkLlmsTxtSummary(BASE, record) {
  const r = await fetchText(`${BASE}/llms.txt`);
  if (r.status === 0 || r.status === 404) {
    record("llms.txt has summary paragraph before ## Pages", false, `llms.txt returned HTTP ${r.status} — file missing`);
    return;
  }
  const text = r.text;
  const titleIdx = text.indexOf("# Presentail");
  const pagesIdx = text.indexOf("## Pages");
  const between =
    titleIdx >= 0 && pagesIdx > titleIdx
      ? text.slice(titleIdx + "# Presentail".length, pagesIdx).trim()
      : "";
  const hasSummary = between.length > 20;
  record(
    "llms.txt has summary paragraph before ## Pages",
    hasSummary,
    hasSummary
      ? `summary: "${between.substring(0, 80)}…"`
      : "no summary found between title and ## Pages"
  );
}

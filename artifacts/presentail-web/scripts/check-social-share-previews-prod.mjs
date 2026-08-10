#!/usr/bin/env node
/**
 * check-social-share-previews-prod.mjs
 *
 * Production variant of check-social-share-previews.mjs.
 *
 * Runs the social-share preview check against https://presentail.com (or the
 * URL supplied as the first CLI argument) and, when any check fails, posts a
 * concise alert to Slack via ALERTS_SLACK_WEBHOOK_URL.
 *
 * Usage:
 *   node artifacts/presentail-web/scripts/check-social-share-previews-prod.mjs [base-url]
 *
 * Exits 0 when all checks pass, 1 when any check fails (same as the inner
 * script so CI / deployment gates can key on the exit code directly).
 *
 * Environment:
 *   ALERTS_SLACK_WEBHOOK_URL  — Slack incoming-webhook URL. When unset the
 *                               check still runs; failures are only logged.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dir     = dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────────

const PROD_BASE     = process.argv[2] ?? "https://presentail.com";
const INNER         = join(__dir, "check-social-share-previews.mjs");
const SITEMAP_CHECK = join(__dir, "check-sitemap-prod.mjs");
const WEBHOOK       = process.env.ALERTS_SLACK_WEBHOOK_URL;

// ── Run a child check script, capturing all output ───────────────────────────

/** @returns {Promise<{ exitCode: number; output: string }>} */
function runScript(scriptPath) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(process.execPath, [scriptPath, PROD_BASE], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (d) => { process.stdout.write(d); chunks.push(d); });
    child.stderr.on("data", (d) => { process.stderr.write(d); chunks.push(d); });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

/** Run the social-share preview check. */
function runCheck() {
  return runScript(INNER);
}

/** Run the sitemap blog-post check. */
function runSitemapCheck() {
  return runScript(SITEMAP_CHECK);
}

// ── Slack helper ──────────────────────────────────────────────────────────────

/**
 * Extract FAIL lines from the combined output so the Slack message is concise.
 * Returns at most MAX_LINES failure lines, with a trailing "…and N more" note
 * when the list is truncated.
 */
function extractFailLines(output, maxLines = 20) {
  const lines = output
    .split("\n")
    .filter((l) => /^FAIL\b/.test(l.trim()))
    .map((l) => l.trim());

  if (lines.length <= maxLines) return lines;
  const shown = lines.slice(0, maxLines);
  shown.push(`…and ${lines.length - maxLines} more failure(s)`);
  return shown;
}

async function postSlackAlert(output, exitCode) {
  if (!WEBHOOK) {
    console.error(
      "[check-social-share-previews-prod] ALERTS_SLACK_WEBHOOK_URL not set — Slack alert skipped",
    );
    return;
  }

  const failLines  = extractFailLines(output);
  const failBullets = failLines.length
    ? failLines.map((l) => `• ${l}`).join("\n")
    : "(no FAIL lines captured — check full log)";

  const text = [
    `:rotating_light: *Social share preview check FAILED* — \`${PROD_BASE}\``,
    `Exit code: ${exitCode}`,
    "",
    "*Failed checks:*",
    failBullets,
    "",
    `_Run \`node artifacts/presentail-web/scripts/check-social-share-previews.mjs ${PROD_BASE}\` for the full report._`,
  ].join("\n");

  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8_000);
    const res  = await fetch(WEBHOOK, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
      signal:  ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.error(
        `[check-social-share-previews-prod] Slack webhook responded ${res.status}`,
      );
    } else {
      console.log("[check-social-share-previews-prod] Slack alert posted.");
    }
  } catch (err) {
    console.error(
      `[check-social-share-previews-prod] Slack alert failed: ${err?.message}`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

// Run social-share preview check first, then sitemap check.
// Both are always run so all failures are visible in one pass.
const { exitCode: shareExitCode, output: shareOutput } = await runCheck();

console.log("\n── Sitemap blog-post check ─────────────────────────────────────\n");
const { exitCode: sitemapExitCode, output: sitemapOutput } = await runSitemapCheck();

const combinedExitCode = shareExitCode !== 0 || sitemapExitCode !== 0 ? 1 : 0;
const combinedOutput   = shareOutput + "\n" + sitemapOutput;

if (combinedExitCode !== 0) {
  await postSlackAlert(combinedOutput, combinedExitCode);
}

process.exit(combinedExitCode);

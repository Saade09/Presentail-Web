// Weekly Merchant Listing Suggestions digest — calls the Google Rich Results
// Test API on a weekly schedule for a representative set of live Presentail
// product pages and posts a grouped Slack summary of any SUGGESTION-level
// issues it finds.
//
// Google may upgrade SUGGESTION-level Merchant Listing issues to hard errors
// without warning. Surfacing them in a weekly digest creates accountability
// before enforcement and lets engineers address them proactively.
//
// Behaviour:
//   • Runs once per ISO week (Mon–Sun). A 6-hour tick ensures the check fires
//     promptly even after a server restart near the week boundary.
//   • Picks up to 3 product slugs from the live OS catalog (first available)
//     and checks EN-LB, EN-AE, and EN-CY variants for each slug (up to 9 URLs).
//   • Calls the Google Rich Results Test API for each URL; extracts every
//     SUGGESTION-severity issue from the "Products" rich-result type.
//   • Deduplicates and groups suggestions by issue message. For each distinct
//     message the Slack post lists all affected product URLs and provides the
//     inspectionResultLink for the first URL that surfaced it.
//   • Sends a single Slack message via ALERTS_SLACK_WEBHOOK_URL.
//   • Is a complete no-op when GOOGLE_RICH_RESULTS_API_KEY or
//     ALERTS_SLACK_WEBHOOK_URL is unset — no log spam, just an info at startup.
//
// Configuration (all optional):
//   MERCHANT_LISTING_SUGGESTIONS_MONITOR_ENABLED — "0" / "false" / "no" / "off"
//       to disable. Default: enabled.
//   GOOGLE_RICH_RESULTS_API_KEY — Google API key with the Search Console API
//       enabled. Omit to skip the monitor entirely (graceful degradation).

import { logger } from "./logger";
import { sendAlert } from "./alerts";
import { hasOsProducts, getOsProducts } from "./osProductsCache";

// ── Configuration ────────────────────────────────────────────────────────────

const ENABLED = (() => {
  const v = (
    process.env.MERCHANT_LISTING_SUGGESTIONS_MONITOR_ENABLED ?? "1"
  ).toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
})();

const GOOGLE_API_KEY = process.env.GOOGLE_RICH_RESULTS_API_KEY ?? "";
const SLACK_WEBHOOK_CONFIGURED = Boolean(process.env.ALERTS_SLACK_WEBHOOK_URL);

/** Check once per week; 6-hour tick so we don't miss the boundary on restart. */
const TICK_MS = 6 * 60 * 60 * 1000;

const GOOGLE_RICH_RESULTS_API_BASE =
  "https://searchconsole.googleapis.com/v1/richresults:run";

/** Abort each Google API call after 30 s (it crawls the page server-side). */
const GOOGLE_API_TIMEOUT_MS = 30_000;

/** Max product slugs to sample from the OS catalog. */
const MAX_PRODUCT_SLUGS = 3;

/** Countries + city combinations to build product page URLs for. */
const COUNTRY_VARIANTS = [
  { lang: "en", countrySlug: "lb", city: "beirut" },
  { lang: "en", countrySlug: "ae", city: "dubai" },
  { lang: "en", countrySlug: "cy", city: "nicosia" },
] as const;

const PRODUCTION_BASE_URL = "https://presentail.com";

/** Only surface suggestions from the Products rich-result type. */
const PRODUCT_RICH_RESULT_TYPE = "Products";

// ── Module state ─────────────────────────────────────────────────────────────

let timer: NodeJS.Timeout | null = null;
let running = false;
/** Tracks the last ISO week (YYYY-WNN) we've evaluated so we fire once per week. */
let lastEvaluatedWeek: string | null = null;

/** Reset internal state. Only call from tests. */
export function __resetForTest(): void {
  lastEvaluatedWeek = null;
  running = false;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the ISO week string for a Date, e.g. "2026-W30". */
function isoWeek(d: Date): string {
  const tmp = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  // ISO week: Thursday of the week determines the year.
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function currentIsoWeek(): string {
  return isoWeek(new Date());
}

/** fetch() with AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── Google Rich Results API ──────────────────────────────────────────────────

interface GoogleRichResultItem {
  name?: string;
  issues?: Array<{
    issueMessage?: string;
    severity?: string;
    issuePercent?: number;
  }>;
}

interface GoogleRichResultDetectedItem {
  richResultType?: string;
  items?: GoogleRichResultItem[];
}

interface GoogleApiResponse {
  testStatus?: { status?: string };
  inspectionResultLink?: string;
  richResults?: {
    detectedItems?: GoogleRichResultDetectedItem[];
  };
}

/** Result for a single product page URL. */
interface PageCheckResult {
  url: string;
  inspectionResultLink: string | null;
  testStatus: string | null;
  suggestions: string[];
  /** null = API error / network failure; false = no Product rich result detected */
  productDetected: boolean | null;
  error?: string;
}

async function checkProductPage(
  url: string,
  apiKey: string,
): Promise<PageCheckResult> {
  const endpoint = `${GOOGLE_RICH_RESULTS_API_BASE}?key=${encodeURIComponent(apiKey)}`;
  let raw: GoogleApiResponse;
  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ url }),
      },
      GOOGLE_API_TIMEOUT_MS,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        url,
        inspectionResultLink: null,
        testStatus: null,
        suggestions: [],
        productDetected: null,
        error: `HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
      };
    }
    raw = (await res.json()) as GoogleApiResponse;
  } catch (err) {
    return {
      url,
      inspectionResultLink: null,
      testStatus: null,
      suggestions: [],
      productDetected: null,
      error: (err as Error)?.message ?? String(err),
    };
  }

  const inspectionResultLink = raw.inspectionResultLink ?? null;
  const testStatus = raw.richResults
    ? ((raw.testStatus?.status ?? null) as string | null)
    : null;

  const detectedItems: GoogleRichResultDetectedItem[] =
    raw.richResults?.detectedItems ?? [];

  const productItems = detectedItems.filter(
    (di) => di.richResultType === PRODUCT_RICH_RESULT_TYPE,
  );

  if (productItems.length === 0) {
    return {
      url,
      inspectionResultLink,
      testStatus,
      suggestions: [],
      productDetected: false,
    };
  }

  const suggestions: string[] = [];
  for (const di of productItems) {
    for (const item of di.items ?? []) {
      for (const issue of item.issues ?? []) {
        if (
          issue.severity?.toUpperCase() === "SUGGESTION" &&
          issue.issueMessage
        ) {
          suggestions.push(issue.issueMessage);
        }
      }
    }
  }

  return {
    url,
    inspectionResultLink,
    testStatus,
    suggestions,
    productDetected: true,
  };
}

// ── Page-list builder ────────────────────────────────────────────────────────

/**
 * Build the list of product page URLs to check.  Picks up to MAX_PRODUCT_SLUGS
 * slugs from the live OS catalog and expands each into one URL per
 * COUNTRY_VARIANTS entry.  Returns null when the OS cache is not populated.
 */
function buildProductUrls(): string[] | null {
  if (!hasOsProducts()) return null;

  const products = getOsProducts() ?? [];
  if (products.length === 0) return null;

  const slugs = products
    .slice(0, MAX_PRODUCT_SLUGS)
    .map((p) => p.id)
    .filter(Boolean);

  if (slugs.length === 0) return null;

  const urls: string[] = [];
  for (const slug of slugs) {
    for (const { lang, countrySlug, city } of COUNTRY_VARIANTS) {
      urls.push(
        `${PRODUCTION_BASE_URL}/${lang}-${countrySlug}/${city}/product/${slug}`,
      );
    }
  }
  return urls;
}

// ── Core run ─────────────────────────────────────────────────────────────────

/**
 * Grouped suggestion: a distinct suggestion message and the list of
 * affected pages (url + inspectionResultLink) that surfaced it.
 */
interface GroupedSuggestion {
  message: string;
  /** Pages where this suggestion appeared, each with their own inspection link. */
  affectedPages: Array<{ url: string; inspectionResultLink: string | null }>;
}

export async function runOnce(): Promise<void> {
  if (running) return;

  const week = currentIsoWeek();
  if (lastEvaluatedWeek === week) {
    logger.info(
      { week },
      "merchantListingSuggestionsMonitor: already evaluated this week, skipping",
    );
    return;
  }

  if (!GOOGLE_API_KEY) {
    logger.info(
      "merchantListingSuggestionsMonitor: GOOGLE_RICH_RESULTS_API_KEY not set — skipping run",
    );
    // Don't mark the week so we retry if the key is set later, but also don't
    // spam on every tick — just log at info level.
    lastEvaluatedWeek = week;
    return;
  }

  const urls = buildProductUrls();
  if (!urls) {
    logger.info(
      { week },
      "merchantListingSuggestionsMonitor: OS catalog not ready — will retry next tick",
    );
    return;
  }

  running = true;
  try {
    logger.info(
      { week, urlCount: urls.length },
      "merchantListingSuggestionsMonitor: starting weekly run",
    );

    // Call the API for each URL sequentially to stay within rate limits.
    const results: PageCheckResult[] = [];
    for (const url of urls) {
      const result = await checkProductPage(url, GOOGLE_API_KEY);
      results.push(result);
      if (result.error) {
        logger.warn(
          { url, error: result.error },
          "merchantListingSuggestionsMonitor: API call failed for URL (non-fatal)",
        );
      } else if (result.productDetected === false) {
        logger.info(
          { url },
          "merchantListingSuggestionsMonitor: no Products rich result detected on page",
        );
      }
    }

    lastEvaluatedWeek = week;

    // ── Group suggestions by message ────────────────────────────────────────
    // Outer map: suggestion message → inner map of url → inspectionResultLink
    // Using an inner Map keyed by URL ensures each (message, url) pair appears
    // at most once in the digest, even when a page surfaces the same suggestion
    // message from multiple detected items.
    const grouped = new Map<
      string,
      Map<string, string | null>
    >();

    for (const r of results) {
      if (!r.productDetected || r.suggestions.length === 0) continue;
      // Deduplicate suggestions within this page using a Set before aggregating.
      const uniqueMsgs = new Set(r.suggestions);
      for (const msg of uniqueMsgs) {
        if (!grouped.has(msg)) {
          grouped.set(msg, new Map<string, string | null>());
        }
        // Only set the inspectionResultLink once per (message, url) pair.
        if (!grouped.get(msg)!.has(r.url)) {
          grouped.get(msg)!.set(r.url, r.inspectionResultLink);
        }
      }
    }

    const groupedSuggestions: GroupedSuggestion[] = [...grouped.entries()].map(
      ([message, urlMap]) => ({
        message,
        affectedPages: [...urlMap.entries()].map(([url, inspectionResultLink]) => ({
          url,
          inspectionResultLink,
        })),
      }),
    );

    // Sort by number of affected pages descending so the most widespread issues
    // appear first.
    groupedSuggestions.sort(
      (a, b) => b.affectedPages.length - a.affectedPages.length,
    );

    const checkedCount = results.filter((r) => !r.error).length;
    const errorCount = results.filter((r) => Boolean(r.error)).length;
    const noProductCount = results.filter(
      (r) => r.productDetected === false,
    ).length;
    const totalSuggestions = groupedSuggestions.length;

    logger.info(
      {
        week,
        checked: checkedCount,
        errors: errorCount,
        noProduct: noProductCount,
        distinctSuggestions: totalSuggestions,
      },
      "merchantListingSuggestionsMonitor: weekly run complete",
    );

    // ── Build Slack digest ──────────────────────────────────────────────────

    if (totalSuggestions === 0 && errorCount === 0) {
      logger.info(
        { week },
        "merchantListingSuggestionsMonitor: no suggestions found — no alert needed",
      );
      return;
    }

    const lines: string[] = [];

    if (totalSuggestions > 0) {
      lines.push(
        `*${totalSuggestions} distinct suggestion(s)* found across ${checkedCount} product page(s) checked.`,
      );
      lines.push(
        "_Google may enforce these as hard errors — address them before the next policy update._",
      );
      lines.push("");

      for (const g of groupedSuggestions) {
        lines.push(`🟡 *${g.message}*`);
        lines.push(`   Affected pages (${g.affectedPages.length}):`);
        const pagesToShow = g.affectedPages.slice(0, 5);
        for (const page of pagesToShow) {
          if (page.inspectionResultLink) {
            lines.push(`   • <${page.inspectionResultLink}|${page.url}>`);
          } else {
            lines.push(`   • ${page.url}`);
          }
        }
        if (g.affectedPages.length > 5) {
          lines.push(`   … +${g.affectedPages.length - 5} more page(s)`);
        }
      }
    }

    if (errorCount > 0) {
      lines.push("");
      lines.push(
        `⚠️ ${errorCount} URL(s) could not be checked (network error or API failure).`,
      );
    }

    await sendAlert({
      title: `Merchant Listing suggestions digest — ${week}: ${totalSuggestions} suggestion(s)`,
      body: lines.join("\n"),
      severity: "info",
      fields: [
        { title: "ISO week", value: week },
        { title: "URLs checked", value: String(checkedCount) },
        {
          title: "Distinct suggestions",
          value: String(totalSuggestions),
        },
        ...(errorCount > 0
          ? [{ title: "Check errors", value: String(errorCount) }]
          : []),
        ...(noProductCount > 0
          ? [
              {
                title: "No Product result",
                value: String(noProductCount),
              },
            ]
          : []),
      ],
      source: "merchantListingSuggestionsMonitor",
    });
  } finally {
    running = false;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startMerchantListingSuggestionsMonitor(): void {
  if (process.env.NODE_ENV === "test") return;

  if (!ENABLED) {
    logger.info("merchantListingSuggestionsMonitor: disabled via env flag");
    return;
  }

  if (!GOOGLE_API_KEY) {
    logger.info(
      "merchantListingSuggestionsMonitor: GOOGLE_RICH_RESULTS_API_KEY not set — monitor will not run",
    );
    return;
  }

  if (!SLACK_WEBHOOK_CONFIGURED) {
    logger.info(
      "merchantListingSuggestionsMonitor: ALERTS_SLACK_WEBHOOK_URL not set — monitor will not run",
    );
    return;
  }

  if (timer) return;

  // Initial delayed run so we don't add startup latency.
  const baseline = setTimeout(() => {
    runOnce().catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message },
        "merchantListingSuggestionsMonitor: baseline run failed",
      );
    });
  }, 120_000); // 2 min after startup
  baseline.unref?.();

  timer = setInterval(() => {
    runOnce().catch((err: unknown) => {
      logger.warn(
        { err: (err as Error)?.message },
        "merchantListingSuggestionsMonitor: tick failed",
      );
    });
  }, TICK_MS);
  timer.unref?.();

  logger.info(
    { tickMs: TICK_MS },
    "merchantListingSuggestionsMonitor: started",
  );
}

export function stopMerchantListingSuggestionsMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

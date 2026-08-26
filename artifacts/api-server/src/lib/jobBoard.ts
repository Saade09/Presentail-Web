import { logger } from "./logger";

// Server-side probe for the company's live JazzHR/Resumator job board
// (presentail.applytojob.com). The embedded page is cross-origin and does
// not cooperate with any postMessage/height-reporting protocol, so the
// Careers page iframe cannot learn its real content height client-side.
//
// Instead we fetch the same public page here, count how many open roles it
// currently lists (each row renders as a `class="jobs_row"` element), and
// derive an iframe height that fits the *current* live list without the
// embed having to guess. Careers.tsx still enables scrolling inside the
// iframe as a safety net in case this estimate undershoots (e.g. job titles
// wrapping to two lines on narrow viewports) — so a mis-estimate can never
// make a role permanently unreachable, only require a small in-frame scroll.

export const JOB_BOARD_URL = "https://presentail.applytojob.com/apply/jobs/";

// Each job listing row renders as `<div class="jobs_row">…` — a stable,
// distinctive marker independent of exact HTML structure elsewhere on the page.
const JOB_ROW_PATTERN = /class="jobs_row"/g;

// Empirically measured against the live page: the search box + table header
// above the first row, and the per-row height of the rendered table.
const CHROME_PX = 160;
const PER_ROW_PX = 34;
const MIN_HEIGHT_PX = 500;
const MAX_HEIGHT_PX = 3600;

export function estimateJobBoardHeight(jobCount: number): number {
  const raw = CHROME_PX + Math.max(0, jobCount) * PER_ROW_PX;
  return Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, Math.round(raw)));
}

export type JobBoardStats = {
  ok: true;
  jobCount: number;
  height: number;
  fetchedAt: number;
  source: "live" | "cache";
};

export type JobBoardStatsFailure = {
  ok: false;
  fetchedAt: number;
};

type CacheEntry = JobBoardStats | JobBoardStatsFailure;

// Short TTL: cheap to refresh, and keeps the estimate close to whatever the
// hiring team currently has posted without hammering the vendor on every
// Careers page view.
const LIVE_TTL_MS = 10 * 60 * 1000; // 10 min
// If the live fetch fails, avoid retrying on every request.
const FAILURE_RETRY_MS = 60 * 1000; // 1 min
const FETCH_TIMEOUT_MS = 5000;

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

async function fetchLive(): Promise<CacheEntry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(JOB_BOARD_URL, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; PresentailCareersBot/1.0)" },
    });
    if (!res.ok) {
      throw new Error(`job board responded ${res.status}`);
    }
    const html = await res.text();
    const jobCount = (html.match(JOB_ROW_PATTERN) ?? []).length;
    return {
      ok: true,
      jobCount,
      height: estimateJobBoardHeight(jobCount),
      fetchedAt: Date.now(),
      source: "live",
    };
  } catch (err: unknown) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "jobBoard: live fetch failed, serving fallback stats",
    );
    return { ok: false, fetchedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns cached (or freshly fetched) stats about the live job board so the
 * Careers page can size its iframe to fit the current listing. Always
 * resolves — never throws — so a vendor outage degrades gracefully to
 * `{ ok: false }` rather than a 500.
 */
export async function getJobBoardStats(): Promise<CacheEntry> {
  const now = Date.now();
  if (cache) {
    const ttl = cache.ok ? LIVE_TTL_MS : FAILURE_RETRY_MS;
    if (now - cache.fetchedAt < ttl) {
      return cache.ok ? { ...cache, source: "cache" } : cache;
    }
  }
  if (!inflight) {
    inflight = fetchLive().then((result) => {
      cache = result;
      inflight = null;
      return result;
    });
  }
  return inflight;
}

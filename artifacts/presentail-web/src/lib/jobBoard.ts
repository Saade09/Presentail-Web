import { apiFetch } from "./api";

/**
 * Reusable embed helper for the JazzHR ("Resumator") live job board widget
 * shown on the Careers page. Mirrors the pattern used by `trustpilot.ts`:
 * client-side only, safe to call from multiple mounts, and dedupes any
 * global wiring so re-mounting the widget never double-registers handlers.
 */

/** Public hosted job board for the company — also used as the "View all
 * jobs" fallback link so visitors can always reach the full listing even
 * if the embedded iframe fails to load. */
export const JOB_BOARD_URL = "https://presentail.applytojob.com/apply/jobs/";

/** Origin allowlist for postMessage height reports coming from the embed. */
const JOB_BOARD_ALLOWED_ORIGIN_SUFFIX = ".applytojob.com";

/** Name of the global function the embedded iframe (or a same-domain helper
 * frame it navigates through) calls to report its rendered content height.
 * Kept as a stable, well-known name in case the job board ever ships a
 * cooperating resize script, in addition to the postMessage fallback below.
 * As of writing, presentail.applytojob.com does not call either of these —
 * the *primary* sizing signal is the server-computed estimate from
 * `fetchJobBoardStats` below, which measures the live page's real row count. */
export const JOB_BOARD_RESIZE_GLOBAL = "presentailResizeJobBoardFrame";

// Used only until the real, content-derived height arrives from
// `fetchJobBoardStats` (or if that request fails for a reason unrelated to
// the vendor page itself, e.g. our own API being briefly unreachable).
export const JOB_BOARD_FALLBACK_HEIGHT = 1200;
export const JOB_BOARD_MIN_HEIGHT = 500;
export const JOB_BOARD_MAX_HEIGHT = 3600;

declare global {
  interface Window {
    [JOB_BOARD_RESIZE_GLOBAL]?: (height: number) => void;
  }
}

function clampHeight(height: number): number {
  return Math.min(JOB_BOARD_MAX_HEIGHT, Math.max(JOB_BOARD_MIN_HEIGHT, Math.round(height)));
}

function extractHeight(data: unknown): number | null {
  if (typeof data === "number") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.height === "number") return record.height;
    if (typeof record.frameHeight === "number") return record.frameHeight;
    if (typeof record.docHeight === "number") return record.docHeight;
  }
  return null;
}

/**
 * Registers the global resize handler the job board iframe would call to
 * report its height, plus a `postMessage` fallback, for the case where the
 * vendor page starts cooperating in the future. Currently a no-op in
 * practice (see module doc comment) but harmless to keep wired up. Runs
 * client-side only; returns a cleanup function that removes both hooks.
 */
export function registerJobBoardResizeHandler(
  onHeight: (height: number) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const apply = (rawHeight: number) => {
    if (Number.isFinite(rawHeight) && rawHeight > 0) {
      onHeight(clampHeight(rawHeight));
    }
  };

  window[JOB_BOARD_RESIZE_GLOBAL] = apply;

  const handleMessage = (event: MessageEvent) => {
    if (!event.origin.endsWith(JOB_BOARD_ALLOWED_ORIGIN_SUFFIX)) return;
    const height = extractHeight(event.data);
    if (height !== null) apply(height);
  };

  window.addEventListener("message", handleMessage);

  return () => {
    if (window[JOB_BOARD_RESIZE_GLOBAL] === apply) {
      delete window[JOB_BOARD_RESIZE_GLOBAL];
    }
    window.removeEventListener("message", handleMessage);
  };
}

export type JobBoardStats =
  // Our server successfully measured the live page's current row count.
  | { status: "ok"; height: number; jobCount: number }
  // Our server reached out to the vendor page and it failed to respond —
  // a genuine "the widget is down" signal.
  | { status: "vendor-down" }
  // We couldn't even ask our own API (offline, briefly unreachable, etc.).
  // This says nothing about the vendor page's own health, so callers should
  // fall back to a generous default height and still try to render the
  // iframe rather than treating it as unavailable.
  | { status: "unknown" };

/**
 * Asks our own API server for the live job board's current row count and a
 * height estimate derived from it (see api-server's lib/jobBoard.ts — the
 * vendor page itself has no cross-origin resize protocol, so this is
 * measured server-side instead of reported by the iframe).
 */
export async function fetchJobBoardStats(): Promise<JobBoardStats> {
  try {
    const data = await apiFetch<{ ok: boolean; height?: number; jobCount?: number }>(
      "/careers/job-board-stats",
    );
    if (data.ok && typeof data.height === "number" && typeof data.jobCount === "number") {
      return { status: "ok", height: clampHeight(data.height), jobCount: data.jobCount };
    }
    return { status: "vendor-down" };
  } catch {
    return { status: "unknown" };
  }
}

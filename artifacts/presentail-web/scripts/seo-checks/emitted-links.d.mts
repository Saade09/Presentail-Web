/**
 * Type declarations for the plain-ESM emitted-anchor crawler
 * (`emitted-links.mjs`) used by the SEO validation scripts.
 */

export interface EmittedLinkResult {
  url: string;
  /** The first sitemap page that emitted this anchor. */
  source: string;
  /** HTTP status of the final response, or 0 when the fetch threw. */
  status: number;
  finalUrl: string;
  ok: boolean;
  /** Error message when the fetch threw. */
  detail?: string;
}

export interface EmittedLinkIssue {
  code: "emitted-link-failed";
  url: string;
  detail: string;
}

/** Same-origin http(s) anchor targets in `html`, hash stripped and de-duplicated. */
export function sameOriginAnchorTargets(html: unknown, pageUrl: string, baseUrl: string): string[];

/**
 * Fetch a bounded, de-duplicated set of anchors emitted by `pages`, following
 * redirects. Product links are checked first when `limit` truncates the set.
 */
export function crawlEmittedLinks(args: {
  pages: Array<{ url: string; html: string }>;
  baseUrl: string;
  concurrency?: number;
  limit?: number;
  fetchImpl?: (
    url: string,
    init: { headers: Record<string, string>; redirect: "follow" },
  ) => Promise<{ ok: boolean; status: number; url?: string }>;
}): Promise<{
  discovered: number;
  checked: number;
  truncated: boolean;
  results: EmittedLinkResult[];
  issues: EmittedLinkIssue[];
}>;

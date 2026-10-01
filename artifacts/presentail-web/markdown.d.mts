/**
 * Type declarations for the plain-ESM Markdown mirror module (`markdown.mjs`),
 * run directly by Node from serve.mjs.
 */

export const MARKDOWN_RETRY_WINDOW_MS: number;

/**
 * True when the HTML pathname (or the same path with a ".md" suffix) has a
 * public Markdown mirror.
 */
export function isMirroredPath(pathname: string | null | undefined): boolean;

/** Build the /sitemap.md index of all public Markdown mirrors. */
export function buildSitemapMd(args?: {
  origin?: string;
  basePath?: string | null;
  categories?: Array<{ id?: string; name?: string }>;
  occasions?: Array<{ id?: string; name?: string }>;
  brands?: Array<{ slug?: string; name?: string }>;
  /** The slug is read from `slug`, falling back to `id`; discontinued products are skipped. */
  products?: Array<{ slug?: string; id?: string; name?: string; status?: string | null }>;
  /** YYYY-MM-DD; omitted from the frontmatter when absent. */
  lastmod?: string;
}): string;

/**
 * Build Markdown for a pathname (with or without ".md"). Resolves to null for
 * unrecognised or non-public paths. `fetchJson` returns parsed JSON, or null.
 */
export function getMarkdownForPath(
  pathname: string | null | undefined,
  opts?: {
    origin?: string;
    basePath?: string;
    fetchJson?: (url: string) => Promise<unknown>;
    apiBaseUrl?: string;
  },
): Promise<string | null>;

/** Static homepage overview served for Accept: text/markdown on "/". */
export function buildHomepageMarkdown(opts?: { origin?: string }): string;

/** Drop the in-process catalog cache so the next request refetches. */
export function invalidateMarkdownCatalogCache(): void;

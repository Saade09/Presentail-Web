/**
 * Type declarations for the plain-ESM sitemap module (`sitemap.mjs`), which
 * is run directly by Node from serve.mjs and imported by the unit tests.
 */

import type { BlogLang, BlogPostContent } from "@workspace/blog-content";
import type { CountrySlugHreflang } from "./src/lib/hreflang.mjs";

export type SitemapLang = "en" | "ar" | "fr" | "el";

/** A product as consumed by buildSitemapXml (see normalizeProducts in generateSitemap). */
export interface SitemapProduct {
  slug?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  inStock?: boolean;
  /** "discontinued" omits the product; other values are treated as active. */
  status?: string | null;
  /** A "seasonal" tag on an out-of-stock product marks it seasonally unavailable. */
  tags?: string[];
}

export interface SitemapBrand {
  slug?: string;
  name?: string;
  /** Products carrying the brand; checked against the city-brand eligibility minimum. */
  count?: number;
}

/** An occasion or category from /api/catalog/metadata. */
export interface SitemapTaxonomyEntry {
  id?: string;
  name?: string;
  count?: number;
}

export type SitemapEligibilityCounts = Record<string, { eligible: number; ineligible: number }>;

/** Per-hub-city lists keyed by country code; an absent key falls back to the flat list. */
export type SitemapByCountry<T> = Partial<Record<CountrySlugHreflang, T[]>>;

export interface BuildSitemapXmlArgs {
  /** e.g. "https://presentail.com" */
  origin: string;
  /** Deploy prefix, e.g. "/" or "/web". */
  basePath?: string | null;
  /** Language prefix for every <loc>; unsupported values fall back to "en". */
  locale?: string;
  products?: SitemapProduct[];
  productsByCountry?: SitemapByCountry<SitemapProduct> | null;
  brands?: SitemapBrand[];
  /**
   * Per-hub-city brand counts (see deriveBrandsByCountry). Only read once the
   * per-city brand gating lands in sitemap.mjs; until then brands use `brands`.
   */
  brandsByCountry?: SitemapByCountry<SitemapBrand> | null;
  occasions?: SitemapTaxonomyEntry[];
  occasionsByCountry?: SitemapByCountry<SitemapTaxonomyEntry> | null;
  categories?: SitemapTaxonomyEntry[];
  categoriesByCountry?: SitemapByCountry<SitemapTaxonomyEntry> | null;
  /** Overrides the bundled BLOG_POSTS; only `datePublished` and language presence are read. */
  blogPosts?: Record<string, Partial<Record<BlogLang, Partial<BlogPostContent>>>> | null;
  /** Mutable collector: per-pageType eligible/ineligible counts are accumulated into `counts`. */
  reportRef?: { counts?: SitemapEligibilityCounts } | null;
  /** Full catalog size, used as the brand eligibility parent count. */
  totalProductCount?: number | null;
  /** YYYY-MM-DD used as <lastmod> for non-blog entries; null omits it. */
  generatedAt?: string | null;
}

/** All cities per country. */
export const SITEMAP_CITIES: Record<CountrySlugHreflang, string[]>;
export const SITEMAP_LANGS: SitemapLang[];
export const RETIRED_CATEGORY_SLUGS: Set<string>;
/** Blog content exists in EN/AR/FR only. */
export const SITEMAP_BLOG_LANGS: BlogLang[];
/** Hub city per country for product / brand canonical URLs (re-exported HUB_CITY). */
export const SITEMAP_CANONICAL_CITIES: Record<CountrySlugHreflang, string>;
/** Static sub-paths emitted for every lang × country × city. */
export const SITEMAP_STATIC_PATHS: string[];
/** Policy sub-paths emitted at the hub city only. */
export const SITEMAP_POLICY_PATHS: string[];
export const SITEMAP_RETRY_WINDOW_MS: number;

/** XML-escape any value after String() coercion. */
export function escXml(s: unknown): string;

/** Strip query/fragment and surrounding slashes; nullish input yields "". */
export function canonicalProductSlug(rawSlug: unknown): string;

/** Build one locale's sitemap XML from already-fetched catalog data. */
export function buildSitemapXml(args?: BuildSitemapXmlArgs): string;

/** Build the <sitemapindex> pointing at one child sitemap per locale. */
export function buildSitemapIndexXml(origin: string, basePath?: string | null): string;

/**
 * Derive per-hub-city brand counts from the `brandNames` of each city's
 * products, matched to slugs via `brandList`. Returns null when no brand list
 * is available so callers use the flat fallback.
 */
export function deriveBrandsByCountry(args: {
  productsByCountry: Record<string, Array<{ brandNames?: string[] }> | null | undefined> | null | undefined;
  brandList: Array<{ slug?: string; name?: string }> | null | undefined;
}): Record<string, Array<{ slug: string; count: number }>> | null;

/**
 * Fetch the live catalog and build one locale's sitemap XML.
 * `fetchJson` returns parsed JSON, or null on failure.
 */
export function generateSitemap(
  origin: string,
  basePath: string | null | undefined,
  fetchJson: (url: string) => Promise<unknown>,
  apiBaseUrl: string,
  locale?: string,
): Promise<string>;

export type SitemapResolveMode = "fresh" | "regenerated" | "stale" | "static-fallback";

/** Apply the /sitemap.xml stale-while-revalidate + cold-cache fallback policy. */
export function resolveSitemap(args: {
  cache: { value: string | null; tsMs: number } | null | undefined;
  nowMs: number;
  ttlMs: number;
  generateFull: () => Promise<string>;
  generateStatic: () => string;
  onError?: (err: unknown, mode: "stale" | "static-fallback") => void;
}): Promise<{ value: string; tsMs: number; mode: SitemapResolveMode }>;

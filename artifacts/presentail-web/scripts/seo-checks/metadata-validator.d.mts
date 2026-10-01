/**
 * Type declarations for the plain-ESM SEO metadata validator
 * (`metadata-validator.mjs`) used by the SEO validation scripts.
 */

export interface SeoHreflangAlternate {
  lang: string;
  href: string;
}

/** SEO-relevant tags extracted from an HTML document (entity-decoded, trimmed). */
export interface SeoDocument {
  titles: string[];
  h1s: string[];
  descriptions: string[];
  canonicals: string[];
  hreflang: SeoHreflangAlternate[];
  /** All robots meta contents joined with ",". */
  robots: string;
}

export interface SeoIssue {
  code: string;
  detail: string;
}

export interface SeoUrlIssue extends SeoIssue {
  url: string;
}

export interface SeoValidationResult {
  url: string;
  title: string;
  h1: string;
  description: string;
  document: SeoDocument;
  issues: SeoIssue[];
}

export function extractSeoDocument(html: unknown): SeoDocument;

/** Validate one page's title / H1 / description / canonical / hreflang. */
export function validateSeoDocument(
  html: unknown,
  url: string,
  opts?: { expectedIndexable?: boolean },
): SeoValidationResult;

/** Cross-check hreflang reciprocity across a set of validated pages. */
export function findHreflangConsistencyIssues(
  results: Array<Pick<SeoValidationResult, "url"> & {
    document?: Partial<Pick<SeoDocument, "hreflang" | "robots">>;
  }>,
): SeoUrlIssue[];

/** Groups of URLs sharing a normalized title or description. */
export function findCrossDocumentDuplicates(
  results: Array<Pick<SeoValidationResult, "url"> & Partial<Pick<SeoValidationResult, "title" | "description">>>,
): Array<{ code: "duplicate-title" | "duplicate-description"; urls: string[] }>;

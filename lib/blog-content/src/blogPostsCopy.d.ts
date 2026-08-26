// Type declarations for the plain-ESM blog copy module (`blogPostsCopy.js`).
// The data itself lives in the sibling `.js` so the Node SEO injector can
// import it at runtime without a TypeScript compilation step.

export type BlogLang = "en" | "ar" | "fr";

export interface BlogFaqItem {
  q: string;
  a: string;
}

/** Inline editorial image rendered inside the article body. */
export interface BlogInlineImage {
  url: string;
  width: number;
  height: number;
  alt?: string;
  caption?: string;
}

/** Info / service callout box rendered inside the article body. */
export interface BlogCallout {
  /** Visual treatment: "info" (neutral) or "service" (sage/ivory + icon). */
  variant?: "info" | "service";
  title?: string;
  body: string;
}

export interface BlogSection {
  heading?: string;
  /** Render the heading as an H3 (sub-section) instead of an H2. */
  subheading?: boolean;
  /** Explicit anchor id; auto-derived from the heading when absent. */
  id?: string;
  body?: string;
  /** List items may contain the same controlled internal `<a>` links as body. */
  items?: string[];
  /** Render `items` as an ordered <ol> list instead of a <ul>. */
  ordered?: boolean;
  faqItems?: BlogFaqItem[];
  /** Large serif pull quote. */
  pullQuote?: string;
  /** Small muted italic editorial note shown beneath the section content. */
  note?: string;
  /** Info or service callout box. */
  callout?: BlogCallout;
  /** Inline editorial image with optional caption. */
  image?: BlogInlineImage;
}

/** Hero / Open Graph image for an article. Dimensions match the source file. */
export interface BlogOgImage {
  url: string;
  width: number;
  height: number;
}

/** Locale-aware CTA target. `path` is a locale-relative storefront path
 *  (e.g. "/category/flowers"); consumers compose the final href as
 *  `/{lang}-{country}/{hubCity}{path}` so market + language context is kept. */
export interface BlogCta {
  label: string;
  /** Storefront path within the market, starting with "/". */
  path: string;
  /** Country slug ("lb" | "ae" | "cy"). Defaults to "lb". */
  country?: string;
}

/** Optional compact product/collection recommendation card config. */
export interface BlogRecommendation {
  /** Card heading, e.g. "Browse our rose arrangements". */
  title: string;
  /** One-line supporting copy. */
  body?: string;
  /** Link label, e.g. "View rose arrangements". */
  label: string;
  /** Storefront path within the market, starting with "/". */
  path: string;
  /** Country slug ("lb" | "ae" | "cy"). Defaults to "lb". */
  country?: string;
  /** Optional static card image (site-relative). */
  image?: BlogInlineImage;
}

export interface BlogPostContent {
  slug: string;
  eyebrow: string;
  title: string;
  /** Optional explicitly authored SEO title. `title` remains supported for backwards compatibility. */
  seoTitle?: string;
  /** Visible page heading (H1). Falls back to `title` when absent. */
  h1?: string;
  description: string;
  /** Short editorial standfirst shown under the H1. Falls back to `description`. */
  dek?: string;
  /** Localized taxonomy labels shown as "GEOGRAPHY · CATEGORY" above the H1.
   *  Fall back to `eyebrow` when absent. */
  geographyLabel?: string;
  categoryLabel?: string;
  /** ISO date string, e.g. "2025-03-15". */
  datePublished: string;
  /**
   * ISO date of the last substantive update. Used for Article JSON-LD and
   * shown instead of datePublished on the article page.
   */
  dateModified?: string;
  /** @deprecated Use dateModified for editorial freshness metadata. */
  lastUpdated?: string;
  ogImage?: BlogOgImage;
  /** Alt text for the hero <img>. Falls back to `title` when absent. */
  ogImageAlt?: string;
  /** CSS object-position for the hero crop on narrow viewports (e.g. "50% 35%"). */
  heroFocal?: string;
  /** Force-show or force-hide the table of contents. When absent, the TOC is
   *  shown automatically for articles with 3+ H2 sections. */
  toc?: boolean;
  /** Locale-aware primary CTA. Falls back to legacy `ctaHref`/`ctaLabel`. */
  cta?: BlogCta;
  /** Optional compact commerce recommendation card. Hidden when absent. */
  recommendation?: BlogRecommendation;
  /** Explicit related-article slugs; defaults to newest posts when absent. */
  relatedSlugs?: string[];
  sections: BlogSection[];
  /** Extra JSON-LD schema objects (e.g. FAQPage, LocalBusiness) emitted verbatim. */
  extraJsonLd?: object[];
  /**
   * Optional CTA button href. When present, overrides the default "/shop" target
   * so a blog post can link directly to a relevant category or landing page.
   */
  ctaHref?: string;
  /**
   * Optional CTA button label. When present, overrides the locale-specific
   * shopCta string so the button text matches the post's specific offer.
   * Only used when ctaHref is also set.
   */
  ctaLabel?: string;
}

/** Map of article slug → per-language content. */
export type BlogPostsBySlug = Record<string, Record<BlogLang, BlogPostContent>>;

export const BLOG_POSTS: BlogPostsBySlug;

/** Languages with dedicated copy; getter aliases to English are excluded. */
export function getBlogPostLanguages(
  articlesByLang: Partial<Record<BlogLang, BlogPostContent>> | null | undefined,
): BlogLang[];

/** Stable editorial category slugs used by the blog landing page. */
export type BlogCategory =
  | "flowers"
  | "gifting-guides"
  | "behind-the-scenes"
  | "makers";

export const BLOG_CATEGORIES: readonly BlogCategory[];

/** Curated related-article graph shared by all language variants. */
export const BLOG_RELATED_SLUGS: Record<string, readonly string[]>;

/** Locale-independent per-post landing-page metadata. */
export interface BlogPostMeta {
  category: BlogCategory;
  /** Editors flag the featured landing-page story here. */
  featured?: boolean;
  /** Explicit reading time (minutes); computed from sections when absent. */
  readingTime?: number;
}

export const BLOG_POST_META: Record<string, BlogPostMeta>;

export function getBlogPostMeta(slug: string): BlogPostMeta;
export function computeReadingTimeMinutes(
  sections: BlogSection[] | undefined,
): number;
export function getBlogPostReadingTime(slug: string, lang?: BlogLang): number;
export function getBlogPostExcerpt(
  article: BlogPostContent | undefined,
): string;
export function getFeaturedBlogSlug(): string;

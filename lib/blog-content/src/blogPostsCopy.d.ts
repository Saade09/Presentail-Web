// Type declarations for the plain-ESM blog copy module (`blogPostsCopy.js`).
// The data itself lives in the sibling `.js` so the Node SEO injector can
// import it at runtime without a TypeScript compilation step.

export type BlogLang = "en" | "ar" | "fr";

export interface BlogFaqItem {
  q: string;
  a: string;
}

export interface BlogSection {
  heading?: string;
  body?: string;
  items?: string[];
  faqItems?: BlogFaqItem[];
}

/** Hero / Open Graph image for an article. Dimensions match the source file. */
export interface BlogOgImage {
  url: string;
  width: number;
  height: number;
}

export interface BlogPostContent {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  /** ISO date string, e.g. "2025-03-15". */
  datePublished: string;
  ogImage?: BlogOgImage;
  sections: BlogSection[];
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

/** Stable editorial category slugs used by the blog landing page. */
export type BlogCategory =
  | "flowers"
  | "gifting-guides"
  | "behind-the-scenes"
  | "makers";

export const BLOG_CATEGORIES: readonly BlogCategory[];

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

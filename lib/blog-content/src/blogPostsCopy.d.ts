// Type declarations for the plain-ESM blog copy module (`blogPostsCopy.js`).
// The data itself lives in the sibling `.js` so the Node SEO injector can
// import it at runtime without a TypeScript compilation step.

export type BlogLang = "en" | "ar" | "fr";

export interface BlogSection {
  heading?: string;
  body: string;
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

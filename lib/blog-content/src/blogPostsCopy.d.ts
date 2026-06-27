// Type declarations for the plain-ESM blog copy module (`blogPostsCopy.js`).
// The data itself lives in the sibling `.js` so the Node SEO injector can
// import it at runtime without a TypeScript compilation step.

export type BlogLang = "en" | "ar" | "fr";

export interface BlogSection {
  heading?: string;
  body: string;
}

export interface BlogPostContent {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  /** ISO date string, e.g. "2025-03-15". */
  datePublished: string;
  sections: BlogSection[];
}

/** Map of article slug → per-language content. */
export type BlogPostsBySlug = Record<string, Record<BlogLang, BlogPostContent>>;

export const BLOG_POSTS: BlogPostsBySlug;

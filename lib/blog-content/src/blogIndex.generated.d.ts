import type { BlogCategory, BlogLang, BlogOgImage } from "./blogPostsCopy.js";
export type { BlogCategory } from "./blogPostsCopy.js";

export interface BlogIndexLocalizedEntry {
  title: string;
  excerpt: string;
  datePublished: string;
  readingTime: number;
  ogImage?: BlogOgImage;
}

export interface BlogIndexEntry {
  category: BlogCategory;
  featured: boolean;
  localized: Partial<Record<BlogLang, BlogIndexLocalizedEntry>>;
}

export const BLOG_CATEGORIES: readonly BlogCategory[];
export const BLOG_INDEX: Record<string, BlogIndexEntry>;
export const FEATURED_BLOG_SLUG: string | undefined;
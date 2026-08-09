type BlogFaqItem = { q: string; a: string };
type BlogSection = {
  heading?: string;
  /** Plain-text paragraph body. Omit when `items` or `faqItems` is used. */
  body?: string;
  /** Render as a <ul>/<li> bullet list instead of a paragraph. */
  items?: string[];
  /** Render as a FAQ question/answer block (dl/dt/dd). */
  faqItems?: BlogFaqItem[];
};
type BlogOgImage = { url: string; width: number; height: number };
type BlogArticle = {
  slug: string;
  eyebrow: string;
  /**
   * SEO / meta title used in <title> and og:title.
   * When `h1` is also set, this value is used verbatim as the page title
   * (no "| Presentail" suffix is appended). When `h1` is absent the suffix
   * is appended per the default blog pattern.
   */
  title: string;
  /** Visible page heading (H1). Falls back to `title` when absent. */
  h1?: string;
  description: string;
  datePublished: string;
  ogImage: BlogOgImage;
  /** Alt text for the hero <img>. Falls back to `title` when absent. */
  ogImageAlt?: string;
  sections: BlogSection[];
  ctaHref?: string;
  ctaLabel?: string;
  extraJsonLd?: object[];
};

export declare const BLOG_POSTS: Record<string, Record<string, BlogArticle>>;

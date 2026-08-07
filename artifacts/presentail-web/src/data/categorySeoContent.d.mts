export type CategorySeoSection = {
  heading: string;
  body: string;
  /** When `absolute` is true seo-inject does NOT prepend locBase to href. */
  links?: Array<{ label: string; href: string; absolute?: boolean }>;
};

export type CategorySeoFaq = { q: string; a: string };

export type CategorySeoEntry = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: CategorySeoSection[];
  faqs: CategorySeoFaq[];
};

export declare const CATEGORY_SEO_CONTENT: Record<
  string,
  Record<string, CategorySeoEntry>
>;

export declare function getCategorySeoContent(opts: {
  country?: string | null;
  city?: string | null;
  slug?: string | null;
  lang?: string | null;
}): CategorySeoEntry | null;

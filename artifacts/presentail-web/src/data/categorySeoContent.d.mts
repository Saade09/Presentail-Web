export type CategorySeoSubsection = {
  h3: string;
  body: string;
  /** When `absolute` is true seo-inject does NOT prepend locBase to href. */
  links?: Array<{ label: string; href: string; absolute?: boolean }>;
};

export type CategorySeoSection = {
  heading: string;
  /** Optional when `subsections` carries the body content instead. */
  body?: string;
  /** H3-level blocks within the section. */
  subsections?: CategorySeoSubsection[];
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

/** Keyed by lang → `${countryCode}/${citySlug}` → category slug. */
export declare const CATEGORY_SEO_CONTENT: Record<
  string,
  Record<string, Record<string, CategorySeoEntry>>
>;

export declare function getCategorySeoContent(opts: {
  country?: string | null;
  city?: string | null;
  slug?: string | null;
  lang?: string | null;
}): CategorySeoEntry | null;

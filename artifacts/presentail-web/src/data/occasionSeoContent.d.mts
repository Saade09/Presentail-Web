export type OccasionSeoSection = {
  heading: string;
  body: string;
  links?: Array<{ label: string; href: string }>;
};

export type OccasionSeoFaq = { q: string; a: string };

export type OccasionSeoEntry = {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  sections: OccasionSeoSection[];
  faqs: OccasionSeoFaq[];
};

export declare const OCCASION_SEO_CONTENT: Record<
  string,
  Record<string, OccasionSeoEntry>
>;

export declare function getOccasionSeoContent(opts: {
  country?: string | null;
  city?: string | null;
  slug?: string | null;
  lang?: string | null;
}): OccasionSeoEntry | null;

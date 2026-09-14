export type HomepageFaq = {
  question: string;
  answer: string;
};

export function buildHomepageFaqs(city: string, lang?: string): HomepageFaq[];
export const HOMEPAGE_FAQ_COUNT: 6;
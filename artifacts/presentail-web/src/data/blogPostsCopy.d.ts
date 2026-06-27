type BlogSection = { heading?: string; body: string };
type BlogOgImage = { url: string; width: number; height: number };
type BlogArticle = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  datePublished: string;
  ogImage: BlogOgImage;
  sections: BlogSection[];
};

export declare const BLOG_POSTS: Record<string, Record<string, BlogArticle>>;

type BlogSection = { heading?: string; body: string };
type BlogArticle = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  datePublished: string;
  sections: BlogSection[];
};

export declare const BLOG_POSTS: Record<string, Record<string, BlogArticle>>;

/**
 * Type declarations for the dependency-free `blog-article-schema.mjs` module
 * so `buildBlogArticleJsonLd` and `BLOG_OG_FALLBACK_IMAGE_PATH` can be
 * imported from TypeScript (BlogPost.tsx) and Node.js (seo-inject.mjs).
 */

/** Site-root-relative path of the fallback OG image for articles with no hero. */
export declare const BLOG_OG_FALLBACK_IMAGE_PATH: string;

export declare function buildBlogArticleJsonLd(params: {
  headline: string;
  description: string;
  datePublished: string;
  /** ISO date of the last substantive update; falls back to datePublished when absent. */
  dateModified?: string;
  image: string;
  publisherUrl: string;
  url: string;
  author?: {
    type: "Person" | "Organization";
    name: string;
    role?: string;
    credential?: string;
    url?: string;
  };
}): {
  "@context": string;
  "@type": string;
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  image: string;
  author: {
    "@type": "Person" | "Organization";
    name: string;
    jobTitle?: string;
    hasCredential?: {
      "@type": "EducationalOccupationalCredential";
      name: string;
    };
    url?: string;
  };
  publisher: {
    "@type": string;
    name: string;
    url: string;
  };
  url: string;
};

// Blog content types live in the shared @workspace/blog-content package
// (lib/blog-content/src/blogPostsCopy.d.ts) — the single source of truth for
// both the web app and the Node SEO injector. This file only re-exports them
// so any legacy deep import keeps compiling.
export type {
  BlogLang,
  BlogFaqItem,
  BlogSection,
  BlogInlineImage,
  BlogCallout,
  BlogOgImage,
  BlogCta,
  BlogRecommendation,
  BlogPostContent,
  BlogPostsBySlug,
  BlogCategory,
  BlogPostMeta,
} from "@workspace/blog-content";
export { BLOG_POSTS } from "@workspace/blog-content";

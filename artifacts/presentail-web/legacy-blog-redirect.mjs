/**
 * Legacy WordPress blog redirect resolution for serve.mjs.
 *
 * The old WordPress site published its blog under country prefixes
 * (/lebanon/blog/, /lebanon/blogs/, /lebanon/blog/category/:cat/,
 * /lebanon/blog/:slug/). Those URLs still hold search impressions, so they
 * must 301 to the equivalent blog content rather than to a city home page —
 * Google treats a bulk redirect to an unrelated page as a soft 404.
 *
 * Blog content is language-scoped (/{lang}/blog/:slug) and the legacy site
 * was English-only, so every target is under /en/blog.
 *
 * Post slugs are checked against BLOG_POSTS from @workspace/blog-content
 * using getBlogPostLanguages — the same source and the same "has a real
 * English article" test that sitemap.mjs uses to emit /en/blog/:slug. A
 * legacy post URL therefore only redirects to an article that is in the
 * sitemap; anything else falls back to the blog hub.
 *
 * Kept in a standalone module so it can be unit-tested without booting the
 * HTTP server.
 */

import { BLOG_POSTS, getBlogPostLanguages } from "@workspace/blog-content";

export const LEGACY_BLOG_HUB_PATH = "/en/blog";

const LEGACY_BLOG_TREE_RE = /^\/blogs?(?:\/.*)?$/;
const LEGACY_BLOG_POST_RE = /^\/blog\/([^/]+)\/?$/;

/**
 * Whether `slug` is a published English blog post.
 *
 * @param {string} slug
 * @param {object} [posts] - injectable for tests; defaults to BLOG_POSTS
 * @returns {boolean}
 */
export function isPublishedEnglishBlogSlug(slug, posts = BLOG_POSTS) {
  if (!slug || !posts || !Object.hasOwn(posts, slug)) return false;
  return getBlogPostLanguages(posts[slug]).includes("en");
}

/**
 * Resolve the redirect path (without BASE_PATH or query string) for the part
 * of a legacy country-prefixed URL that follows the country segment.
 *
 *   "/blog", "/blog/", "/blogs", "/blogs/"     → "/en/blog"
 *   "/blog/category/lebanon-stories/"          → "/en/blog"
 *   "/blog/:slug/" (published English post)    → "/en/blog/:slug"
 *   "/blog/:slug/" (unknown slug)              → "/en/blog"
 *   anything not under /blog or /blogs         → null
 *
 * @param {string} rest  e.g. "/blog/flower-shops-in-lebanon/"
 * @param {object} [posts] - injectable for tests; defaults to BLOG_POSTS
 * @returns {string | null}
 */
export function resolveLegacyBlogRedirectPath(rest, posts = BLOG_POSTS) {
  if (typeof rest !== "string" || !LEGACY_BLOG_TREE_RE.test(rest)) return null;
  const postMatch = rest.match(LEGACY_BLOG_POST_RE);
  if (postMatch) {
    let slug;
    try {
      slug = decodeURIComponent(postMatch[1]);
    } catch {
      return LEGACY_BLOG_HUB_PATH;
    }
    if (isPublishedEnglishBlogSlug(slug, posts)) {
      return `${LEGACY_BLOG_HUB_PATH}/${encodeURIComponent(slug)}`;
    }
  }
  return LEGACY_BLOG_HUB_PATH;
}

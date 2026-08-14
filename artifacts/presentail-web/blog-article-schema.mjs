/**
 * Single source of truth for the Article JSON-LD schema emitted on blog post
 * pages.
 *
 * Kept in a dedicated, dependency-free module (no `node:` imports) so it can
 * be safely imported from BOTH:
 *   - seo-inject.mjs  (Node.js server-side HTML injector and Vite dev plugin)
 *   - src/pages/BlogPost.tsx  (client-side useEffect that patches the DOM for
 *     crawlers that execute JavaScript)
 *
 * Both callers MUST stay in sync: if you add a field here, it appears in both
 * the server-rendered HTML and the live-page DOM update automatically.
 *
 * Caller responsibilities (inputs that require environment knowledge):
 *   - `image`        — resolve to an absolute URL before calling; fall back to
 *                      the site-wide OG image when the article has no hero so
 *                      the schema always carries the `image` field (Google
 *                      rejects Article rich results that omit it).
 *   - `publisherUrl` — origin (+ optional basePath prefix) of the site root.
 *   - `url`          — canonical absolute URL of this article page.
 *
 * Use `BLOG_OG_FALLBACK_IMAGE_PATH` (site-root-relative) as the image source
 * when an article has no custom hero, then prepend your origin+basePath.
 */

/** Site-root-relative path of the fallback OG image for articles with no hero. */
export const BLOG_OG_FALLBACK_IMAGE_PATH = "/opengraph.jpg?v=2";

/**
 * Build the Article JSON-LD schema object for a blog post page.
 *
 * @param {{
 *   headline:     string,
 *   description:  string,
 *   datePublished: string,
 *   dateModified?: string,
 *   image:        string,
 *   publisherUrl: string,
 *   url:          string,
 * }} params
 * @returns {object} Plain object ready to be serialised with JSON.stringify.
 */
export function buildBlogArticleJsonLd({
  headline,
  description,
  datePublished,
  dateModified,
  image,
  publisherUrl,
  url,
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    datePublished,
    ...(dateModified ? { dateModified } : {}),
    image,
    publisher: {
      "@type": "Organization",
      name: "Presentail",
      url: publisherUrl,
    },
    url,
  };
}

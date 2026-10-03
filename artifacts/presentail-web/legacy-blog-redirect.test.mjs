// @vitest-environment node
import { describe, it, expect } from "vitest";
import { BLOG_POSTS, getBlogPostLanguages } from "@workspace/blog-content";
import {
  LEGACY_BLOG_HUB_PATH,
  isPublishedEnglishBlogSlug,
  resolveLegacyBlogRedirectPath,
} from "./legacy-blog-redirect.mjs";

const englishSlugs = Object.keys(BLOG_POSTS).filter((slug) =>
  getBlogPostLanguages(BLOG_POSTS[slug]).includes("en"),
);

describe("resolveLegacyBlogRedirectPath", () => {
  it("has at least one published English post to test against", () => {
    expect(englishSlugs.length).toBeGreaterThan(0);
  });

  it.each([
    "/blog",
    "/blog/",
    "/blogs",
    "/blogs/",
    "/blog/category/flower-gifting-websites/",
    "/blog/category/lebanon-stories/",
    "/blog/category/lebanon-stories",
    "/blog/category/",
    "/blog/page/2/",
    "/blogs/anything/else/",
  ])("%s → blog hub", (rest) => {
    expect(resolveLegacyBlogRedirectPath(rest)).toBe(LEGACY_BLOG_HUB_PATH);
  });

  it("maps a real post slug to its /en/blog article, with or without trailing slash", () => {
    const slug = englishSlugs[0];
    expect(resolveLegacyBlogRedirectPath(`/blog/${slug}`)).toBe(`/en/blog/${slug}`);
    expect(resolveLegacyBlogRedirectPath(`/blog/${slug}/`)).toBe(`/en/blog/${slug}`);
  });

  it("maps every published English post", () => {
    for (const slug of englishSlugs) {
      expect(resolveLegacyBlogRedirectPath(`/blog/${slug}/`)).toBe(
        `/en/blog/${encodeURIComponent(slug)}`,
      );
    }
  });

  it.each([
    "/blog/this-post-does-not-exist/",
    "/blog/constructor/",
    "/blog/__proto__",
    "/blog/%E0%A4%A/",
  ])("unknown or malformed slug %s falls back to the hub", (rest) => {
    expect(resolveLegacyBlogRedirectPath(rest)).toBe(LEGACY_BLOG_HUB_PATH);
  });

  it("falls back to the hub for a post with no real English article", () => {
    const posts = { "ar-only": { ar: { title: "x" } } };
    expect(resolveLegacyBlogRedirectPath("/blog/ar-only/", posts)).toBe(LEGACY_BLOG_HUB_PATH);
    expect(isPublishedEnglishBlogSlug("ar-only", posts)).toBe(false);
  });

  it("uses the injected post list, so new posts are picked up without code changes", () => {
    const posts = { "brand-new-post": { en: { title: "New" } } };
    expect(resolveLegacyBlogRedirectPath("/blog/brand-new-post/", posts)).toBe(
      "/en/blog/brand-new-post",
    );
  });

  it.each(["", "/", "/product/rose-box/", "/blogger", "/blog-post/", "/tips/blog/"])(
    "%s is not a legacy blog path",
    (rest) => {
      expect(resolveLegacyBlogRedirectPath(rest)).toBeNull();
    },
  );

  it("never returns a query string or a port", () => {
    for (const rest of ["/blog/", `/blog/${englishSlugs[0]}/`, "/blog/nope/"]) {
      const target = resolveLegacyBlogRedirectPath(rest);
      expect(target).not.toContain("?");
      expect(target).not.toContain(":443");
    }
  });
});

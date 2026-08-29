#!/usr/bin/env node
/**
 * Generate the compact, browser-facing blog listing index.
 *
 * Article bodies remain in @workspace/blog-content's main entry point for the
 * article route and Node SEO consumers. The blog listing imports this generated
 * subpath instead, so opening the Journal does not download every article body.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLOG_CATEGORIES,
  BLOG_POSTS,
  getBlogPostExcerpt,
  getBlogPostLanguages,
  getBlogPostMeta,
  getBlogPostReadingTime,
  getFeaturedBlogSlug,
} from "../../../lib/blog-content/src/blogPostsCopy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  __dirname,
  "../../../lib/blog-content/src/blogIndex.generated.js",
);

const rows = Object.entries(BLOG_POSTS).map(([slug, articlesByLang]) => {
  const meta = getBlogPostMeta(slug);
  const localized = getBlogPostLanguages(articlesByLang).map((lang) => {
    const article = articlesByLang[lang];
    const image = article.ogImage;
    return [
      lang,
      article.title,
      getBlogPostExcerpt(article),
      article.datePublished,
      getBlogPostReadingTime(slug, lang),
      image?.url ?? null,
      image?.width ?? null,
      image?.height ?? null,
    ];
  });
  return [
    slug,
    meta.category,
    slug === getFeaturedBlogSlug(),
    localized,
  ];
});

const source = `/**
 * GENERATED FILE — run pnpm --filter @workspace/presentail-web generate-blog-index.
 * Compact listing metadata only; full article bodies stay in the main package entry.
 */
const BLOG_INDEX_ROWS = ${JSON.stringify(rows)};

export const BLOG_CATEGORIES = ${JSON.stringify(BLOG_CATEGORIES)};

export const BLOG_INDEX = Object.fromEntries(
  BLOG_INDEX_ROWS.map(([slug, category, featured, localizedRows]) => [
    slug,
    {
      category,
      featured,
      localized: Object.fromEntries(
        localizedRows.map(([lang, title, excerpt, datePublished, readingTime, imageUrl, imageWidth, imageHeight]) => [
          lang,
          {
            title,
            excerpt,
            datePublished,
            readingTime,
            ...(imageUrl
              ? { ogImage: { url: imageUrl, width: imageWidth, height: imageHeight } }
              : {}),
          },
        ]),
      ),
    },
  ]),
);

export const FEATURED_BLOG_SLUG =
  BLOG_INDEX_ROWS.find((row) => row[2])?.[0] ??
  BLOG_INDEX_ROWS.slice().sort((a, b) => {
    const aDate = a[3][0]?.[3] ?? "";
    const bDate = b[3][0]?.[3] ?? "";
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
  })[0]?.[0];
`;

fs.writeFileSync(outputPath, source, "utf8");
console.log(
  `[blog-index] Generated ${path.relative(process.cwd(), outputPath)} (${rows.length} posts).`,
);
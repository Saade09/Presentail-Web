#!/usr/bin/env node
/**
 * check-blog-jsonld-schema.mjs
 *
 * CI guard that validates EVERY real blog post in @workspace/blog-content
 * carries the required fields for the Article JSON-LD rich result that the
 * web storefront's BlogPost.tsx emits client-side.
 *
 * WHY THIS EXISTS (and why the web guard alone is not enough):
 *
 * The web CI guard (check-nonproduct-jsonld-schema.mjs) validates the Article
 * *builder* using a SAMPLE_ARTICLE fixture — it proves the builder is correct
 * in isolation, but it never runs against the live @workspace/blog-content
 * data. A real post that is missing `datePublished`, has an empty `title`, or
 * has an `ogImage` shape mismatch would silently produce a broken Article node
 * in production without any CI alarm.
 *
 * This script fills that gap. It iterates every post in every language,
 * constructs the Article JSON-LD node that BlogPost.tsx would emit for it,
 * and validates it against the same required-field rules that
 * check-nonproduct-jsonld-schema.mjs enforces for the Article type. It then
 * checks that the same required fields satisfy the seo-inject.mjs server-side
 * Article builder too (same data, same fields).
 *
 * Placed in the mobile artifact because the mobile journal screens and the web
 * BlogPost page share @workspace/blog-content as their single source of truth.
 * A broken blog post entry is a bug that affects both surfaces simultaneously,
 * so the mobile CI workflow is the natural place to catch it before it lands.
 *
 * Usage:
 *   node artifacts/presentail/scripts/check-blog-jsonld-schema.mjs
 *
 * Exits 0 on pass, 1 on any failure.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Load blog-content from the lib package.
// blog-content is plain JS (no compilation needed) — import the source file
// directly so this script works without a build step.
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "../../..");

const blogContentPkg = resolve(repoRoot, "lib/blog-content/src/blogPostsCopy.js");
const { BLOG_POSTS } = await import(blogContentPkg);

// ---------------------------------------------------------------------------
// Reuse the validateNode rules from the web guard so the two checks can
// never diverge. validateNode is a pure function with no side effects.
// ---------------------------------------------------------------------------
const webGuardPath = resolve(
  repoRoot,
  "artifacts/presentail-web/scripts/check-nonproduct-jsonld-schema.mjs",
);
const { validateNode } = await import(webGuardPath);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Build the Article JSON-LD node that BlogPost.tsx would emit for `article`.
 * Must stay in sync with the useEffect in artifacts/presentail-web/src/pages/BlogPost.tsx.
 */
function buildArticleNode(article, slug) {
  const url = `https://presentail.com/blog/${slug}`;
  const node = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.datePublished,
    publisher: {
      "@type": "Organization",
      name: "Presentail",
      url: "https://presentail.com",
    },
    url,
  };
  if (article.ogImage) {
    node.image = `https://presentail.com${article.ogImage.url}`;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Extra sanity checks beyond what validateNode covers, specific to the
// blog-content data shape.
// ---------------------------------------------------------------------------
function validateBlogEntry(article, slug, lang) {
  const errors = [];

  if (!isNonEmptyString(slug)) {
    errors.push("slug must be a non-empty string");
  }
  if (!isNonEmptyString(article.title)) {
    errors.push("title must be a non-empty string");
  }
  if (!isNonEmptyString(article.description)) {
    errors.push("description must be a non-empty string");
  }
  if (!isNonEmptyString(article.datePublished)) {
    errors.push("datePublished must be a non-empty string");
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(article.datePublished)) {
    errors.push(
      `datePublished must be an ISO date (YYYY-MM-DD) — got ${JSON.stringify(article.datePublished)}`,
    );
  }
  if (!Array.isArray(article.sections) || article.sections.length === 0) {
    errors.push("sections must be a non-empty array");
  }
  if (article.slug !== undefined && article.slug !== slug) {
    errors.push(
      `article.slug mismatch: outer key is ${JSON.stringify(slug)} but article.slug is ${JSON.stringify(article.slug)}`,
    );
  }
  if (article.ogImage !== undefined) {
    if (!isNonEmptyString(article.ogImage.url)) {
      errors.push("ogImage.url must be a non-empty string");
    }
    if (typeof article.ogImage.width !== "number" || article.ogImage.width <= 0) {
      errors.push("ogImage.width must be a positive number");
    }
    if (typeof article.ogImage.height !== "number" || article.ogImage.height <= 0) {
      errors.push("ogImage.height must be a positive number");
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main check
// ---------------------------------------------------------------------------
function runCheck() {
  const failures = [];
  const slugs = Object.keys(BLOG_POSTS);

  if (slugs.length === 0) {
    console.error("BLOG_POSTS is empty — no articles to validate");
    return 1;
  }

  for (const slug of slugs) {
    const byLang = BLOG_POSTS[slug];
    if (!byLang || typeof byLang !== "object") {
      failures.push({ label: `[${slug}]`, errors: ["entry is not an object"] });
      continue;
    }

    const langs = Object.keys(byLang);
    if (langs.length === 0) {
      failures.push({ label: `[${slug}]`, errors: ["no language variants"] });
      continue;
    }

    for (const lang of langs) {
      const article = byLang[lang];
      const label = `[${slug}][${lang}]`;

      if (!article || typeof article !== "object") {
        failures.push({ label, errors: ["article is not an object"] });
        continue;
      }

      const errors = [
        ...validateBlogEntry(article, slug, lang),
        ...validateNode(buildArticleNode(article, slug)),
      ];
      if (errors.length > 0) {
        failures.push({ label, errors });
      }
    }
  }

  const totalPosts = slugs.reduce((n, s) => n + Object.keys(BLOG_POSTS[s] ?? {}).length, 0);

  if (failures.length > 0) {
    console.error("BLOG JSON-LD ARTICLE SCHEMA CHECK FAILED:\n");
    for (const f of failures) {
      console.error(`  ✗ ${f.label}`);
      for (const e of f.errors) console.error(`      - ${e}`);
    }
    console.error(
      `\n${failures.length} blog post variant(s) have invalid or missing Article JSON-LD fields.\n` +
        "Fix the offending entries in lib/blog-content/src/blogPostsCopy.js so every post carries\n" +
        "a non-empty title, description, datePublished (YYYY-MM-DD), and consistent ogImage shape.\n" +
        "These fields map directly to the Article rich-result that BlogPost.tsx emits client-side\n" +
        "and that seo-inject.mjs emits server-side — a gap here means Google silently drops the\n" +
        "Article rich result for the affected post.",
    );
    return 1;
  }

  console.log(
    `Blog JSON-LD Article schema check passed — ${slugs.length} slug(s), ` +
      `${totalPosts} language variant(s) all carry required Article fields.`,
  );
  return 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  process.exit(runCheck());
}

export { runCheck, buildArticleNode, validateBlogEntry };

import { normalizeSeoText } from "../../src/lib/seo.mjs";

const TITLE_MIN = 30;
const TITLE_MAX = 65;

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": "\"",
      "&apos;": "'",
      "&nbsp;": " ",
    })[entity.toLowerCase()] ?? entity);
}

function stripTags(value) {
  return decodeEntities(String(value ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractAll(html, pattern, group = 1) {
  return [...String(html ?? "").matchAll(pattern)].map((match) => stripTags(match[group]));
}

function extractAttribute(tag, attribute) {
  const match = String(tag).match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, "i"));
  return decodeEntities(match?.[1] ?? "").trim();
}

export function extractSeoDocument(html) {
  const source = String(html ?? "");
  const titles = extractAll(source, /<title\b[^>]*>([\s\S]*?)<\/title>/gi);
  const h1s = extractAll(source, /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi);
  const metaTags = [...source.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const descriptionTags = metaTags.filter((tag) =>
    /^description$/i.test(extractAttribute(tag, "name")),
  );
  const canonicals = [...source.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["']/i.test(tag))
    .map((tag) => extractAttribute(tag, "href"));
  const hreflang = [...source.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => /\brel\s*=\s*["'][^"']*\balternate\b[^"']*["']/i.test(tag))
    .map((tag) => ({
      lang: extractAttribute(tag, "hreflang"),
      href: extractAttribute(tag, "href"),
    }))
    .filter(({ lang }) => lang);
  const robots = metaTags
    .filter((tag) => /^robots$/i.test(extractAttribute(tag, "name")))
    .map((tag) => extractAttribute(tag, "content"))
    .join(",");

  return {
    titles,
    h1s,
    descriptions: descriptionTags.map((tag) => extractAttribute(tag, "content")),
    canonicals,
    hreflang,
    robots,
  };
}

function comparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return String(value ?? "").replace(/#.*$/, "").replace(/\/+$/, "") || "/";
  }
}

function localeInfo(value) {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/^\/(en|ar|fr|el)(?:-([a-z]{2}))?(?=\/|$)/i);
    if (!match) return null;
    return {
      lang: match[1].toLowerCase(),
      country: match[2]?.toLowerCase() ?? null,
      label: `${match[1]}${match[2] ? `-${match[2]}` : ""}`.toLowerCase(),
      groupKey: pathname.replace(match[0], match[2] ? `/{locale}-${match[2].toLowerCase()}` : "/{locale}"),
    };
  } catch {
    return null;
  }
}

export function validateSeoDocument(html, url, { expectedIndexable = true } = {}) {
  const document = extractSeoDocument(html);
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });
  const title = document.titles[0] ?? "";
  const h1 = document.h1s[0] ?? "";
  const description = document.descriptions[0] ?? "";

  if (document.titles.length === 0 || !title) add("missing-title", "No non-empty <title> found");
  if (document.titles.length > 1) add("multiple-titles", `Found ${document.titles.length} title tags`);
  if (document.h1s.length === 0 || !h1) add("missing-h1", "No non-empty H1 found");
  if (document.h1s.length > 1) add("multiple-h1s", `Found ${document.h1s.length} H1 elements`);
  if (document.descriptions.length === 0 || !description) add("missing-description", "No non-empty meta description found");
  if (document.descriptions.length > 1) add("multiple-descriptions", `Found ${document.descriptions.length} meta descriptions`);

  if (title && h1 && normalizeSeoText(title) === normalizeSeoText(h1)) {
    add("h1-title-collision", `H1 "${h1}" and title "${title}" have the same normalized meaning`);
  }
  if (title && title.length < TITLE_MIN) add("title-too-short", `${title.length} characters: "${title}"`);
  if (title && title.length > TITLE_MAX) add("title-too-long", `${title.length} characters: "${title}"`);

  if (document.canonicals.length === 0) {
    add("missing-canonical", "No canonical link found");
  } else {
    if (document.canonicals.length > 1) add("multiple-canonicals", `Found ${document.canonicals.length} canonical links`);
    if (comparableUrl(document.canonicals[0]) !== comparableUrl(url)) {
      add("incorrect-canonical", `Expected ${url}, found ${document.canonicals[0]}`);
    }
  }

  let expectsHreflang = false;
  try {
    expectsHreflang = /^\/(?:en|ar|fr|el)(?:-|\/)/.test(new URL(url).pathname);
  } catch {
    expectsHreflang = /^\/(?:en|ar|fr|el)(?:-|\/)/.test(String(url));
  }
  if (expectedIndexable && expectsHreflang && !/noindex/i.test(document.robots)) {
    if (document.hreflang.length === 0) {
      add("missing-hreflang", "No hreflang alternates found");
    } else {
      const langs = document.hreflang.map(({ lang }) => lang.toLowerCase());
      if (new Set(langs).size !== langs.length) add("duplicate-hreflang", `Duplicate values: ${langs.join(", ")}`);
      if (!langs.includes("x-default")) add("missing-hreflang-x-default", "No x-default alternate found");
      const currentLocale = localeInfo(url);
      const expectedSelfLabel = currentLocale?.label;
      const selfAlternate = document.hreflang.find(({ lang }) =>
        lang.toLowerCase() === expectedSelfLabel);
      if (!selfAlternate) {
        add("missing-hreflang-self", `No ${expectedSelfLabel ?? "current-locale"} self alternate found`);
      } else if (comparableUrl(selfAlternate.href) !== comparableUrl(document.canonicals[0] ?? url)) {
        add("incorrect-hreflang-self", `Expected ${document.canonicals[0] ?? url}, found ${selfAlternate.href}`);
      }
      for (const alternate of document.hreflang) {
        if (!alternate.href) {
          add("empty-hreflang-href", `hreflang ${alternate.lang} has no href`);
          continue;
        }
        if (alternate.lang.toLowerCase() !== "x-default") {
          const targetLocale = localeInfo(alternate.href);
          if (!targetLocale || targetLocale.label !== alternate.lang.toLowerCase()) {
            add("inconsistent-hreflang-target", `${alternate.lang} points to ${alternate.href}`);
          }
        }
      }
    }
  }

  return { url, title, h1, description, document, issues };
}

export function findHreflangConsistencyIssues(results) {
  const issues = [];
  const groups = new Map();
  const resultByUrl = new Map(results.map((result) => [comparableUrl(result.url), result]));

  for (const result of results) {
    const locale = localeInfo(result.url);
    if (!locale || /noindex/i.test(result.document?.robots ?? "")) continue;
    const key = `${new URL(result.url).origin}${locale.groupKey}`;
    const group = groups.get(key) ?? [];
    group.push({ result, locale });
    groups.set(key, group);
  }

  for (const siblings of groups.values()) {
    const english = siblings.find(({ locale }) => locale.lang === "en");
    for (const { result } of siblings) {
      const alternates = new Map(
        (result.document?.hreflang ?? []).map(({ lang, href }) => [
          lang.toLowerCase(),
          comparableUrl(href),
        ]),
      );
      for (const sibling of siblings) {
        const actual = alternates.get(sibling.locale.label);
        const expected = comparableUrl(sibling.result.url);
        if (!actual) {
          issues.push({
            code: "missing-expected-hreflang",
            url: result.url,
            detail: `Missing ${sibling.locale.label} alternate to ${sibling.result.url}`,
          });
        } else if (actual !== expected) {
          issues.push({
            code: "incorrect-hreflang-target",
            url: result.url,
            detail: `${sibling.locale.label} expected ${sibling.result.url}, found ${actual}`,
          });
        } else if (!resultByUrl.has(actual)) {
          issues.push({
            code: "hreflang-target-not-indexable",
            url: result.url,
            detail: `${sibling.locale.label} target is not in the scanned sitemap: ${actual}`,
          });
        }
      }
      if (english) {
        const expectedDefault = comparableUrl(english.result.url);
        const actualDefault = alternates.get("x-default");
        if (actualDefault !== expectedDefault) {
          issues.push({
            code: "incorrect-hreflang-x-default",
            url: result.url,
            detail: `Expected ${english.result.url}, found ${actualDefault ?? "none"}`,
          });
        }
      }
      for (const [lang, target] of alternates) {
        if (lang === "x-default" || resultByUrl.has(target)) continue;
        issues.push({
          code: "hreflang-target-not-indexable",
          url: result.url,
          detail: `${lang} target is not in the scanned sitemap: ${target}`,
        });
      }
    }
  }
  return issues;
}

export function findCrossDocumentDuplicates(results) {
  const duplicates = [];
  for (const [field, code] of [["title", "duplicate-title"], ["description", "duplicate-description"]]) {
    const groups = new Map();
    for (const result of results) {
      const normalized = normalizeSeoText(result[field]);
      if (!normalized) continue;
      const urls = groups.get(normalized) ?? [];
      urls.push(result.url);
      groups.set(normalized, urls);
    }
    for (const urls of groups.values()) {
      if (urls.length > 1) duplicates.push({ code, urls });
    }
  }
  return duplicates;
}
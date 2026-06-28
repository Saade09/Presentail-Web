/**
 * Serve-backed JSON-LD rich-result schema regression tests.
 *
 * check-nonproduct-jsonld-schema.mjs validates JSON-LD by building heads from
 * *synthetic* fixtures, which exercises the individual builder functions
 * (buildBreadcrumbListSchema, buildOrganizationSchema, etc.). What it cannot
 * exercise is the real serve-time path — injectSeoTagsAsync — which fetches a
 * live entity from the OS API (or the fixture API in CI), resolves its
 * slug/locale, and assembles the @graph before injecting it into the HTML.
 *
 * A regression in the fetch → resolve → assemble glue — a missing field
 * propagation, a changed entity shape, a broken branch in injectSeoTagsAsync
 * — could ship malformed schema that the fixture-based guard never sees, because
 * the fixture guard bypasses injectSeoTagsAsync entirely.
 *
 * This spec requests representative live routes through serve.mjs (backed by the
 * SEO entity fixture API started in the "Web serve checks" workflow), extracts
 * every JSON-LD block from the served HTML, and runs the same per-@type
 * required-field validators as check-nonproduct-jsonld-schema.mjs. It fails the
 * workflow when a real served page emits invalid or missing schema.
 *
 * Routes exercised (all resolve real entities via the fixture API):
 *   /en-lb/beirut/                                city homepage
 *   /en-lb/beirut/faqs                            FAQs page
 *   /en-lb/beirut/product/rose-bouquet            product entity page
 *   /en-lb/beirut/blog/inside-spring-sourcing-trip blog post entity page
 *   /en-lb/beirut/category/flowers                category entity page
 *   /en-lb/beirut/occasion/birthday               occasion entity page
 *
 * The validators below are the same logic as check-nonproduct-jsonld-schema.mjs
 * (validateNode, extractAllJsonLd) inlined here to avoid .mjs import resolution
 * issues in the Playwright TypeScript runner.
 *
 * Uses Playwright's APIRequestContext so tests exercise the real HTTP layer
 * (serve.mjs) without a browser — exactly the initial HTML crawlers receive.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Validators — identical logic to check-nonproduct-jsonld-schema.mjs
// ---------------------------------------------------------------------------

/**
 * Pull every JSON-LD node out of a raw HTML string, flattening @graph wrappers.
 */
function extractAllJsonLd(html: string): Record<string, unknown>[] {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const nodes: Record<string, unknown>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>)["@graph"])
    ) {
      for (const node of (parsed as Record<string, unknown[]>)["@graph"]) {
        if (node && typeof node === "object") nodes.push(node as Record<string, unknown>);
      }
    } else if (parsed && typeof parsed === "object") {
      nodes.push(parsed as Record<string, unknown>);
    }
  }
  return nodes;
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && (v as string).trim() !== "";
}

function isUrl(v: unknown): boolean {
  return isNonEmptyString(v) && /^https?:\/\//.test(v as string);
}

function isPositiveInteger(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && (v as number) > 0;
}

function validateNameUrl(node: Record<string, unknown>, type: string): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(node.name)) {
    errors.push(
      `${type}.name must be a non-empty string (got ${JSON.stringify(node.name)})`,
    );
  }
  if (!isUrl(node.url)) {
    errors.push(
      `${type}.url must be an http(s) URL (got ${JSON.stringify(node.url)})`,
    );
  }
  return errors;
}

function validateArticle(node: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(node.headline)) {
    errors.push(
      `Article.headline must be a non-empty string (got ${JSON.stringify(node.headline)})`,
    );
  }
  if (!isNonEmptyString(node.datePublished)) {
    errors.push(
      `Article.datePublished must be a non-empty string (got ${JSON.stringify(node.datePublished)})`,
    );
  }
  return errors;
}

function validateFaqPage(node: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const entities = node.mainEntity as unknown[];
  if (!Array.isArray(entities) || entities.length === 0) {
    return ["FAQPage.mainEntity must be a non-empty array"];
  }
  entities.forEach((q: unknown, i: number) => {
    if (!q || typeof q !== "object") {
      errors.push(`FAQPage.mainEntity[${i}] is not an object`);
      return;
    }
    const qi = q as Record<string, unknown>;
    if (qi["@type"] !== "Question") {
      errors.push(
        `FAQPage.mainEntity[${i}].@type must be "Question" (got ${JSON.stringify(qi["@type"])})`,
      );
    }
    if (!isNonEmptyString(qi.name)) {
      errors.push(
        `FAQPage.mainEntity[${i}].name must be a non-empty string`,
      );
    }
    const ans = qi.acceptedAnswer;
    if (!ans || typeof ans !== "object") {
      errors.push(
        `FAQPage.mainEntity[${i}].acceptedAnswer must be an object`,
      );
    } else {
      const ansi = ans as Record<string, unknown>;
      if (ansi["@type"] !== "Answer") {
        errors.push(
          `FAQPage.mainEntity[${i}].acceptedAnswer.@type must be "Answer" (got ${JSON.stringify(ansi["@type"])})`,
        );
      }
      if (!isNonEmptyString(ansi.text)) {
        errors.push(
          `FAQPage.mainEntity[${i}].acceptedAnswer.text must be a non-empty string`,
        );
      }
    }
  });
  return errors;
}

function validateListItems(
  node: Record<string, unknown>,
  type: string,
  opts: { requireItemExceptLast: boolean },
): string[] {
  const errors: string[] = [];
  const list = node.itemListElement as unknown[];
  if (!Array.isArray(list) || list.length === 0) {
    return [`${type}.itemListElement must be a non-empty array`];
  }
  list.forEach((li: unknown, i: number) => {
    if (!li || typeof li !== "object") {
      errors.push(`${type}.itemListElement[${i}] is not an object`);
      return;
    }
    const lii = li as Record<string, unknown>;
    if (lii["@type"] !== "ListItem") {
      errors.push(
        `${type}.itemListElement[${i}].@type must be "ListItem" (got ${JSON.stringify(lii["@type"])})`,
      );
    }
    if (!isPositiveInteger(lii.position)) {
      errors.push(
        `${type}.itemListElement[${i}].position must be a positive integer (got ${JSON.stringify(lii.position)})`,
      );
    } else if ((lii.position as number) !== i + 1) {
      errors.push(
        `${type}.itemListElement[${i}].position must be ${i + 1} to match its order (got ${lii.position})`,
      );
    }
    if (!isNonEmptyString(lii.name)) {
      errors.push(
        `${type}.itemListElement[${i}].name must be a non-empty string`,
      );
    }
    const isLast = i === list.length - 1;
    if (opts.requireItemExceptLast && !isLast && !isUrl(lii.item)) {
      errors.push(
        `${type}.itemListElement[${i}].item must be an http(s) URL (only the final crumb may omit it; got ${JSON.stringify(lii.item)})`,
      );
    }
  });
  return errors;
}

/**
 * Validate a single JSON-LD node against its @type's required field set.
 * Unknown @types return [] (not our concern). Product is skipped — it has its
 * own dedicated guard (check-product-jsonld-schema.mjs).
 */
function validateNode(node: Record<string, unknown>): string[] {
  if (!node || typeof node !== "object") return ["JSON-LD node is missing"];
  const type = node["@type"] as string | undefined;
  switch (type) {
    case "Organization":
    case "WebSite":
    case "Florist":
    case "WebPage":
    case "ContactPage":
      return validateNameUrl(node, type);
    case "Article":
      return validateArticle(node);
    case "FAQPage":
      return validateFaqPage(node);
    case "BreadcrumbList":
      return validateListItems(node, type, { requireItemExceptLast: true });
    case "ItemList":
      return validateListItems(node, type, { requireItemExceptLast: false });
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Route cases — each is fetched from serve.mjs and validated
// ---------------------------------------------------------------------------

interface JsonLdRouteCase {
  /** Human-readable label for test output. */
  label: string;
  /** Path to request from serve.mjs. */
  path: string;
  /**
   * JSON-LD @types that MUST be emitted by this route. Used to catch a builder
   * or injectSeoTagsAsync regression that silently stops emitting a schema type.
   */
  expectTypes: string[];
}

const JSONLD_ROUTE_CASES: JsonLdRouteCase[] = [
  {
    label: "city homepage /en-lb/beirut/",
    path: "/en-lb/beirut/",
    expectTypes: ["Organization", "WebSite", "Florist", "BreadcrumbList"],
  },
  {
    label: "FAQs page /en-lb/beirut/faqs",
    path: "/en-lb/beirut/faqs",
    expectTypes: ["Organization", "FAQPage"],
  },
  {
    label: "product entity page /en-lb/beirut/product/rose-bouquet",
    path: "/en-lb/beirut/product/rose-bouquet",
    expectTypes: ["Organization", "BreadcrumbList"],
  },
  {
    label:
      "blog post entity page /en-lb/beirut/blog/inside-spring-sourcing-trip",
    path: "/en-lb/beirut/blog/inside-spring-sourcing-trip",
    expectTypes: ["Organization", "Article", "BreadcrumbList"],
  },
  {
    label: "category entity page /en-lb/beirut/category/flowers",
    path: "/en-lb/beirut/category/flowers",
    expectTypes: ["Organization", "BreadcrumbList", "ItemList"],
  },
  {
    label: "occasion entity page /en-lb/beirut/occasion/birthday",
    path: "/en-lb/beirut/occasion/birthday",
    expectTypes: ["Organization", "BreadcrumbList", "ItemList"],
  },
];

// ---------------------------------------------------------------------------
// Parameterized test blocks — one per route case
// ---------------------------------------------------------------------------

for (const { label, path, expectTypes } of JSONLD_ROUTE_CASES) {
  test.describe(`JSON-LD schema — ${label}`, () => {
    let nodes: Record<string, unknown>[];

    test.beforeAll(async ({ request }) => {
      const response = await request.get(path);
      expect(
        response.status(),
        `serve.mjs returned ${response.status()} for ${path}`,
      ).toBe(200);
      const html = await response.text();
      nodes = extractAllJsonLd(html);
    });

    test("all JSON-LD nodes pass required-field validation", () => {
      const allErrors: string[] = [];
      for (const node of nodes) {
        const errors = validateNode(node);
        for (const e of errors) allErrors.push(e);
      }
      expect(
        allErrors,
        `${path} emitted invalid JSON-LD:\n${allErrors.map((e) => `  - ${e}`).join("\n")}`,
      ).toHaveLength(0);
    });

    test("all expected @types are emitted", () => {
      const emittedTypes = new Set(
        nodes.map((n) => n["@type"] as string).filter(Boolean),
      );
      const missingTypes = expectTypes.filter((t) => !emittedTypes.has(t));
      expect(
        missingTypes,
        `${path} is missing expected JSON-LD @types: ${missingTypes.join(", ")} ` +
          `(emitted: ${[...emittedTypes].join(", ")})`,
      ).toHaveLength(0);
    });
  });
}

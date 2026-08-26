// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { BLOG_POSTS } from "@workspace/blog-content";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported so Vitest
// can hoist them. The slug is fed to BlogPost via wouter's useParams.
// ---------------------------------------------------------------------------

let mockSlug = "";

vi.mock("wouter", () => ({
  useParams: () => ({ slug: mockSlug }),
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...rest}>{children}</a>
  ),
  Redirect: ({ to }: { to: string }) => <div data-testid="redirect" data-to={to} />,
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import BlogPost from "./BlogPost";

// Pick a real article that ships a hero / OG image so the test follows the
// shared blog source of truth instead of a hand-rolled fixture.
const SLUG_WITH_IMAGE = Object.keys(BLOG_POSTS).find(
  (slug) => BLOG_POSTS[slug].en?.ogImage,
)!;
const ARTICLE = BLOG_POSTS[SLUG_WITH_IMAGE].en;

beforeEach(() => {
  mockSlug = SLUG_WITH_IMAGE;
});

afterEach(() => {
  // BlogPost cleans up its own injected tags on unmount, but guard against any
  // leaking into a sibling test if a render is not torn down.
  document.head.querySelectorAll("[data-seo-blog]").forEach((el) => el.remove());
  document.getElementById("blog-post-schema")?.remove();
});

describe("BlogPost — hero image", () => {
  it("renders the hero <img> when the article has an ogImage", () => {
    expect(ARTICLE.ogImage).toBeTruthy();
    renderWithProviders(<BlogPost />);

    const hero = screen.getByTestId("blog-post-hero-image") as HTMLImageElement;
    expect(hero).toBeTruthy();
    expect(hero.getAttribute("src")).toBe(ARTICLE.ogImage!.url);
    expect(hero.getAttribute("width")).toBe(String(ARTICLE.ogImage!.width));
    expect(hero.getAttribute("height")).toBe(String(ARTICLE.ogImage!.height));
  });
});

describe("BlogPost — editorial template (send-roses-to-lebanon)", () => {
  beforeEach(() => {
    mockSlug = "send-roses-to-lebanon";
  });

  it("renders taxonomy label, H1, dek and meta row above the hero", () => {
    renderWithProviders(<BlogPost />);
    const article = BLOG_POSTS["send-roses-to-lebanon"].en;

    const taxonomy = screen.getByTestId("blog-post-taxonomy");
    expect(taxonomy.textContent).toBe("Lebanon · Gifting Guide");

    const h1 = screen.getByTestId("blog-post-title");
    expect(h1.tagName).toBe("H1");
    expect(h1.textContent).toBe(article.h1);

    expect(screen.getByTestId("blog-post-dek").textContent).toBe(article.dek);

    // Intro order: the H1 must precede the hero image in the DOM.
    const hero = screen.getByTestId("blog-post-hero-image");
    expect(h1.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the TOC from H2 sections (sidebar + mobile disclosure)", () => {
    renderWithProviders(<BlogPost />);
    expect(screen.getByTestId("blog-toc-sidebar")).toBeTruthy();
    const toggle = screen.getByTestId("blog-toc-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("renders pull quote, service callout, FAQ accordion buttons and recommendation cards", () => {
    renderWithProviders(<BlogPost />);
    expect(screen.getByTestId("blog-pull-quote")).toBeTruthy();
    expect(screen.getByTestId("blog-callout-service")).toBeTruthy();
    const accordion = screen.getByTestId("blog-faq-accordion");
    expect(accordion.querySelectorAll("button").length).toBeGreaterThan(0);
    // Recommendation renders in both sidebar (desktop) and inline (mobile) slots.
    expect(screen.getByTestId("blog-recommendation-sidebar")).toBeTruthy();
    expect(screen.getByTestId("blog-recommendation-inline")).toBeTruthy();
  });

  it("builds a locale-aware CTA href from the cta config and shows the share button", () => {
    renderWithProviders(<BlogPost />);
    const cta = screen.getByTestId("blog-post-cta-intro");
    expect(cta.textContent).toBe("Shop roses in Lebanon");
    expect(cta.closest("a")?.getAttribute("href")).toBe("/en-lb/beirut/category/flowers");
    expect(screen.getByTestId("blog-post-share")).toBeTruthy();
  });

  it("moves Back to the Journal to the bottom and emits dateModified in JSON-LD", () => {
    renderWithProviders(<BlogPost />);
    expect(screen.getByTestId("blog-post-back-to-journal")).toBeTruthy();
    const json = JSON.parse(document.getElementById("blog-post-schema")!.textContent ?? "{}");
    expect(json.dateModified).toBe(BLOG_POSTS["send-roses-to-lebanon"].en.dateModified);
  });
});

describe("BlogPost — legacy article fallbacks (no new fields)", () => {
  // Any article without the new optional fields must still render.
  const LEGACY_SLUG = Object.keys(BLOG_POSTS).find(
    (slug) => Boolean(BLOG_POSTS[slug].en) && !BLOG_POSTS[slug].en?.dek && !BLOG_POSTS[slug].en?.cta,
  );

  it("renders with description as dek and legacy/shop CTA fallback", () => {
    expect(LEGACY_SLUG).toBeTruthy();
    mockSlug = LEGACY_SLUG!;
    const article = BLOG_POSTS[LEGACY_SLUG!].en;
    renderWithProviders(<BlogPost />);

    expect(screen.getByTestId("blog-post-title").textContent).toBe(
      article.h1 ?? article.title,
    );
    expect(screen.getByTestId("blog-post-dek").textContent).toBe(article.description);
    // No recommendation configured → no recommendation cards at all.
    expect(screen.queryByTestId("blog-recommendation-sidebar")).toBeNull();
    expect(screen.queryByTestId("blog-recommendation-inline")).toBeNull();
    // Legacy fallback still shows a working intro CTA.
    expect(screen.getByTestId("blog-post-cta-intro")).toBeTruthy();
  });
});

describe("BlogPost — corporate gifting in Lebanon", () => {
  beforeEach(() => {
    mockSlug = "corporate-gifting-lebanon";
  });

  it("renders the exact English title, corporate meta description, and canonical product link", () => {
    renderWithProviders(<BlogPost />);

    expect(screen.getByTestId("blog-post-title").textContent).toBe(
      "Corporate Gifting in Lebanon: Ordering Online for Teams, Clients, and Colleagues",
    );
    expect(document.title).toBe(
      "Corporate Gifting in Lebanon | Presentail",
    );
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toMatch(
      /corporate and office gifts online in Lebanon/i,
    );

    const vrieseaLink = screen.getByText("Vriesea").closest("a");
    expect(vrieseaLink?.getAttribute("href")).toBe(
      "https://presentail.com/en-lb/beirut/product/vriesea",
    );
    expect(screen.getByText("Desk plants").tagName).toBe("STRONG");
  });
});

describe("BlogPost — shared-link preview metadata", () => {
  it("emits og:image / og:image:width / og:image:height meta tags", () => {
    renderWithProviders(<BlogPost />);

    const ogImage = document.head.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    const ogWidth = document.head.querySelector<HTMLMetaElement>(
      'meta[property="og:image:width"]',
    );
    const ogHeight = document.head.querySelector<HTMLMetaElement>(
      'meta[property="og:image:height"]',
    );

    expect(ogImage).toBeTruthy();
    expect(ogImage!.getAttribute("content")).toContain(ARTICLE.ogImage!.url);
    expect(ogWidth?.getAttribute("content")).toBe(String(ARTICLE.ogImage!.width));
    expect(ogHeight?.getAttribute("content")).toBe(String(ARTICLE.ogImage!.height));
  });

  it("emits the JSON-LD Article schema with an image field", () => {
    renderWithProviders(<BlogPost />);

    const schema = document.getElementById("blog-post-schema");
    expect(schema).toBeTruthy();

    const json = JSON.parse(schema!.textContent ?? "{}");
    expect(json["@type"]).toBe("Article");
    expect(typeof json.image).toBe("string");
    expect(json.image).toContain(ARTICLE.ogImage!.url);
    expect(json.dateModified).toBe(ARTICLE.dateModified ?? ARTICLE.datePublished);
  });
});

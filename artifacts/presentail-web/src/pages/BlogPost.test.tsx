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
  });
});

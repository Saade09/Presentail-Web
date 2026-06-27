// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { BLOG_POSTS } from "@workspace/blog-content";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the component is imported.
// ---------------------------------------------------------------------------

vi.mock("wouter", () => ({
  Link: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
    <a {...rest}>{children}</a>
  ),
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER all vi.mock() declarations.
// ---------------------------------------------------------------------------

import Blog from "./Blog";

const SLUG_WITH_IMAGE = Object.keys(BLOG_POSTS).find(
  (slug) => BLOG_POSTS[slug].en?.ogImage,
)!;
const ARTICLE = BLOG_POSTS[SLUG_WITH_IMAGE].en;

describe("Blog index — story card thumbnail", () => {
  it("renders a thumbnail <img> for an article that ships an ogImage", () => {
    expect(ARTICLE.ogImage).toBeTruthy();
    renderWithProviders(<Blog />);

    const thumbs = screen.getAllByTestId("blog-story-card-image") as HTMLImageElement[];
    expect(thumbs.length).toBeGreaterThan(0);

    const match = thumbs.find((img) => img.getAttribute("src") === ARTICLE.ogImage!.url);
    expect(match).toBeTruthy();
    expect(match!.getAttribute("width")).toBe(String(ARTICLE.ogImage!.width));
    expect(match!.getAttribute("height")).toBe(String(ARTICLE.ogImage!.height));
  });
});

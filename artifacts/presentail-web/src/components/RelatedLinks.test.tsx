// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RelatedLinks } from "./RelatedLinks";
import type { InternalLinkSuggestion } from "@/lib/internalLinks";

const SAMPLE_LINKS: InternalLinkSuggestion[] = [
  { href: "/en-lb/beirut/category/flower-boxes", anchorText: "Flower Boxes" },
  { href: "/en-lb/beirut/occasion/birthday", anchorText: "Birthday" },
  { href: "/en-lb/beirut/", anchorText: "flower delivery in Beirut" },
];

describe("RelatedLinks", () => {
  beforeAll(() => {
    // Simulate post-hydration so the mount guard renders the component.
    vi.useFakeTimers();
  });

  it("renders nothing when links array is empty", () => {
    const { container } = render(<RelatedLinks links={[]} lang="en" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an <a> for each link after hydration", async () => {
    const { container } = render(
      <RelatedLinks links={SAMPLE_LINKS} lang="en" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBe(SAMPLE_LINKS.length);
    SAMPLE_LINKS.forEach((link, i) => {
      expect(anchors[i].getAttribute("href")).toBe(link.href);
      expect(anchors[i].textContent).toBe(link.anchorText);
    });
  });

  it("sets data-testid='related-links' on the root element after hydration", async () => {
    const { container } = render(
      <RelatedLinks links={SAMPLE_LINKS} lang="en" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("[data-testid='related-links']")).not.toBeNull();
  });

  it("uses Arabic heading for lang='ar'", async () => {
    const { container } = render(
      <RelatedLinks links={SAMPLE_LINKS} lang="ar" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("قد يعجبك");
  });

  it("uses French heading for lang='fr'", async () => {
    const { container } = render(
      <RelatedLinks links={SAMPLE_LINKS} lang="fr" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Vous aimerez");
  });

  it("no link has rel=nofollow", async () => {
    const { container } = render(
      <RelatedLinks links={SAMPLE_LINKS} lang="en" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const anchors = container.querySelectorAll("a[rel='nofollow']");
    expect(anchors.length).toBe(0);
  });
});

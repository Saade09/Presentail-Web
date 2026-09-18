// @vitest-environment jsdom

import { lazy } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlogArticleLoadingBoundary } from "./BlogArticleLoadingBoundary";

afterEach(cleanup);

function deferredModule(testId: string, content: string) {
  let resolve!: () => void;
  const promise = new Promise<{ default: () => React.JSX.Element }>((done) => {
    resolve = () =>
      done({
        default: () => <div data-testid={testId}>{content}</div>,
      });
  });
  return { Component: lazy(() => promise), resolve };
}

describe("BlogArticleLoadingBoundary", () => {
  for (const route of [
    "/en/blog/inside-spring-sourcing-trip",
    "/ar/blog/inside-spring-sourcing-trip",
    "/fr/blog/inside-spring-sourcing-trip",
    "/el/blog/inside-spring-sourcing-trip",
  ]) {
    it(`keeps the independently loaded footer unmounted while ${route} is pending`, async () => {
      const articleModule = deferredModule("loaded-article", "Loaded article");
      const footerModule = deferredModule("footer", "Footer");
      const LazyArticle = articleModule.Component;
      const LazyFooter = footerModule.Component;
      document.documentElement.dir = route.startsWith("/ar/") ? "rtl" : "ltr";

      render(
        <div className="min-h-screen flex flex-col" data-route={route}>
          <BlogArticleLoadingBoundary
            article={
              <main data-testid="article">
                <LazyArticle />
              </main>
            }
            footer={
              <footer>
                <LazyFooter />
              </footer>
            }
          />
        </div>,
      );

      const loading = screen.getByTestId("blog-article-loading");
      expect(loading.getAttribute("aria-busy")).toBe("true");
      expect(loading.className).toContain("flex-1");
      expect(screen.queryByTestId("footer")).toBeNull();

      footerModule.resolve();
      await Promise.resolve();
      expect(screen.queryByTestId("footer")).toBeNull();
      expect(screen.getByTestId("blog-article-loading")).toBeTruthy();

      articleModule.resolve();

      expect(await screen.findByTestId("loaded-article")).toBeTruthy();
      const article = screen.getByTestId("article");
      const footer = screen.getByTestId("footer");
      expect(
        article.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  }
});
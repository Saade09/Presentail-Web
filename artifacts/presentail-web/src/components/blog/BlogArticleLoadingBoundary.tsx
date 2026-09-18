import { Suspense, type ReactNode } from "react";

export function BlogArticleLoadingPlaceholder() {
  return (
    <main
      className="flex-1 bg-[hsl(42,38%,97%)]"
      aria-busy="true"
      data-testid="blog-article-loading"
    >
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div
          className="min-h-[calc(100svh-8rem)] animate-pulse motion-reduce:animate-none"
          aria-hidden="true"
        >
          <div className="mb-5 h-4 w-36 rounded bg-primary/10" />
          <div className="mb-4 h-10 w-11/12 rounded bg-primary/10 md:h-14" />
          <div className="mb-8 h-6 w-3/4 rounded bg-primary/10" />
          <div className="aspect-[16/9] w-full rounded-lg bg-primary/10" />
        </div>
      </div>
    </main>
  );
}

/**
 * The article route and footer share one suspense boundary so the footer can
 * never mount in the unresolved article area. Errors are handled by the route
 * boundary passed as `article`, allowing the footer to render after a failure.
 */
export function BlogArticleLoadingBoundary({
  article,
  footer,
}: {
  article: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Suspense fallback={<BlogArticleLoadingPlaceholder />}>
      {article}
      {footer}
    </Suspense>
  );
}
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { trackWebEvent } from "@/lib/analytics";

export type TocEntry = { id: string; label: string };

type Props = {
  entries: TocEntry[];
  /** Localized "IN THIS GUIDE" heading. */
  heading: string;
  articleSlug: string;
  locale: string;
  /** "sidebar" (desktop rail) or "disclosure" (mobile accordion). */
  variant: "sidebar" | "disclosure";
};

function track(articleSlug: string, locale: string, sectionId: string, placement: string) {
  trackWebEvent({
    type: "blog_toc_click",
    properties: { article_slug: articleSlug, locale, section_id: sectionId, placement },
  });
}

/**
 * "IN THIS GUIDE" table of contents built from the article's H2 sections.
 * Anchor targets carry `scroll-mt-*` so headings clear the sticky header.
 */
export function BlogToc({ entries, heading, articleSlug, locale, variant }: Props) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  const list = (placement: string) => (
    <ul className="space-y-2.5">
      {entries.map((e) => (
        <li key={e.id}>
          <a
            href={`#${e.id}`}
            onClick={() => track(articleSlug, locale, e.id, placement)}
            className="block text-sm leading-snug text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors"
            data-testid={`blog-toc-link-${e.id}`}
          >
            {e.label}
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === "sidebar") {
    return (
      <nav aria-label={heading} data-testid="blog-toc-sidebar">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70 mb-4">
          {heading}
        </p>
        {list("toc_sidebar")}
      </nav>
    );
  }

  return (
    <nav
      aria-label={heading}
      className="rounded-lg border border-border/70 bg-card/60"
      data-testid="blog-toc-disclosure"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-11 items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        data-testid="blog-toc-toggle"
      >
        {heading}
        <ChevronDown
          className={`w-4 h-4 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="px-4 pb-4">{list("toc_disclosure")}</div>}
    </nav>
  );
}

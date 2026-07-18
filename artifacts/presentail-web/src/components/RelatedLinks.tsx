import { useEffect, useState } from "react";
import { Link } from "wouter";
import type { InternalLinkSuggestion } from "@/lib/internalLinks";
import { YOU_MIGHT_ALSO_LIKE } from "@/lib/internalLinks";

interface RelatedLinksProps {
  links: InternalLinkSuggestion[];
  lang: string;
}

export function RelatedLinks({ links, lang }: RelatedLinksProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || links.length === 0) return null;

  const heading = YOU_MIGHT_ALSO_LIKE[lang] ?? YOU_MIGHT_ALSO_LIKE.en;

  return (
    <section
      aria-label={heading}
      className="mx-auto max-w-5xl px-4 py-6 border-t border-border"
      data-testid="related-links"
    >
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase mb-3">
        {heading}
      </h2>
      <nav aria-label={heading}>
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                rel={link.rel}
                className="inline-block rounded-full border border-border px-3 py-1 text-sm text-foreground hover:bg-accent transition-colors"
              >
                {link.anchorText}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

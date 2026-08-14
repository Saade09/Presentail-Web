import { useEffect, useRef } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { trackWebEvent } from "@/lib/analytics";
import { buildMarketHref } from "./blogShared";
import type { Language } from "@/contexts/LocaleContext";

export type BlogRecommendation = {
  title: string;
  body?: string;
  label: string;
  path: string;
  country?: string;
  image?: { url: string; width: number; height: number; alt?: string };
};

type Props = {
  recommendation: BlogRecommendation;
  language: Language;
  articleSlug: string;
  /** Where the card is rendered: "sidebar" (desktop rail) or "inline". */
  placement: "sidebar" | "inline";
};

/**
 * Compact, visually secondary product/collection recommendation card.
 * Purely config-driven (no product data is fetched), so it can never render
 * an empty state — when no recommendation is configured the caller renders
 * nothing at all. Fires one impression event when it first becomes visible
 * and one click event per interaction.
 */
export function BlogRecommendationCard({ recommendation, language, articleSlug, placement }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const impressionFired = useRef(false);

  useEffect(() => {
    impressionFired.current = false;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (impressionFired.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          impressionFired.current = true;
          trackWebEvent({
            type: "blog_recommendation_impression",
            properties: { article_slug: articleSlug, locale: language, placement },
          });
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [articleSlug, language, placement]);

  const href = buildMarketHref(language, recommendation.path, recommendation.country);
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div
      ref={ref}
      className="rounded-lg border border-border/70 bg-card p-4"
      data-testid={`blog-recommendation-${placement}`}
    >
      {recommendation.image && (
        <img
          src={recommendation.image.url}
          width={recommendation.image.width}
          height={recommendation.image.height}
          alt={recommendation.image.alt ?? recommendation.title}
          loading="lazy"
          decoding="async"
          className="w-full h-auto rounded-md object-cover mb-3"
        />
      )}
      <p className="font-serif text-base leading-snug mb-1">{recommendation.title}</p>
      {recommendation.body && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-2">{recommendation.body}</p>
      )}
      <a
        href={href}
        onClick={() =>
          trackWebEvent({
            type: "blog_recommendation_click",
            properties: { article_slug: articleSlug, locale: language, placement },
          })
        }
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        data-testid="blog-recommendation-link"
      >
        {recommendation.label}
        <Arrow className="w-4 h-4" aria-hidden="true" />
      </a>
    </div>
  );
}

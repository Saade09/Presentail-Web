import { useEffect } from "react";
import type { ReactNode } from "react";
import { Link, useParams, Redirect } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@workspace/blog-content";
import { buildSrcSet } from "@/lib/imageUtils";
import { BLOG_HERO_VARIANT_WIDTHS } from "../../blog-hero-variants.config.mjs";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import {
  buildBlogArticleJsonLd,
  BLOG_OG_FALLBACK_IMAGE_PATH,
} from "../../blog-article-schema.mjs";

type FaqItem = { q: string; a: string };

type Section = {
  heading?: string;
  body?: string;
  items?: string[];
  faqItems?: FaqItem[];
};

type OgImage = {
  url: string;
  width: number;
  height: number;
};

type Article = {
  slug: string;
  eyebrow: string;
  title: string;
  /** Visible H1. Falls back to `title` when absent. */
  h1?: string;
  description: string;
  datePublished: string;
  ogImage?: OgImage;
  /** Alt text for the hero image. Falls back to `title` when absent. */
  ogImageAlt?: string;
  sections: Section[];
  ctaHref?: string;
  ctaLabel?: string;
  extraJsonLd?: object[];
};

const ARTICLES = BLOG_POSTS as Record<string, Record<Language, Article>>;

type UiCopy = {
  backToJournal: string;
  shopCta: string;
  blogNav: string;
  relatedArticles: string;
};

const UI_COPY: Record<Language, UiCopy> = {
  en: { backToJournal: "Back to the Journal", shopCta: "Shop the collection", blogNav: "Blog", relatedArticles: "Related Articles" },
  ar: { backToJournal: "العودة إلى اليوميّات", shopCta: "تسوّق المجموعة", blogNav: "المدوّنة", relatedArticles: "مقالات ذات صلة" },
  fr: { backToJournal: "Retour au Journal", shopCta: "Voir la collection", blogNav: "Blog", relatedArticles: "Articles similaires" },
};

/**
 * Render a section body string, converting simple `<a href="...">text</a>` anchors
 * into real clickable links. Only `<a>` tags with a href attribute are parsed —
 * no other HTML is supported — so there is no XSS risk from other markup.
 * All content is author-controlled (lives in blogPostsCopy.js, not user input).
 */
function renderBody(body: string): ReactNode {
  // Split on <a href="...">...</a> patterns only.
  const TOKEN_RE = /(<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const href = match[2];
    const text = match[3];
    // Only accept strictly relative paths (single leading slash) — rejects
    // javascript:, data:, and protocol-relative //host URLs.
    if (!/^\/[^/]/.test(href)) {
      parts.push(body.slice(match.index, match.index + match[0].length));
      lastIndex = match.index + match[0].length;
      continue;
    }
    parts.push(
      <Link key={match.index} href={href} className="text-primary underline hover:no-underline">
        {text}
      </Link>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

function formatDate(iso: string, language: Language): string {
  try {
    const locale = language === "ar" ? "ar-LB" : language === "fr" ? "fr-FR" : "en-GB";
    return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const { language, t } = useLocale();

  const articlesByLang = ARTICLES[slug];
  const article = articlesByLang?.[language] ?? articlesByLang?.["en"];
  const ui = UI_COPY[language] ?? UI_COPY.en;

  useEffect(() => {
    if (!article) return;
    // When an article has a separate H1 field the `title` is already the
    // complete meta title (e.g. "Flower Shop in Achrafieh | Presentail's
    // Beirut Boutique") and must NOT have "| Presentail" appended again.
    const title = article.h1 ? article.title : `${article.title} | Presentail`;
    document.title = title;

    const upsertMeta = (selector: string, attr: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${selector}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, selector);
        el.setAttribute("data-seo-blog", "true");
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    upsertMeta("description", "name", article.description);
    upsertMeta("og:title", "property", title);
    upsertMeta("og:description", "property", article.description);
    upsertMeta("og:type", "property", "article");
    upsertMeta("article:published_time", "property", article.datePublished);
    if (article.ogImage) {
      const absolute = typeof window !== "undefined"
        ? new URL(article.ogImage.url, window.location.origin).href
        : `https://presentail.com${article.ogImage.url}`;
      upsertMeta("og:image", "property", absolute);
      upsertMeta("og:image:width", "property", String(article.ogImage.width));
      upsertMeta("og:image:height", "property", String(article.ogImage.height));
    }

    const schemaId = "blog-post-schema";
    let schema = document.getElementById(schemaId);
    if (!schema) {
      schema = document.createElement("script");
      schema.setAttribute("type", "application/ld+json");
      schema.id = schemaId;
      document.head.appendChild(schema);
    }
    // Resolve the article image to an absolute URL; fall back to the site-wide
    // OG image (BLOG_OG_FALLBACK_IMAGE_PATH) so `image` is always present —
    // Google rejects Article rich results that omit it.
    const imageUrl = article.ogImage
      ? new URL(article.ogImage.url, window.location.origin).href
      : new URL(BLOG_OG_FALLBACK_IMAGE_PATH, window.location.origin).href;
    // Use buildBlogArticleJsonLd — the shared builder from blog-article-schema.mjs
    // that seo-inject.mjs also calls, so server-rendered and JS-patched schemas
    // can never silently diverge.
    schema.textContent = JSON.stringify(
      buildBlogArticleJsonLd({
        headline: article.title.trim(),
        description: article.description,
        datePublished: article.datePublished,
        image: imageUrl,
        publisherUrl: window.location.origin,
        url: window.location.href,
      }),
    );

    // Emit any article-specific extra JSON-LD schemas (e.g. LocalBusiness, FAQPage).
    (article.extraJsonLd ?? []).forEach((schemaObj, idx) => {
      const extraId = `blog-post-schema-extra-${idx}`;
      let extraEl = document.getElementById(extraId);
      if (!extraEl) {
        extraEl = document.createElement("script");
        extraEl.setAttribute("type", "application/ld+json");
        extraEl.id = extraId;
        document.head.appendChild(extraEl);
      }
      extraEl.textContent = JSON.stringify(schemaObj);
    });

    return () => {
      document.head.querySelectorAll("[data-seo-blog]").forEach((el) => el.remove());
      document.getElementById(schemaId)?.remove();
      (article.extraJsonLd ?? []).forEach((_, idx) => {
        document.getElementById(`blog-post-schema-extra-${idx}`)?.remove();
      });
    };
  }, [article]);

  if (!articlesByLang) {
    return <Redirect to="/blog" replace />;
  }

  if (!article) return null;

  // Related articles — up to 3 other posts in the same language (falling back
  // to English when no translation exists), sorted newest-first.
  const relatedPosts = Object.entries(ARTICLES)
    .filter(([s]) => s !== slug)
    .map(([s, byLang]) => {
      const post = byLang?.[language] ?? byLang?.["en"];
      return post ? { slug: s, post } : null;
    })
    .filter((item): item is { slug: string; post: Article } => item !== null)
    .sort((a, b) =>
      (b.post.datePublished ?? "") > (a.post.datePublished ?? "") ? 1 : -1,
    )
    .slice(0, 3);

  const isRtl = language === "ar";
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div
      className="bg-background"
      data-testid="blog-post-page"
      lang={language}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="container mx-auto px-4 pt-10 pb-4 max-w-3xl">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: ui.blogNav, href: "/blog" }, { label: article.title }]} />
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
          <BackArrow className="w-3.5 h-3.5" />
          {ui.backToJournal}
        </Link>
      </div>

      <article className="container mx-auto px-4 pb-16 max-w-3xl" itemScope itemType="https://schema.org/Article">
        {article.ogImage && (
          <div className="mb-10 overflow-hidden rounded-lg">
            <img
              src={article.ogImage.url}
              srcSet={buildSrcSet(
                article.ogImage.url,
                [Math.max(...BLOG_HERO_VARIANT_WIDTHS)],
                article.ogImage.width,
              )}
              sizes="(min-width: 768px) 768px, 100vw"
              width={article.ogImage.width}
              height={article.ogImage.height}
              alt={article.ogImageAlt ?? article.title}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full h-auto object-cover"
              itemProp="image"
              data-testid="blog-post-hero-image"
            />
          </div>
        )}
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
            {article.eyebrow}
          </p>
          <h1
            className="text-4xl md:text-5xl font-serif leading-tight mb-6"
            data-testid="blog-post-title"
            itemProp="headline"
          >
            {article.h1 ?? article.title}
          </h1>
          <p className="text-sm text-muted-foreground" itemProp="datePublished" content={article.datePublished}>
            {formatDate(article.datePublished, language)}
          </p>
        </header>

        <div className="prose prose-neutral max-w-none" itemProp="articleBody">
          {article.sections.map((section, i) => (
            <div key={i} className="mb-8">
              {section.heading && (
                <h2 className="font-serif text-2xl mb-3">{section.heading}</h2>
              )}
              {section.body && (
                <p className="text-base text-foreground leading-relaxed">{renderBody(section.body)}</p>
              )}
              {section.items && section.items.length > 0 && (
                <ul className={`list-disc space-y-1 text-base text-foreground leading-relaxed ${isRtl ? "list-inside text-right" : "list-inside"}`}>
                  {section.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              )}
              {section.faqItems && section.faqItems.length > 0 && (
                <dl className="space-y-4">
                  {section.faqItems.map((faq, j) => (
                    <div key={j}>
                      <dt className="font-semibold text-foreground">{faq.q}</dt>
                      <dd className="text-base text-muted-foreground leading-relaxed mt-1">{faq.a}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </article>

      {relatedPosts.length > 0 && (
        <section
          className="container mx-auto px-4 pb-12 max-w-3xl"
          data-testid="blog-post-related-articles"
        >
          <h2 className="font-serif text-2xl mb-6">{ui.relatedArticles}</h2>
          <ul className="divide-y divide-border" role="list">
            {relatedPosts.map(({ slug: relSlug, post: relPost }) => (
              <li key={relSlug} className="py-4 first:pt-0">
                {/* Use a native <a> so the canonical /{lang}/blog/:slug href is
                    used exactly as-is, bypassing any city-scoped router base. */}
                <a
                  href={`/${language}/blog/${relSlug}`}
                  className="group block"
                  data-testid={`related-article-${relSlug}`}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-1">
                    {relPost.eyebrow}
                  </p>
                  <p className="font-serif text-lg group-hover:text-primary transition-colors leading-snug">
                    {relPost.h1 ?? relPost.title}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-3xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 text-center">
          <Link href={article.ctaHref ?? "/shop"}>
            <Button variant="secondary" data-testid="blog-post-cta-shop">
              {article.ctaLabel ?? ui.shopCta}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

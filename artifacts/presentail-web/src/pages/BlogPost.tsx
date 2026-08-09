import { useEffect } from "react";
import { Link, useParams, Redirect } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { BLOG_POSTS } from "@workspace/blog-content";
import { buildSrcSet } from "@/lib/imageUtils";
import { BLOG_HERO_VARIANT_WIDTHS } from "../../blog-hero-variants.config.mjs";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import {
  buildBlogArticleJsonLd,
  BLOG_OG_FALLBACK_IMAGE_PATH,
} from "../../blog-article-schema.mjs";

type Section = {
  heading?: string;
  body: string;
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
  description: string;
  datePublished: string;
  ogImage?: OgImage;
  sections: Section[];
  ctaHref?: string;
  ctaLabel?: string;
};

const ARTICLES = BLOG_POSTS as Record<string, Record<Language, Article>>;

type UiCopy = {
  backToJournal: string;
  shopCta: string;
  blogNav: string;
};

const UI_COPY: Record<Language, UiCopy> = {
  en: { backToJournal: "Back to the Journal", shopCta: "Shop the collection", blogNav: "Blog" },
  ar: { backToJournal: "العودة إلى اليوميّات", shopCta: "تسوّق المجموعة", blogNav: "المدوّنة" },
  fr: { backToJournal: "Retour au Journal", shopCta: "Voir la collection", blogNav: "Blog" },
};

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
    const title = `${article.title} | Presentail`;
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

    return () => {
      document.head.querySelectorAll("[data-seo-blog]").forEach((el) => el.remove());
      document.getElementById(schemaId)?.remove();
    };
  }, [article]);

  if (!articlesByLang) {
    return <Redirect to="/blog" replace />;
  }

  if (!article) return null;

  return (
    <div className="bg-background" data-testid="blog-post-page" lang={language}>
      <div className="container mx-auto px-4 pt-10 pb-4 max-w-3xl">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: ui.blogNav, href: "/blog" }, { label: article.title }]} />
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2">
          <ArrowLeft className="w-3.5 h-3.5" />
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
              alt={article.title}
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
            {article.title}
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
              <p className="text-base text-foreground leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>
      </article>

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

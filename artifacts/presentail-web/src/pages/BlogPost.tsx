import { useEffect } from "react";
import { Link, useParams, Redirect } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { BLOG_POSTS } from "@workspace/blog-content";

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
};

const ARTICLES = BLOG_POSTS as Record<string, Record<Language, Article>>;

type UiCopy = {
  backToJournal: string;
  shopCta: string;
};

const UI_COPY: Record<Language, UiCopy> = {
  en: { backToJournal: "Back to the Journal", shopCta: "Shop the collection" },
  ar: { backToJournal: "العودة إلى اليوميّات", shopCta: "تسوّق المجموعة" },
  fr: { backToJournal: "Retour au Journal", shopCta: "Voir la collection" },
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
  const { language } = useLocale();

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
        : `https://new.presentail.com${article.ogImage.url}`;
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
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description,
      datePublished: article.datePublished,
      ...(article.ogImage
        ? {
            image:
              typeof window !== "undefined"
                ? new URL(article.ogImage.url, window.location.origin).href
                : `https://new.presentail.com${article.ogImage.url}`,
          }
        : {}),
      publisher: {
        "@type": "Organization",
        name: "Presentail",
        url: "https://new.presentail.com",
      },
      url: typeof window !== "undefined" ? window.location.href : `https://new.presentail.com/blog/${article.slug}`,
    });

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
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          {ui.backToJournal}
        </Link>
      </div>

      <article className="container mx-auto px-4 pb-16 max-w-3xl" itemScope itemType="https://schema.org/Article">
        {article.ogImage && (
          <div className="mb-10 overflow-hidden rounded-lg">
            <img
              src={article.ogImage.url}
              width={article.ogImage.width}
              height={article.ogImage.height}
              alt={article.title}
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
          <Link href="/shop">
            <Button variant="secondary" data-testid="blog-post-cta-shop">
              {ui.shopCta}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

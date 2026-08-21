import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { Link, useParams, Redirect } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Clock, Info, Truck } from "lucide-react";
import {
  BLOG_POSTS,
  BLOG_RELATED_SLUGS,
  getBlogPostMeta,
  getBlogPostReadingTime,
  type BlogPostContent,
  type BlogSection,
  type BlogCategory,
} from "@workspace/blog-content";
import { buildSrcSet } from "@/lib/imageUtils";
import { BLOG_HERO_VARIANT_WIDTHS } from "../../blog-hero-variants.config.mjs";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import {
  buildBlogArticleJsonLd,
  BLOG_OG_FALLBACK_IMAGE_PATH,
} from "../../blog-article-schema.mjs";
import { trackWebEvent } from "@/lib/analytics";
import { BlogShareButton } from "@/components/blog/BlogShareButton";
import { BlogToc, type TocEntry } from "@/components/blog/BlogToc";
import { BlogFaqAccordion } from "@/components/blog/BlogFaqAccordion";
import { BlogRecommendationCard } from "@/components/blog/BlogRecommendationCard";
import { buildMarketHref, sectionAnchorId } from "@/components/blog/blogShared";

type Article = BlogPostContent;

const ARTICLES = BLOG_POSTS as Record<string, Record<Language, Article>>;

/** Show the TOC automatically once an article has this many H2 sections. */
const TOC_MIN_SECTIONS = 3;

type UiCopy = {
  backToJournal: string;
  shopCta: string;
  blogNav: string;
  relatedArticles: string;
  inThisGuide: string;
  share: string;
  linkCopied: string;
  updated: string;
  minRead: string; // template with {min}
  categories: Record<BlogCategory, string>;
};

const UI_COPY: Record<Language, UiCopy> = {
  en: {
    backToJournal: "Back to the Journal",
    shopCta: "Shop the collection",
    blogNav: "Journal",
    relatedArticles: "Related Articles",
    inThisGuide: "In this guide",
    share: "Share",
    linkCopied: "Link copied",
    updated: "Updated",
    minRead: "{min} min read",
    categories: {
      flowers: "Flowers",
      "gifting-guides": "Gifting Guides",
      "behind-the-scenes": "Behind the Scenes",
      makers: "Makers",
    },
  },
  ar: {
    backToJournal: "العودة إلى اليوميّات",
    shopCta: "تسوّق المجموعة",
    blogNav: "المدوّنة",
    relatedArticles: "مقالات ذات صلة",
    inThisGuide: "في هذا الدليل",
    share: "مشاركة",
    linkCopied: "تم نسخ الرابط",
    updated: "آخر تحديث",
    minRead: "{min} دقائق قراءة",
    categories: {
      flowers: "الأزهار",
      "gifting-guides": "أدلّة الإهداء",
      "behind-the-scenes": "خلف الكواليس",
      makers: "الصنّاع",
    },
  },
  fr: {
    backToJournal: "Retour au Journal",
    shopCta: "Voir la collection",
    blogNav: "Journal",
    relatedArticles: "Articles similaires",
    inThisGuide: "Dans ce guide",
    share: "Partager",
    linkCopied: "Lien copié",
    updated: "Mis à jour",
    minRead: "{min} min de lecture",
    categories: {
      flowers: "Fleurs",
      "gifting-guides": "Guides cadeaux",
      "behind-the-scenes": "Coulisses",
      makers: "Artisans",
    },
  },
  el: {
    backToJournal: "Επιστροφή στο Ημερολόγιο",
    shopCta: "Δείτε τη συλλογή",
    blogNav: "Ημερολόγιο",
    relatedArticles: "Σχετικά άρθρα",
    inThisGuide: "Σε αυτόν τον οδηγό",
    share: "Κοινοποίηση",
    linkCopied: "Ο σύνδεσμος αντιγράφηκε",
    updated: "Ενημερώθηκε",
    minRead: "{min} λεπτά ανάγνωσης",
    categories: {
      flowers: "Άνθη",
      "gifting-guides": "Οδηγοί δώρων",
      "behind-the-scenes": "Παρασκήνια",
      makers: "Δημιουργοί",
    },
  },
};

/**
 * Render a section body string, converting simple anchors and strong tags into
 * real elements. Only controlled Presentail URLs (or relative paths) are
 * accepted, so editorial copy can retain canonical absolute URLs without
 * opening an arbitrary-link injection path.
 * All content is author-controlled (lives in blogPostsCopy.js, not user input).
 */
function renderBody(body: string): ReactNode {
  const TOKEN_RE = /(<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>|<strong>(.*?)<\/strong>)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const href = match[2];
    const text = match[3];
    const strongText = match[4];

    if (strongText !== undefined) {
      parts.push(<strong key={match.index}>{renderBody(strongText)}</strong>);
      lastIndex = match.index + match[0].length;
      continue;
    }

    // Only accept strictly relative paths or canonical Presentail URLs —
    // rejects javascript:, data:, and protocol-relative //host URLs.
    const isRelativePath = /^\/[^/]/.test(href);
    const isCanonicalPresentailUrl = /^https:\/\/presentail\.com\/[^/]/.test(href);
    if (!isRelativePath && !isCanonicalPresentailUrl) {
      parts.push(body.slice(match.index, match.index + match[0].length));
      lastIndex = match.index + match[0].length;
      continue;
    }
    parts.push(
      isRelativePath ? (
        <Link key={match.index} href={href} className="text-primary underline hover:no-underline">
          {text}
        </Link>
      ) : (
        <a key={match.index} href={href} className="text-primary underline hover:no-underline">
          {text}
        </a>
      ),
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

/** Body paragraph / list typography — 18px, 1.7 line height, charcoal. */
const PROSE_TEXT = "text-[17px] md:text-lg leading-[1.7] text-foreground/90";

function SectionBlocks({
  section,
  index,
  isRtl,
}: {
  section: BlogSection;
  index: number;
  isRtl: boolean;
}) {
  const HeadingTag = section.subheading ? "h3" : "h2";
  const id = section.heading && !section.subheading
    ? sectionAnchorId(section.heading, section.id, index)
    : undefined;
  const ListTag = section.ordered ? "ol" : "ul";
  return (
    <section className="mb-10">
      {section.heading && (
        <HeadingTag
          id={id}
          className={`font-serif scroll-mt-28 ${section.subheading ? "text-xl md:text-2xl mb-3" : "text-2xl md:text-[1.75rem] mb-4"}`}
        >
          {section.heading}
        </HeadingTag>
      )}
      {section.body && <p className={`${PROSE_TEXT} mb-4 last:mb-0`}>{renderBody(section.body)}</p>}
      {section.items && section.items.length > 0 && (
        <ListTag
          className={`${section.ordered ? "list-decimal" : "list-disc"} space-y-2 ${PROSE_TEXT} ${isRtl ? "list-inside text-right" : "ps-5"}`}
        >
          {section.items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ListTag>
      )}
      {section.pullQuote && (
        <blockquote
          className="my-8 border-s-2 border-primary/50 ps-5 font-serif text-xl md:text-2xl leading-relaxed text-foreground/90"
          data-testid="blog-pull-quote"
        >
          {section.pullQuote}
        </blockquote>
      )}
      {section.callout && (
        <div
          className={`mt-6 flex items-start gap-3 rounded-lg border p-4 md:p-5 ${
            section.callout.variant === "service"
              ? "border-[#D8E0D4] bg-[#EEF2EA]"
              : "border-border bg-card"
          }`}
          data-testid={`blog-callout-${section.callout.variant ?? "info"}`}
        >
          {section.callout.variant === "service" ? (
            <Truck className="mt-0.5 w-5 h-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 w-5 h-5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <div>
            {section.callout.title && (
              <p className="font-semibold text-foreground mb-0.5">{section.callout.title}</p>
            )}
            <p className="text-sm md:text-base leading-relaxed text-foreground/80">
              {section.callout.body}
            </p>
          </div>
        </div>
      )}
      {section.image && (
        <figure className="my-8">
          <img
            src={section.image.url}
            width={section.image.width}
            height={section.image.height}
            alt={section.image.alt ?? ""}
            loading="lazy"
            decoding="async"
            className="w-full h-auto rounded-lg object-cover"
          />
          {section.image.caption && (
            <figcaption className="mt-2 text-sm text-muted-foreground">
              {section.image.caption}
            </figcaption>
          )}
        </figure>
      )}
      {section.faqItems && section.faqItems.length > 0 && (
        <BlogFaqAccordion items={section.faqItems} />
      )}
    </section>
  );
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
        dateModified: article.dateModified,
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

  // Related articles — explicit overrides first, else up to 3 other posts in
  // the same language (falling back to English), sorted newest-first.
  const relatedPosts = useMemo(() => {
    if (!articlesByLang) return [];
    const resolve = (s: string) => {
      const byLang = ARTICLES[s];
      const post = byLang?.[language] ?? byLang?.["en"];
      return post ? { slug: s, post } : null;
    };
    const curatedSlugs = BLOG_RELATED_SLUGS[slug] ?? article?.relatedSlugs ?? [];
    const explicit = curatedSlugs
      .filter((s) => s !== slug)
      .map(resolve)
      .filter((item): item is { slug: string; post: Article } => item !== null);
    if (explicit.length > 0) return explicit.slice(0, 3);
    return Object.keys(ARTICLES)
      .filter((s) => s !== slug)
      .map(resolve)
      .filter((item): item is { slug: string; post: Article } => item !== null)
      .sort((a, b) =>
        (b.post.datePublished ?? "") > (a.post.datePublished ?? "") ? 1 : -1,
      )
      .slice(0, 3);
  }, [articlesByLang, article, language, slug]);

  if (!articlesByLang) {
    return <Redirect to="/blog" replace />;
  }

  if (!article) return null;

  const isRtl = language === "ar";
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  const meta = getBlogPostMeta(slug);
  // Blog article content exists only in EN/AR/FR; Greek falls back to English.
  const blogLang = language === "el" ? "en" : language;
  const readingTime = getBlogPostReadingTime(slug, blogLang);
  const categoryLabel = article.categoryLabel ?? ui.categories[meta.category];
  const geographyLabel = article.geographyLabel ?? article.eyebrow;
  const taxonomyLabel =
    geographyLabel && geographyLabel !== categoryLabel
      ? `${geographyLabel} · ${categoryLabel}`
      : categoryLabel;
  const displayDate = article.dateModified ?? article.datePublished;
  const dek = article.dek ?? article.description;

  // Primary CTA: locale-aware `cta` config first, legacy ctaHref/ctaLabel next,
  // shop fallback last. Native <a> for market-prefixed URLs (outside the blog
  // router base); wouter Link for router-relative legacy paths.
  const ctaLabel = article.cta?.label ?? article.ctaLabel ?? ui.shopCta;
  const ctaHref = article.cta
    ? buildMarketHref(language, article.cta.path, article.cta.country)
    : article.ctaHref ?? "/shop";
  // Treat as "external" (use native <a>, not wouter Link) when the href is:
  //   • built by buildMarketHref (article.cta present)
  //   • an absolute https:// URL
  //   • a full locale path starting with /{lang}-{country}/ (e.g. /en-lb/beirut/…)
  //     — legacy ctaHref values in this format are root-absolute and must bypass
  //     the blog shell's /{lang} router base, otherwise wouter prepends it and
  //     produces double-prefixed 404s like /en/en-lb/beirut/product/…
  const ctaIsExternalPath =
    Boolean(article.cta) ||
    /^https?:\/\//.test(ctaHref) ||
    /^\/[a-z]{2}-[a-z]{2}\//.test(ctaHref);

  const trackCta = (placement: string) =>
    trackWebEvent({
      type: "blog_cta_click",
      properties: { article_slug: slug, locale: language, placement },
    });

  const ctaButton = (placement: string, variant: "default" | "secondary" = "default") => {
    const button = (
      <Button variant={variant} onClick={() => trackCta(placement)} data-testid={`blog-post-cta-${placement}`}>
        {ctaLabel}
      </Button>
    );
    return ctaIsExternalPath ? (
      <a href={ctaHref}>{button}</a>
    ) : (
      <Link href={ctaHref}>{button}</Link>
    );
  };

  // Table of contents — H2 sections only; shown for long articles (or when the
  // article opts in/out explicitly via `toc`).
  const tocEntries: TocEntry[] = article.sections
    .map((s, i) =>
      s.heading && !s.subheading
        ? { id: sectionAnchorId(s.heading, s.id, i), label: s.heading }
        : null,
    )
    .filter((e): e is TocEntry => e !== null);
  const showToc = article.toc ?? tocEntries.length >= TOC_MIN_SECTIONS;

  const trackRelated = (relSlug: string) =>
    trackWebEvent({
      type: "blog_related_click",
      properties: { article_slug: slug, locale: language, related_slug: relSlug, placement: "related" },
    });

  return (
    <div
      className="bg-[#FAF7F1]"
      data-testid="blog-post-page"
      lang={language}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <article itemScope itemType="https://schema.org/Article">
        {/* ---- Intro: breadcrumb → taxonomy → H1 → dek → meta → CTA + share ---- */}
        <header className="container mx-auto px-4 pt-8 md:pt-10 max-w-6xl">
          <div className="max-w-3xl">
            <PageBreadcrumb
              crumbs={[
                { label: ui.blogNav, href: "/blog" },
                { label: categoryLabel, href: "/blog" },
                { label: geographyLabel },
              ]}
            />
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary mt-5 mb-3"
              data-testid="blog-post-taxonomy"
            >
              {taxonomyLabel}
            </p>
            <h1
              className="font-serif text-4xl md:text-5xl leading-[1.12] tracking-tight mb-4 max-w-[20ch]"
              data-testid="blog-post-title"
              itemProp="headline"
            >
              {article.h1 ?? article.title}
            </h1>
            <p className="text-lg md:text-xl leading-relaxed text-muted-foreground mb-4 max-w-[52ch]" data-testid="blog-post-dek">
              {dek}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mb-6">
              <span itemProp="datePublished" content={article.datePublished}>
                {ui.updated} {formatDate(displayDate, language)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {ui.minRead.replace("{min}", String(readingTime))}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3 pb-8">
              {ctaButton("intro")}
              <BlogShareButton
                articleSlug={slug}
                locale={language}
                title={article.h1 ?? article.title}
                label={ui.share}
                copiedLabel={ui.linkCopied}
              />
            </div>
          </div>
        </header>

        {/* ---- Restrained editorial hero ---- */}
        {article.ogImage && (
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="overflow-hidden rounded-lg aspect-[16/9] max-h-[520px] w-full">
              <img
                src={article.ogImage.url}
                srcSet={buildSrcSet(
                  article.ogImage.url,
                  BLOG_HERO_VARIANT_WIDTHS,
                  article.ogImage.width,
                )}
                sizes="(min-width: 1152px) 1120px, 100vw"
                width={article.ogImage.width}
                height={article.ogImage.height}
                alt={article.ogImageAlt ?? article.title}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="w-full h-full object-cover"
                style={article.heroFocal ? { objectPosition: article.heroFocal } : undefined}
                itemProp="image"
                data-testid="blog-post-hero-image"
              />
            </div>
          </div>
        )}

        {/* ---- Body grid: TOC rail · prose column · recommendation rail ---- */}
        <div className="container mx-auto px-4 pt-10 md:pt-12 pb-8 max-w-6xl">
          <div className="lg:grid lg:grid-cols-[11rem_minmax(0,46rem)_1fr] lg:gap-10 xl:gap-14">
            {/* TOC — sticky sidebar on desktop */}
            <div className="hidden lg:block">
              {showToc && (
                <div className="sticky top-28">
                  <BlogToc
                    entries={tocEntries}
                    heading={ui.inThisGuide}
                    articleSlug={slug}
                    locale={language}
                    variant="sidebar"
                  />
                </div>
              )}
            </div>

            {/* Prose column */}
            <div>
              {/* TOC — compact disclosure near the top on mobile/tablet */}
              {showToc && (
                <div className="lg:hidden mb-8">
                  <BlogToc
                    entries={tocEntries}
                    heading={ui.inThisGuide}
                    articleSlug={slug}
                    locale={language}
                    variant="disclosure"
                  />
                </div>
              )}
              {/* Inline recommendation on narrow viewports (sidebar hidden) */}
              {article.recommendation && (
                <div className="lg:hidden mb-8">
                  <BlogRecommendationCard
                    recommendation={article.recommendation}
                    language={language}
                    articleSlug={slug}
                    placement="inline"
                  />
                </div>
              )}
              <div itemProp="articleBody">
                {article.sections.map((section, i) => (
                  <SectionBlocks key={i} section={section} index={i} isRtl={isRtl} />
                ))}
              </div>

              {/* ---- Ending: final CTA + back to the Journal ---- */}
              <div className="mt-12 rounded-lg bg-primary text-primary-foreground p-8 text-center">
                {ctaButton("end", "secondary")}
              </div>
              <p className="mt-6">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="blog-post-back-to-journal"
                >
                  <BackArrow className="w-3.5 h-3.5" aria-hidden="true" />
                  {ui.backToJournal}
                </Link>
              </p>
            </div>

            {/* Optional commerce rail — desktop only */}
            <div className="hidden lg:block">
              {article.recommendation && (
                <aside className="sticky top-28 max-w-[17rem]">
                  <BlogRecommendationCard
                    recommendation={article.recommendation}
                    language={language}
                    articleSlug={slug}
                    placement="sidebar"
                  />
                </aside>
              )}
            </div>
          </div>
        </div>
      </article>

      {/* ---- Related stories ---- */}
      {relatedPosts.length > 0 && (
        <section
          className="container mx-auto px-4 pb-16 md:pb-20 max-w-6xl"
          data-testid="blog-post-related-articles"
        >
          <h2 className="font-serif text-2xl md:text-3xl mb-6">{ui.relatedArticles}</h2>
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
            {relatedPosts.map(({ slug: relSlug, post: relPost }) => (
              <li key={relSlug}>
                {/* Native <a> so the canonical /{lang}/blog/:slug href is used
                    exactly as-is, bypassing any city-scoped router base. */}
                <a
                  href={`/${language}/blog/${relSlug}`}
                  onClick={() => trackRelated(relSlug)}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card"
                  data-testid={`related-article-${relSlug}`}
                >
                  {relPost.ogImage && (
                    <div className="overflow-hidden aspect-[16/9]">
                      <img
                        src={relPost.ogImage.url}
                        srcSet={buildSrcSet(
                          relPost.ogImage.url,
                          BLOG_HERO_VARIANT_WIDTHS,
                          relPost.ogImage.width,
                        )}
                        sizes="(min-width: 1024px) 384px, (min-width: 768px) 50vw, 100vw"
                        width={relPost.ogImage.width}
                        height={relPost.ogImage.height}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]"
                      />
                    </div>
                  )}
                  <div className="p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
                      {relPost.eyebrow}
                    </p>
                    <p className="font-serif text-lg group-hover:text-primary transition-colors leading-snug">
                      {relPost.h1 ?? relPost.title}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

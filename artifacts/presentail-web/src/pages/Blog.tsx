import { Link } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { BLOG_POSTS } from "@workspace/blog-content";
import { buildSrcSet } from "@/lib/imageUtils";

type OgImage = {
  url: string;
  width: number;
  height: number;
};

type Story = {
  slug: string;
  eyebrow: string;
  title: string;
  excerpt: string;
  ogImage?: OgImage;
};

type Article = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  ogImage?: OgImage;
};

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  storiesHeading: string;
  ctaHeading: string;
  ctaBody: string;
  ctaShop: string;
  readArticle: string;
};

const ARTICLES = BLOG_POSTS as Record<string, Record<Language, Article>>;

// Story cards are derived from the shared blog source of truth so the index can
// never drift from the article pages or the server-side link previews.
function getStories(language: Language): Story[] {
  return Object.keys(ARTICLES).map((slug) => {
    const a = ARTICLES[slug][language] ?? ARTICLES[slug].en;
    return { slug, eyebrow: a.eyebrow, title: a.title, excerpt: a.description, ogImage: a.ogImage };
  });
}

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "The Atelier Journal",
    title: "Stories from the studio.",
    intro:
      "Notes on craft, the season's blooms, the makers we love, and the small details that turn a delivery into a moment.",
    storiesHeading: "Recent stories",
    ctaHeading: "Send something beautiful",
    ctaBody: "Browse the season's collection or pick from our best sellers.",
    ctaShop: "Shop the collection",
    readArticle: "Read article",
  },
  ar: {
    eyebrow: "يوميّات الأتيليه",
    title: "حكايات من الاستوديو.",
    intro:
      "ملاحظات عن الحرفة، وأزهار الموسم، والصنّاع الذين نحبّهم، والتفاصيل الصغيرة التي تحوّل التوصيل إلى لحظة.",
    storiesHeading: "أحدث الحكايات",
    ctaHeading: "أرسل شيئاً جميلاً",
    ctaBody: "تصفّح مجموعة الموسم أو اختر من أكثر منتجاتنا مبيعاً.",
    ctaShop: "تسوّق المجموعة",
    readArticle: "اقرأ المقالة",
  },
  fr: {
    eyebrow: "Le Journal de l'Atelier",
    title: "Histoires du studio.",
    intro:
      "Notes sur le savoir-faire, les fleurs de saison, les artisans que nous aimons, et les petits détails qui transforment une livraison en moment.",
    storiesHeading: "Histoires récentes",
    ctaHeading: "Envoyez quelque chose de beau",
    ctaBody:
      "Parcourez la collection de la saison ou choisissez parmi nos meilleures ventes.",
    ctaShop: "Voir la collection",
    readArticle: "Lire l'article",
  },
};

export default function Blog() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;
  const stories = getStories(language);

  return (
    <div className="bg-background" data-testid="blog-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="blog-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {c.intro}
        </p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.storiesHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {stories.map((s) => (
            <article
              key={s.slug}
              className="rounded-lg border border-border bg-card flex flex-col overflow-hidden"
              data-testid="blog-story-card"
            >
              <Link href={`/blog/${s.slug}`} className="flex flex-col flex-1 group">
                {s.ogImage && (
                  <div className="overflow-hidden aspect-[16/9]">
                    <img
                      src={s.ogImage.url}
                      srcSet={buildSrcSet(s.ogImage.url, [480, 768], s.ogImage.width)}
                      sizes="(min-width: 768px) 384px, 100vw"
                      width={s.ogImage.width}
                      height={s.ogImage.height}
                      alt={s.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      data-testid="blog-story-card-image"
                    />
                  </div>
                )}
                <div className="flex flex-col flex-1 p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  {s.eyebrow}
                </p>
                <h2 className="font-serif text-lg mb-3 group-hover:underline underline-offset-2">
                  {s.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  {s.excerpt}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  {c.readArticle}
                  <ArrowRight className="w-3 h-3" />
                </span>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.ctaHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.ctaBody}</p>
          <Link href="/shop">
            <Button variant="secondary" data-testid="blog-cta-shop">
              {c.ctaShop}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

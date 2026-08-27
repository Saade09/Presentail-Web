import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import {
  BLOG_POSTS,
  BLOG_CATEGORIES,
  getBlogPostMeta,
  getBlogPostReadingTime,
  getBlogPostExcerpt,
  getFeaturedBlogSlug,
  type BlogCategory,
  type BlogPostContent,
} from "@workspace/blog-content";
import { buildSrcSet } from "@/lib/imageUtils";
import { BLOG_HERO_VARIANT_WIDTHS } from "../../blog-hero-variants.config.mjs";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

type OgImage = {
  url: string;
  width: number;
  height: number;
};

type Story = {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  readingTime: number;
  datePublished: string;
  ogImage?: OgImage;
};

type Article = BlogPostContent;

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  storiesHeading: string;
  ctaHeading: string;
  ctaBody: string;
  ctaShop: string;
  readStory: string;
  allStories: string;
  minRead: string; // template with {min}
  categories: Record<BlogCategory, string>;
  noStories: string;
};

const ARTICLES = BLOG_POSTS as unknown as Record<string, Record<Language, Article>>;

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "The Atelier Journal",
    title: "Stories from the studio.",
    intro: "Notes on craft, seasonal blooms, and thoughtful gifting.",
    storiesHeading: "Recent stories",
    ctaHeading: "Send something beautiful",
    ctaBody: "Browse the season's collection or pick from our best sellers.",
    ctaShop: "Shop the collection",
    readStory: "Read the story",
    allStories: "All",
    minRead: "{min} min read",
    categories: {
      flowers: "Flowers",
      "gifting-guides": "Gifting Guides",
      "behind-the-scenes": "Behind the Scenes",
      makers: "Makers",
    },
    noStories: "No stories in this category yet.",
  },
  ar: {
    eyebrow: "يوميّات الأتيليه",
    title: "حكايات من الاستوديو.",
    intro: "ملاحظات عن الحرفة وأزهار الموسم وفنّ الإهداء المدروس.",
    storiesHeading: "أحدث الحكايات",
    ctaHeading: "أرسل شيئاً جميلاً",
    ctaBody: "تصفّح مجموعة الموسم أو اختر من أكثر منتجاتنا مبيعاً.",
    ctaShop: "تسوّق المجموعة",
    readStory: "اقرأ الحكاية",
    allStories: "الكل",
    minRead: "{min} دقائق قراءة",
    categories: {
      flowers: "الأزهار",
      "gifting-guides": "أدلّة الإهداء",
      "behind-the-scenes": "خلف الكواليس",
      makers: "الصنّاع",
    },
    noStories: "لا حكايات في هذه الفئة بعد.",
  },
  fr: {
    eyebrow: "Le Journal de l'Atelier",
    title: "Histoires du studio.",
    intro: "Notes sur le savoir-faire, les fleurs de saison et l'art d'offrir.",
    storiesHeading: "Histoires récentes",
    ctaHeading: "Envoyez quelque chose de beau",
    ctaBody:
      "Parcourez la collection de la saison ou choisissez parmi nos meilleures ventes.",
    ctaShop: "Voir la collection",
    readStory: "Lire l'histoire",
    allStories: "Tout",
    minRead: "{min} min de lecture",
    categories: {
      flowers: "Fleurs",
      "gifting-guides": "Guides cadeaux",
      "behind-the-scenes": "Coulisses",
      makers: "Artisans",
    },
    noStories: "Pas encore d'histoires dans cette catégorie.",
  },
  el: {
    eyebrow: "Το Ημερολόγιο του Ατελιέ",
    title: "Ιστορίες από το στούντιο.",
    intro: "Σημειώσεις για την τέχνη, τα εποχιακά άνθη και το προσεγμένο δώρο.",
    storiesHeading: "Πρόσφατες ιστορίες",
    ctaHeading: "Στείλτε κάτι όμορφο",
    ctaBody: "Περιηγηθείτε στη συλλογή της εποχής ή επιλέξτε από τα best seller μας.",
    ctaShop: "Δείτε τη συλλογή",
    readStory: "Διαβάστε την ιστορία",
    allStories: "Όλα",
    minRead: "{min} λεπτά ανάγνωσης",
    categories: {
      flowers: "Άνθη",
      "gifting-guides": "Οδηγοί δώρων",
      "behind-the-scenes": "Παρασκήνια",
      makers: "Δημιουργοί",
    },
    noStories: "Δεν υπάρχουν ακόμη ιστορίες σε αυτήν την κατηγορία.",
  },
};

// Stories derive from the shared blog source of truth so the index can never
// drift from the article pages or the server-side crawlable index.
function getStories(language: Language): Story[] {
  // Blog article content exists only in EN/AR/FR; Greek visitors fall back to
  // English article content (intended). The page UI copy is still localised.
  const blogLang = language === "el" ? "en" : language;
  return Object.keys(ARTICLES)
    .map<Story | null>((slug) => {
      const a = ARTICLES[slug][blogLang] ?? ARTICLES[slug].en;
      // Some editorial posts are intentionally published in one language
      // first. Keep them out of other locale listings until a translation
      // exists rather than rendering an undefined article card.
      if (!a) return null;
      const meta = getBlogPostMeta(slug);
      return {
        slug,
        title: a.title,
        excerpt: getBlogPostExcerpt(a),
        category: meta.category,
        readingTime: getBlogPostReadingTime(slug, blogLang),
        datePublished: a.datePublished,
        ogImage: a.ogImage,
      };
    })
    .filter((story): story is Story => story !== null)
    .sort((a, b) =>
      a.datePublished < b.datePublished ? 1 : a.datePublished > b.datePublished ? -1 : 0,
    );
}

function StoryImage({
  story,
  sizes,
  eager = false,
}: {
  story: Story;
  sizes: string;
  eager?: boolean;
}) {
  if (!story.ogImage) {
    return <div className="w-full h-full bg-muted" aria-hidden="true" />;
  }
  return (
    <img
      src={story.ogImage.url}
      srcSet={buildSrcSet(story.ogImage.url, BLOG_HERO_VARIANT_WIDTHS, story.ogImage.width)}
      sizes={sizes}
      width={story.ogImage.width}
      height={story.ogImage.height}
      alt={story.title}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.03]"
      data-testid="blog-story-card-image"
    />
  );
}

export default function Blog() {
  const { language, t } = useLocale();
  const c = COPY[language] ?? COPY.en;
  const isRtl = language === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;
  const [activeCategory, setActiveCategory] = useState<BlogCategory | "all">("all");

  const stories = useMemo(() => getStories(language), [language]);
  const featuredSlug = getFeaturedBlogSlug();
  const featured = stories.find((s) => s.slug === featuredSlug) ?? stories[0];

  const showFeatured = activeCategory === "all" && featured;
  const gridStories =
    activeCategory === "all"
      ? stories.filter((s) => s.slug !== featured?.slug)
      : stories.filter((s) => s.category === activeCategory);

  const minRead = (min: number) => c.minRead.replace("{min}", String(min));

  const pills: { key: BlogCategory | "all"; label: string }[] = [
    { key: "all", label: c.allStories },
    ...BLOG_CATEGORIES.map((cat) => ({ key: cat, label: c.categories[cat] })),
  ];

  return (
    <div
      className="blog-editorial bg-[hsl(42,38%,97%)] text-foreground"
      data-testid="blog-page"
      lang={language}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Compact editorial hero */}
      <section className="container mx-auto px-4 pt-8 pb-6 md:pt-10 md:pb-8 max-w-content">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "~/" }, { label: c.eyebrow }]} />
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mt-4 mb-3">
          {c.eyebrow}
        </p>
        <h1
          className="text-3xl md:text-[2.75rem] font-serif leading-tight mb-3"
          data-testid="blog-title"
        >
          {c.title}
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-6">
          {c.intro}
        </p>

        {/* Category pills — horizontally scrollable on mobile */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={c.storiesHeading}
          data-testid="blog-category-pills"
        >
          {pills.map((pill) => {
            const active = activeCategory === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(pill.key)}
                data-testid={`blog-category-pill-${pill.key}`}
                className={
                  "shrink-0 whitespace-nowrap rounded-full px-4 min-h-[44px] text-sm font-medium transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "bg-white text-foreground border border-border hover:border-primary/40")
                }
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured story — 60/40 on desktop, stacked on mobile */}
      {showFeatured && (
        <section className="container mx-auto px-4 pb-10 md:pb-14 max-w-content">
          <article
            className="rounded-lg border border-border bg-white overflow-hidden"
            data-testid="blog-featured-story"
          >
            <Link
              href={`/blog/${featured.slug}`}
              className="group grid md:grid-cols-[3fr_2fr] focus-visible:outline-2"
            >
              <div className="overflow-hidden aspect-[4/3] md:aspect-auto md:min-h-[320px]">
                <StoryImage
                  story={featured}
                  sizes="(min-width: 768px) 60vw, 100vw"
                  eager
                />
              </div>
              <div className="flex flex-col justify-center p-6 md:p-10">
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-semibold mb-3">
                  {c.categories[featured.category]}
                </p>
                <h2 className="font-serif text-2xl md:text-3xl leading-snug mb-3">
                  {featured.title}
                </h2>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed mb-4">
                  {featured.excerpt}
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground mb-5">
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  {minRead(featured.readingTime)}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {c.readStory}
                  <Arrow className="w-4 h-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1 rtl:motion-safe:group-hover:-translate-x-1" />
                </span>
              </div>
            </Link>
          </article>
        </section>
      )}

      {/* Recent stories grid — 3-up desktop / 2-up tablet / 1-up mobile */}
      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-6 md:mb-8">
          {c.storiesHeading}
        </h2>
        {gridStories.length === 0 ? (
          <p className="text-muted-foreground" data-testid="blog-empty-category">
            {c.noStories}
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {gridStories.map((s) => (
              <article
                key={s.slug}
                className="rounded-lg border border-border bg-white flex flex-col overflow-hidden"
                data-testid="blog-story-card"
              >
                <Link href={`/blog/${s.slug}`} className="flex flex-col flex-1 group">
                  <div className="overflow-hidden aspect-[4/3]">
                    <StoryImage
                      story={s}
                      sizes="(min-width: 1024px) 384px, (min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <div className="flex flex-col flex-1 p-6">
                    <p className="text-xs uppercase tracking-[0.18em] text-primary font-semibold mb-3">
                      {c.categories[s.category]}
                    </p>
                    <h3 className="font-serif text-lg leading-snug mb-3 group-hover:underline underline-offset-2">
                      {s.title}
                    </h3>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        {minRead(s.readingTime)}
                      </span>
                      <Arrow
                        className="w-4 h-4 text-primary motion-safe:transition-transform motion-safe:group-hover:translate-x-1 rtl:motion-safe:group-hover:-translate-x-1"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Commerce CTA — visually secondary to editorial content */}
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

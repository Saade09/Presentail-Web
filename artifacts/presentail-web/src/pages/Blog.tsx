import { Link } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

type Story = {
  slug: string;
  eyebrow: string;
  title: string;
  excerpt: string;
};

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  storiesHeading: string;
  stories: Story[];
  ctaHeading: string;
  ctaBody: string;
  ctaShop: string;
  readArticle: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "The Atelier Journal",
    title: "Stories from the studio.",
    intro:
      "Notes on craft, the season's blooms, the makers we love, and the small details that turn a delivery into a moment.",
    storiesHeading: "Recent stories",
    stories: [
      {
        slug: "inside-spring-sourcing-trip",
        eyebrow: "Seasonal sourcing",
        title: "Inside our spring sourcing trip",
        excerpt:
          "How our florists pick the season's best peonies, ranunculi, and garden roses — and what to look for when a bloom is at its peak.",
      },
      {
        slug: "chocolatiers-behind-our-gift-boxes",
        eyebrow: "Maker spotlight",
        title: "The chocolatiers behind our gift boxes",
        excerpt:
          "We sit down with the family-run ateliers we partner with across Beirut, Dubai, and Limassol to talk craft, cocoa, and patience.",
      },
      {
        slug: "what-to-send-when-there-are-no-words",
        eyebrow: "Gifting guide",
        title: "What to send when there are no words",
        excerpt:
          "A short guide to thoughtful sympathy gifts — and how to write a card that actually helps.",
      },
    ],
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
    stories: [
      {
        slug: "inside-spring-sourcing-trip",
        eyebrow: "مصادر موسمية",
        title: "داخل رحلة مصادر الربيع",
        excerpt:
          "كيف يختار منسّقو الأزهار لدينا أفضل أزهار الفاوانيا والحوذان وورود الحدائق — وما الذي يدلّ على ذروة جمال الزهرة.",
      },
      {
        slug: "chocolatiers-behind-our-gift-boxes",
        eyebrow: "تعريف بصانع",
        title: "صنّاع الشوكولاتة وراء علب هدايانا",
        excerpt:
          "نجلس مع الأتيليهات العائلية التي نتعاون معها في بيروت ودبي وليماسول للحديث عن الحرفة والكاكاو والصبر.",
      },
      {
        slug: "what-to-send-when-there-are-no-words",
        eyebrow: "دليل الإهداء",
        title: "ماذا ترسل حين تعجز الكلمات",
        excerpt:
          "دليل قصير لهدايا التعازي المدروسة — وكيف تكتب بطاقة تُواسي فعلاً.",
      },
    ],
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
    stories: [
      {
        slug: "inside-spring-sourcing-trip",
        eyebrow: "Sourcing de saison",
        title: "Dans les coulisses de notre sourcing de printemps",
        excerpt:
          "Comment nos fleuristes choisissent les plus belles pivoines, renoncules et roses de jardin — et comment reconnaître une fleur à son apogée.",
      },
      {
        slug: "chocolatiers-behind-our-gift-boxes",
        eyebrow: "Portrait d'artisan",
        title: "Les chocolatiers derrière nos coffrets cadeaux",
        excerpt:
          "Nous rencontrons les ateliers familiaux de Beyrouth, Dubaï et Limassol avec qui nous travaillons pour parler savoir-faire, cacao et patience.",
      },
      {
        slug: "what-to-send-when-there-are-no-words",
        eyebrow: "Guide cadeau",
        title: "Quoi envoyer quand les mots manquent",
        excerpt:
          "Un court guide des cadeaux de condoléances réfléchis — et comment écrire une carte qui réconforte vraiment.",
      },
    ],
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
          {c.stories.map((s) => (
            <article
              key={s.slug}
              className="rounded-lg border border-border bg-card flex flex-col overflow-hidden"
              data-testid="blog-story-card"
            >
              <Link href={`/blog/${s.slug}`} className="flex flex-col flex-1 p-6 group">
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

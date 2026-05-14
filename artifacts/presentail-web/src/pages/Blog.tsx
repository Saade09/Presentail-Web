import { Link } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";

type Story = {
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
  comingSoon: string;
  ctaHeading: string;
  ctaBody: string;
  ctaShop: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "The Atelier Journal",
    title: "Stories from the studio.",
    intro:
      "Notes on craft, the season's blooms, the makers we love, and the small details that turn a delivery into a moment. New stories land here as we write them.",
    storiesHeading: "Recent stories",
    stories: [
      {
        eyebrow: "Seasonal sourcing",
        title: "Inside our spring sourcing trip",
        excerpt:
          "How our florists pick the season's best peonies, ranunculi, and garden roses — and what to look for when a bloom is at its peak.",
      },
      {
        eyebrow: "Maker spotlight",
        title: "The chocolatiers behind our gift boxes",
        excerpt:
          "We sit down with the family-run ateliers we partner with across Beirut, Dubai, and Limassol to talk craft, cocoa, and patience.",
      },
      {
        eyebrow: "Gifting guide",
        title: "What to send when there are no words",
        excerpt:
          "A short guide to thoughtful sympathy gifts — and how to write a card that actually helps.",
      },
    ],
    comingSoon: "Full stories are on their way. Subscribe in the footer to be the first to read them.",
    ctaHeading: "While you wait — send something beautiful",
    ctaBody: "Browse the season's collection or pick from our best sellers.",
    ctaShop: "Shop the collection",
  },
  ar: {
    eyebrow: "يوميّات الأتيليه",
    title: "حكايات من الاستوديو.",
    intro:
      "ملاحظات عن الحرفة، وأزهار الموسم، والصنّاع الذين نحبّهم، والتفاصيل الصغيرة التي تحوّل التوصيل إلى لحظة. تظهر الحكايات الجديدة هنا فور كتابتها.",
    storiesHeading: "أحدث الحكايات",
    stories: [
      {
        eyebrow: "مصادر موسمية",
        title: "داخل رحلة مصادر الربيع",
        excerpt:
          "كيف يختار منسّقو الأزهار لدينا أفضل أزهار الفاوانيا والحوذان وورود الحدائق — وما الذي يدلّ على ذروة جمال الزهرة.",
      },
      {
        eyebrow: "تعريف بصانع",
        title: "صنّاع الشوكولاتة وراء علب هدايانا",
        excerpt:
          "نجلس مع الأتيليهات العائلية التي نتعاون معها في بيروت ودبي وليماسول للحديث عن الحرفة والكاكاو والصبر.",
      },
      {
        eyebrow: "دليل الإهداء",
        title: "ماذا ترسل حين تعجز الكلمات",
        excerpt:
          "دليل قصير لهدايا التعازي المدروسة — وكيف تكتب بطاقة تُواسي فعلاً.",
      },
    ],
    comingSoon:
      "الحكايات الكاملة في الطريق. اشترك من التذييل لتكون أوّل من يقرأها.",
    ctaHeading: "وإلى أن نلتقي — أرسل شيئاً جميلاً",
    ctaBody: "تصفّح مجموعة الموسم أو اختر من أكثر منتجاتنا مبيعاً.",
    ctaShop: "تسوّق المجموعة",
  },
  fr: {
    eyebrow: "Le Journal de l'Atelier",
    title: "Histoires du studio.",
    intro:
      "Notes sur le savoir-faire, les fleurs de saison, les artisans que nous aimons, et les petits détails qui transforment une livraison en moment. Les nouvelles histoires arrivent ici au fil de l'écriture.",
    storiesHeading: "Histoires récentes",
    stories: [
      {
        eyebrow: "Sourcing de saison",
        title: "Dans les coulisses de notre sourcing de printemps",
        excerpt:
          "Comment nos fleuristes choisissent les plus belles pivoines, renoncules et roses de jardin — et comment reconnaître une fleur à son apogée.",
      },
      {
        eyebrow: "Portrait d'artisan",
        title: "Les chocolatiers derrière nos coffrets cadeaux",
        excerpt:
          "Nous rencontrons les ateliers familiaux de Beyrouth, Dubaï et Limassol avec qui nous travaillons pour parler savoir-faire, cacao et patience.",
      },
      {
        eyebrow: "Guide cadeau",
        title: "Quoi envoyer quand les mots manquent",
        excerpt:
          "Un court guide des cadeaux de condoléances réfléchis — et comment écrire une carte qui réconforte vraiment.",
      },
    ],
    comingSoon:
      "Les histoires complètes arrivent bientôt. Abonnez-vous dans le pied de page pour être les premiers à les lire.",
    ctaHeading: "En attendant — envoyez quelque chose de beau",
    ctaBody:
      "Parcourez la collection de la saison ou choisissez parmi nos meilleures ventes.",
    ctaShop: "Voir la collection",
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

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.storiesHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.stories.map((s) => (
            <article
              key={s.title}
              className="rounded-lg border border-border p-6 bg-card flex flex-col"
              data-testid="blog-story-card"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                {s.eyebrow}
              </p>
              <h3 className="font-serif text-lg mb-3">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {s.excerpt}
              </p>
            </article>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted-foreground italic">
          {c.comingSoon}
        </p>
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

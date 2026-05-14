import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  highlightsHeading: string;
  highlights: { value: string; label: string }[];
  storyHeading: string;
  storyParagraphs: string[];
  ctaHeading: string;
  ctaBody: string;
  ctaButton: string;
  ctaSubject: string;
};

const IR_EMAIL = "investors@presentail.com";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Investor Relations",
    title: "Building the gifting platform of the SWANA region.",
    intro:
      "Presentail is a venture-backed luxury gifting platform serving Lebanon, the United Arab Emirates and Cyprus, with a clear roadmap into the broader GCC and the diaspora.",
    highlightsHeading: "By the numbers",
    highlights: [
      { value: "3", label: "Countries served today" },
      { value: "200+", label: "Curated brand partners" },
      { value: "7d", label: "Operations, year-round" },
    ],
    storyHeading: "Our thesis",
    storyParagraphs: [
      "Gifting in the region remains highly fragmented across thousands of small florists and brands, with no trusted cross-border layer. Presentail consolidates demand from the diaspora and high-intent local shoppers, and pairs it with a vetted supply of premium ateliers.",
      "Our mobile-first stack, in-house logistics layer, and cross-border payments make us hard to copy and easy to expand. We are profitable on a per-order basis in our home market and reinvest into category and country expansion.",
    ],
    ctaHeading: "Talk to investor relations",
    ctaBody:
      "We share quarterly updates with current investors and a detailed deck on request to qualified parties.",
    ctaButton: "Email investor relations",
    ctaSubject: "Investor inquiry — Presentail",
  },
  ar: {
    eyebrow: "علاقات المستثمرين",
    title: "نبني منصّة الإهداء لمنطقة جنوب غرب آسيا وشمال أفريقيا.",
    intro:
      "بريزانتيل منصّة هدايا فاخرة مدعومة من رأس المال الاستثماري تخدم لبنان والإمارات العربية المتحدة وقبرص، مع خارطة طريق واضحة للتوسّع في دول الخليج وجمهور المغتربين.",
    highlightsHeading: "أرقام رئيسية",
    highlights: [
      { value: "3", label: "دول نخدمها اليوم" },
      { value: "+200", label: "علامة شريكة منسّقة" },
      { value: "7 أيام", label: "عمليات على مدار السنة" },
    ],
    storyHeading: "أطروحتنا",
    storyParagraphs: [
      "ما زال قطاع الإهداء في المنطقة مجزّأ بين آلاف منسّقي الأزهار والعلامات الصغيرة، دون طبقة موثوقة عابرة للحدود. تجمع بريزانتيل الطلب من المغتربين والمشترين المحلّيين عالي النيّة، وتربطه بعرض منتقى من الأتيليهات الفاخرة.",
      "تجعلنا منصّتنا الموجّهة للموبايل، وطبقتنا اللوجستية الداخلية، ومدفوعاتنا العابرة للحدود صعبَي التقليد وسهلَي التوسّع. نحقّق ربحاً على مستوى الطلب في سوقنا الأم ونعيد الاستثمار في توسيع الفئات والدول.",
    ],
    ctaHeading: "تواصل مع علاقات المستثمرين",
    ctaBody:
      "نشارك تحديثات فصلية مع المستثمرين الحاليين وعرضاً تفصيلياً عند الطلب للجهات المؤهّلة.",
    ctaButton: "راسل علاقات المستثمرين",
    ctaSubject: "استفسار مستثمر — بريزانتيل",
  },
  fr: {
    eyebrow: "Relations investisseurs",
    title: "Construire la plateforme de cadeaux de la région SWANA.",
    intro:
      "Presentail est une plateforme de cadeaux de luxe soutenue par le capital-risque, présente au Liban, aux Émirats arabes unis et à Chypre, avec une feuille de route claire vers le Golfe et la diaspora.",
    highlightsHeading: "En chiffres",
    highlights: [
      { value: "3", label: "Pays servis aujourd'hui" },
      { value: "200+", label: "Marques partenaires sélectionnées" },
      { value: "7j/7", label: "Opérations toute l'année" },
    ],
    storyHeading: "Notre thèse",
    storyParagraphs: [
      "Le marché du cadeau dans la région reste très fragmenté entre des milliers de petits fleuristes et marques, sans couche transfrontalière de confiance. Presentail agrège la demande de la diaspora et des clients locaux à forte intention, et la connecte à une offre sélectionnée d'ateliers premium.",
      "Notre stack mobile-first, notre couche logistique interne et nos paiements transfrontaliers nous rendent difficiles à copier et faciles à étendre. Nous sommes rentables à la commande sur notre marché domestique et réinvestissons dans l'expansion catégorielle et géographique.",
    ],
    ctaHeading: "Contacter les relations investisseurs",
    ctaBody:
      "Nous partageons des mises à jour trimestrielles avec les investisseurs actuels et un deck détaillé sur demande.",
    ctaButton: "Écrire aux relations investisseurs",
    ctaSubject: "Demande investisseur — Presentail",
  },
};

export default function InvestorRelations() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;
  const mailto = `mailto:${IR_EMAIL}?subject=${encodeURIComponent(c.ctaSubject)}`;

  return (
    <div className="bg-background" data-testid="investor-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="investor-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.highlightsHeading}
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {c.highlights.map((h) => (
            <div
              key={h.label}
              className="rounded-lg border border-border p-6 bg-card text-center"
            >
              <div className="font-serif text-3xl md:text-4xl mb-2">
                {h.value}
              </div>
              <div className="text-sm text-muted-foreground">{h.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-3xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-6">{c.storyHeading}</h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          {c.storyParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.ctaHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.ctaBody}</p>
          <a href={mailto} data-testid="investor-cta-email">
            <Button variant="secondary">{c.ctaButton}</Button>
          </a>
          <p className="mt-4 text-sm opacity-80">{IR_EMAIL}</p>
        </div>
      </section>
    </div>
  );
}

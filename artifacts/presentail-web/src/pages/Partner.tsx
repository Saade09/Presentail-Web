import { useLocale, type Language } from "@/contexts/LocaleContext";
import PartnerForm from "@/components/PartnerForm";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  whyHeading: string;
  why: { title: string; body: string }[];
  whoHeading: string;
  who: string[];
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Partner With Us",
    title: "Reach gift-givers across Lebanon, the UAE and Cyprus.",
    intro:
      "Presentail is a curated luxury gifting platform for florists, chocolatiers, bakers, and lifestyle ateliers. We bring our concierge customers, multi-country logistics, and editorial storefront — you bring the craft.",
    whyHeading: "Why partner with Presentail",
    why: [
      {
        title: "A premium audience",
        body: "Our shoppers expect maison-grade gifts and are willing to pay for them. Most orders include flowers plus a curated add-on.",
      },
      {
        title: "Cross-border reach",
        body: "Three markets today, more on the way. We handle the local delivery, currency conversion, and payment methods so you can focus on the product.",
      },
      {
        title: "Editorial placement",
        body: "Featured brands appear on the homepage, brand collection, and seasonal lookbooks — not buried in a long catalogue.",
      },
    ],
    whoHeading: "Who we partner with",
    who: [
      "Florists and floral designers with a recognisable signature style.",
      "Chocolatiers, patissiers and bakers with consistent same-day production.",
      "Lifestyle, beauty and home brands that pair well with a gift moment.",
    ],
  },
  ar: {
    eyebrow: "كن شريكاً معنا",
    title: "صل إلى المهدّين في لبنان والإمارات وقبرص.",
    intro:
      "بريزانتيل منصّة هدايا فاخرة منسّقة لمنسّقي الأزهار وصنّاع الشوكولاتة والمخابز وأتيليهات نمط الحياة. نحن نوفّر العملاء، والخدمة اللوجستية متعدّدة الدول، والواجهة التحريرية — وأنت تقدّم الحرفة.",
    whyHeading: "لماذا تشاركنا",
    why: [
      {
        title: "جمهور مميّز",
        body: "عملاؤنا يتوقّعون هدايا بمستوى المَزون ومستعدّون لقيمتها. معظم الطلبات تجمع الأزهار مع إضافة منسّقة.",
      },
      {
        title: "وصول عابر للحدود",
        body: "ثلاث أسواق اليوم وغيرها قادمة. نتولّى التوصيل المحلّي وتحويل العملات ووسائل الدفع لتتفرّغ للمنتج.",
      },
      {
        title: "حضور تحريري",
        body: "العلامات المميّزة تظهر في الصفحة الرئيسية ومجموعة العلامات والكتالوجات الموسمية — لا في فهرس طويل.",
      },
    ],
    whoHeading: "مع من نتشارك",
    who: [
      "منسّقو أزهار ومصمّمون بأسلوب مميّز.",
      "صنّاع شوكولاتة ومعجّنات ومخابز بإنتاج يومي ثابت.",
      "علامات نمط حياة وجمال ومنزل تناسب لحظة الإهداء.",
    ],
  },
  fr: {
    eyebrow: "Devenir partenaire",
    title: "Atteignez les amateurs de cadeaux au Liban, aux Émirats et à Chypre.",
    intro:
      "Presentail est une plateforme de cadeaux de luxe sélective pour les fleuristes, chocolatiers, pâtissiers et ateliers art de vivre. Nous apportons les clients, la logistique multi-pays et la vitrine éditoriale — vous apportez le savoir-faire.",
    whyHeading: "Pourquoi rejoindre Presentail",
    why: [
      {
        title: "Une audience premium",
        body: "Nos clients attendent des cadeaux dignes d'une maison et sont prêts à y mettre le prix. La plupart des commandes associent fleurs et complément sélectionné.",
      },
      {
        title: "Une portée internationale",
        body: "Trois marchés aujourd'hui, d'autres à venir. Nous gérons la livraison locale, la conversion des devises et les paiements pour que vous puissiez vous concentrer sur le produit.",
      },
      {
        title: "Une mise en avant éditoriale",
        body: "Les marques mises en avant apparaissent sur la page d'accueil, la sélection de marques et les lookbooks saisonniers — pas enfouies dans un long catalogue.",
      },
    ],
    whoHeading: "Avec qui nous collaborons",
    who: [
      "Fleuristes et designers floraux au style reconnaissable.",
      "Chocolatiers, pâtissiers et boulangers avec une production fiable le jour même.",
      "Marques art de vivre, beauté et maison qui s'accordent à un moment cadeau.",
    ],
  },
};

export default function Partner() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="partner-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="partner-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">{c.whyHeading}</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.why.map((p) => (
            <div
              key={p.title}
              className="rounded-lg border border-border p-6 bg-card"
            >
              <h3 className="font-serif text-lg mb-3">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-6">{c.whoHeading}</h2>
        <ul className="space-y-3 text-muted-foreground leading-relaxed">
          {c.who.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-primary mt-1.5 flex-shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg border border-border bg-card p-8 md:p-12">
          <PartnerForm />
        </div>
      </section>
    </div>
  );
}

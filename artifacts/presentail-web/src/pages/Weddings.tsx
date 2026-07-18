import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { CITY_NAMES, TITLES, formatTemplate } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { SEOContentSection } from "@/components/SEOContentSection";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  servicesHeading: string;
  services: { title: string; body: string }[];
  processHeading: string;
  process: { step: string; title: string; body: string }[];
  ctaHeading: string;
  ctaBody: string;
  ctaButton: string;
  ctaSubject: string;
};

const EVENTS_EMAIL = "events@presentail.com";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Weddings & Events",
    title: "Florals and gifting, designed for the day you'll remember.",
    intro:
      "From intimate ceremonies to full wedding weekends, our events team designs the floral story, builds the guest gifts, and coordinates same-day deliveries across Lebanon, the UAE and Cyprus.",
    servicesHeading: "What we design",
    services: [
      {
        title: "Ceremony & reception florals",
        body: "Aisles, arches, centrepieces, table runners, and installations — designed around your colour story and venue.",
      },
      {
        title: "Bridal & bridesmaid bouquets",
        body: "Hand-tied bouquets, boutonnières, and flower crowns made on the morning of the event.",
      },
      {
        title: "Guest gifts & welcome boxes",
        body: "Curated favours and welcome boxes for hotel rooms — chocolates, candles, and bespoke notes.",
      },
      {
        title: "Engagements, showers, anniversaries",
        body: "Smaller-scale styling for proposals, bridal showers, baby showers and anniversaries.",
      },
    ],
    processHeading: "How it works",
    process: [
      {
        step: "01",
        title: "Tell us about the day",
        body: "Date, venue, guest count, and any inspiration you've collected.",
      },
      {
        step: "02",
        title: "Design proposal",
        body: "Within one week we send a moodboard, layout sketches, and a transparent quote.",
      },
      {
        step: "03",
        title: "We deliver and install",
        body: "Our team handles preparation, delivery, on-site set-up, and tear-down.",
      },
    ],
    ctaHeading: "Plan your event with us",
    ctaBody:
      "Tell us your date and venue, and we'll come back to you with a moodboard within the week.",
    ctaButton: "Email the events team",
    ctaSubject: "Wedding / event inquiry",
  },
  ar: {
    eyebrow: "الأعراس والمناسبات",
    title: "أزهار وهدايا مصمّمة ليوم لن تنساه.",
    intro:
      "من المراسم الحميمة إلى عطل العرس الكاملة، يصمّم فريق المناسبات لدينا قصّة الأزهار، ويُعدّ هدايا الضيوف، وينسّق التوصيلات في اليوم نفسه عبر لبنان والإمارات وقبرص.",
    servicesHeading: "ما نصمّمه",
    services: [
      {
        title: "أزهار المراسم والاستقبال",
        body: "الممرّات والأقواس والقطع المركزية ومفارش الطاولات والتركيبات — مصمّمة حول قصّة ألوانك ومكان حفلك.",
      },
      {
        title: "باقات العروس والإشبينات",
        body: "باقات يدوية، وبوتونيير، وأكاليل أزهار تُعدّ في صباح اليوم.",
      },
      {
        title: "هدايا الضيوف وصناديق الترحيب",
        body: "هدايا منسّقة وصناديق ترحيب لغرف الفنادق — شوكولاتة، شموع، ورسائل خاصة.",
      },
      {
        title: "خطوبات، ودشّ عروس، وذكرى زواج",
        body: "تنسيق على نطاق أصغر للعروض والاحتفالات الخاصة وذكرى الزواج.",
      },
    ],
    processHeading: "كيف نعمل",
    process: [
      {
        step: "01",
        title: "حدّثنا عن اليوم",
        body: "التاريخ، المكان، عدد الضيوف، وأي مرجع جمعتِه.",
      },
      {
        step: "02",
        title: "عرض التصميم",
        body: "خلال أسبوع نرسل لوحة مزاج ورسومات تخطيطية وعرض سعر شفّاف.",
      },
      {
        step: "03",
        title: "نوصّل ونركّب",
        body: "يتولّى فريقنا التحضير والتوصيل والتركيب في الموقع والفك.",
      },
    ],
    ctaHeading: "خطّط لمناسبتك معنا",
    ctaBody:
      "أرسل لنا التاريخ والمكان، وسنعود إليك بلوحة مزاج خلال أسبوع.",
    ctaButton: "راسل فريق المناسبات",
    ctaSubject: "استفسار عرس / مناسبة",
  },
  fr: {
    eyebrow: "Mariages & événements",
    title: "Des fleurs et des cadeaux conçus pour le jour dont on se souvient.",
    intro:
      "Des cérémonies intimes aux week-ends de mariage complets, notre équipe événements imagine la scénographie florale, prépare les cadeaux des invités et coordonne les livraisons le jour J au Liban, aux Émirats et à Chypre.",
    servicesHeading: "Ce que nous concevons",
    services: [
      {
        title: "Florales de cérémonie & réception",
        body: "Allées, arches, centres de table, chemins de table et installations — pensés autour de vos couleurs et de votre lieu.",
      },
      {
        title: "Bouquets de la mariée et des demoiselles d'honneur",
        body: "Bouquets liés à la main, boutonnières et couronnes de fleurs réalisés le matin même.",
      },
      {
        title: "Cadeaux invités & welcome boxes",
        body: "Faveurs sélectionnées et boîtes de bienvenue pour les chambres d'hôtel — chocolats, bougies et mots personnalisés.",
      },
      {
        title: "Fiançailles, showers, anniversaires",
        body: "Mise en scène plus intime pour demandes en mariage, showers et anniversaires.",
      },
    ],
    processHeading: "Comment ça marche",
    process: [
      {
        step: "01",
        title: "Parlez-nous du jour",
        body: "Date, lieu, nombre d'invités et toutes les inspirations que vous avez réunies.",
      },
      {
        step: "02",
        title: "Proposition de design",
        body: "Sous une semaine, nous envoyons un moodboard, des croquis et un devis transparent.",
      },
      {
        step: "03",
        title: "Nous livrons et installons",
        body: "Notre équipe gère préparation, livraison, mise en place sur site et démontage.",
      },
    ],
    ctaHeading: "Planifiez votre événement avec nous",
    ctaBody:
      "Indiquez-nous la date et le lieu, et nous reviendrons vers vous avec un moodboard dans la semaine.",
    ctaButton: "Écrire à l'équipe événements",
    ctaSubject: "Demande mariage / événement",
  },
};

export default function Weddings() {
  const { language, t } = useLocale();
  const { cityId, countryCode } = useLocationSelection();
  const c = COPY[language] ?? COPY.en;
  const mailto = `mailto:${EVENTS_EMAIL}?subject=${encodeURIComponent(c.ctaSubject)}`;
  const cityDisplay = cityId
    ? ((CITY_NAMES[language] ?? CITY_NAMES.en)[cityId] ?? "")
    : "";
  const h1 = formatTemplate(
    (TITLES[language] ?? TITLES.en).weddings,
    { city: cityDisplay },
  ).split(" | ")[0];

  return (
    <div className="bg-background" data-testid="weddings-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: c.eyebrow }]} />
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="weddings-title"
        >
          {h1}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.servicesHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          {c.services.map((s) => (
            <div
              key={s.title}
              className="rounded-lg border border-border p-6 bg-card"
            >
              <h3 className="font-serif text-lg mb-3">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.processHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.process.map((p) => (
            <div key={p.step} className="rounded-lg border border-border p-6 bg-card">
              <div className="text-sm text-muted-foreground mb-2">{p.step}</div>
              <h3 className="font-serif text-lg mb-3">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.ctaHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.ctaBody}</p>
          <a href={mailto} data-testid="weddings-cta-email">
            <Button variant="secondary">{c.ctaButton}</Button>
          </a>
          <p className="mt-4 text-sm opacity-80">{EVENTS_EMAIL}</p>
        </div>
      </section>

      <SEOContentSection
        pageType="weddings"
        cityLabel={cityDisplay}
        lang={language}
        countryCode={countryCode ?? ""}
        suppressFaqJsonLd
      />
    </div>
  );
}

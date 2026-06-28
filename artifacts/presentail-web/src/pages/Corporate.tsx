import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { CITY_NAMES, TITLES, formatTemplate } from "@/lib/seo";
import { Button } from "@/components/ui/button";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  servicesHeading: string;
  services: { title: string; body: string }[];
  perksHeading: string;
  perks: string[];
  ctaHeading: string;
  ctaBody: string;
  ctaButton: string;
  ctaSubject: string;
};

const CORPORATE_EMAIL = "corporate@presentail.com";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Corporate Gifts",
    title: "Thoughtful corporate gifting, at any scale.",
    intro:
      "From a five-person team to a thousand-client campaign, we curate, brand and deliver corporate gifts across Lebanon, the UAE and Cyprus — invoiced and reportable.",
    servicesHeading: "What we offer",
    services: [
      {
        title: "Curated gift boxes",
        body: "Pre-designed boxes for every occasion or fully custom selections built around your brand and budget.",
      },
      {
        title: "Branded packaging",
        body: "Custom ribbons, cards, sleeves, and inserts printed with your logo or message.",
      },
      {
        title: "Bulk delivery & scheduling",
        body: "Recipient-list upload, scheduled delivery dates, and multi-country fulfilment from a single brief.",
      },
      {
        title: "Reporting & invoicing",
        body: "Consolidated invoicing in your preferred currency, with delivery confirmations and reporting.",
      },
    ],
    perksHeading: "Why teams choose us",
    perks: [
      "Volume pricing from 10 gifts and up.",
      "Dedicated account manager from brief to delivery.",
      "Same-day delivery in Beirut, Dubai, Abu Dhabi, Nicosia and Limassol.",
      "Year-round support for onboarding, milestones, holidays and client appreciation.",
    ],
    ctaHeading: "Brief us on your campaign",
    ctaBody:
      "Send us your occasion, recipient count and any branding constraints. We reply within two business days.",
    ctaButton: "Email corporate gifting",
    ctaSubject: "Corporate gifting inquiry",
  },
  ar: {
    eyebrow: "الهدايا للشركات",
    title: "هدايا شركات مدروسة، بأي حجم.",
    intro:
      "من فريق من خمسة أشخاص إلى حملة لألف عميل، ننسّق ونعلّم ونوصّل هدايا الشركات في لبنان والإمارات وقبرص — مع فواتير وتقارير.",
    servicesHeading: "ما نقدّمه",
    services: [
      {
        title: "صناديق هدايا منسّقة",
        body: "صناديق جاهزة لكل مناسبة أو خيارات مخصّصة بالكامل تُصمّم حول علامتك وميزانيتك.",
      },
      {
        title: "تغليف مخصّص بعلامتك",
        body: "أشرطة وبطاقات وأكمام وإدراجات مخصّصة مطبوعة بشعارك أو برسالتك.",
      },
      {
        title: "توصيل بالجملة وجدولة",
        body: "تحميل قائمة المستلمين، وتواريخ توصيل مجدولة، وإيصال متعدّد الدول من ملخّص واحد.",
      },
      {
        title: "تقارير وفوترة",
        body: "فوترة موحّدة بالعملة التي تفضّلها، مع تأكيدات توصيل وتقارير.",
      },
    ],
    perksHeading: "لماذا تختارنا الفِرق",
    perks: [
      "أسعار الجملة من 10 هدايا فما فوق.",
      "مدير حساب مخصّص من الموجز إلى التوصيل.",
      "توصيل في اليوم نفسه في بيروت ودبي وأبو ظبي ونيقوسيا وليماسول.",
      "دعم على مدار السنة للتوظيف والإنجازات والأعياد وتقدير العملاء.",
    ],
    ctaHeading: "حدّثنا عن حملتك",
    ctaBody:
      "أرسل لنا المناسبة وعدد المستلمين وأي قيود علامة تجارية. نردّ خلال يومَي عمل.",
    ctaButton: "راسل قسم الشركات",
    ctaSubject: "استفسار هدايا للشركات",
  },
  fr: {
    eyebrow: "Cadeaux d'entreprise",
    title: "Des cadeaux d'entreprise pensés, à toute échelle.",
    intro:
      "D'une équipe de cinq personnes à une campagne pour mille clients, nous sélectionnons, marquons et livrons vos cadeaux au Liban, aux Émirats et à Chypre — avec facturation et reporting.",
    servicesHeading: "Notre offre",
    services: [
      {
        title: "Coffrets sélectionnés",
        body: "Des coffrets prêts pour chaque occasion ou des sélections entièrement sur mesure autour de votre marque et de votre budget.",
      },
      {
        title: "Packaging marqué",
        body: "Rubans, cartes, fourreaux et inserts personnalisés, imprimés avec votre logo ou message.",
      },
      {
        title: "Livraison en volume & planification",
        body: "Import de listes de destinataires, dates de livraison planifiées, livraison multi-pays depuis un seul brief.",
      },
      {
        title: "Reporting & facturation",
        body: "Facturation consolidée dans la devise de votre choix, avec confirmations de livraison et reporting.",
      },
    ],
    perksHeading: "Pourquoi les équipes nous choisissent",
    perks: [
      "Tarifs volume à partir de 10 cadeaux.",
      "Account manager dédié, du brief à la livraison.",
      "Livraison le jour même à Beyrouth, Dubaï, Abou Dhabi, Nicosie et Limassol.",
      "Soutien toute l'année : onboarding, jalons, fêtes et fidélisation client.",
    ],
    ctaHeading: "Donnez-nous votre brief",
    ctaBody:
      "Indiquez l'occasion, le nombre de destinataires et vos contraintes de marque. Réponse sous deux jours ouvrés.",
    ctaButton: "Écrire à l'équipe corporate",
    ctaSubject: "Demande cadeaux d'entreprise",
  },
};

export default function Corporate() {
  const { language } = useLocale();
  const { cityId } = useLocationSelection();
  const c = COPY[language] ?? COPY.en;
  const mailto = `mailto:${CORPORATE_EMAIL}?subject=${encodeURIComponent(c.ctaSubject)}`;
  const cityDisplay = cityId
    ? ((CITY_NAMES[language] ?? CITY_NAMES.en)[cityId] ?? "")
    : "";
  const h1 = formatTemplate(
    (TITLES[language] ?? TITLES.en).corporate,
    { city: cityDisplay },
  ).split(" | ")[0];

  return (
    <div className="bg-background" data-testid="corporate-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="corporate-title"
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

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-6">{c.perksHeading}</h2>
        <ul className="space-y-3 text-muted-foreground leading-relaxed">
          {c.perks.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-primary mt-1.5 flex-shrink-0">•</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.ctaHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.ctaBody}</p>
          <a href={mailto} data-testid="corporate-cta-email">
            <Button variant="secondary">{c.ctaButton}</Button>
          </a>
          <p className="mt-4 text-sm opacity-80">{CORPORATE_EMAIL}</p>
        </div>
      </section>
    </div>
  );
}

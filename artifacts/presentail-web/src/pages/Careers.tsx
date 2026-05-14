import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  perksHeading: string;
  perks: { title: string; body: string }[];
  openingsHeading: string;
  noOpenings: string;
  generalPitch: string;
  applyHeading: string;
  applyBody: string;
  applyCta: string;
  applySubject: string;
};

const APPLY_EMAIL = "careers@presentail.com";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Careers at Presentail",
    title: "Build the most thoughtful gifting experience in the region.",
    intro:
      "We're a small, hands-on team of florists, chocolatiers, designers, and engineers spread across Beirut, Dubai, and Limassol. If you care about craft, kind service, and shipping things that delight people on their best (and hardest) days, we'd love to hear from you.",
    perksHeading: "What it's like to work here",
    perks: [
      {
        title: "Real ownership",
        body: "Small team, short feedback loops. Your work ships to real customers within days, not quarters.",
      },
      {
        title: "Studio-first culture",
        body: "We work from beautiful spaces alongside the florists and makers we partner with — not from a faceless office park.",
      },
      {
        title: "Across three markets",
        body: "Lebanon, the UAE, and Cyprus today — with more on the way. Travel between studios is encouraged.",
      },
    ],
    openingsHeading: "Open roles",
    noOpenings:
      "We don't have specific roles open right now, but we're always interested in meeting florists, designers, mobile engineers, and concierge specialists who'd be a great fit.",
    generalPitch:
      "Tell us a little about yourself, what you'd love to work on, and where you're based.",
    applyHeading: "Get in touch",
    applyBody:
      "Send us your CV and a short note. We read every email and reply within a week.",
    applyCta: "Email us your CV",
    applySubject: "Joining Presentail",
  },
  ar: {
    eyebrow: "الوظائف في بريزانتيل",
    title: "ابنِ معنا أكثر تجارب الإهداء عناية في المنطقة.",
    intro:
      "نحن فريق صغير عمليّ من منسّقي الأزهار وصنّاع الشوكولاتة والمصمّمين والمهندسين، موزّعون بين بيروت ودبي وليماسول. إذا كنت تهتم بالحرفة، والخدمة اللطيفة، وبإطلاق ما يُسعد الناس في أجمل أيامهم وأصعبها، نودّ التعرّف عليك.",
    perksHeading: "كيف هو العمل معنا",
    perks: [
      {
        title: "ملكية حقيقية",
        body: "فريق صغير ودورات تغذية راجعة قصيرة. عملك يصل إلى العملاء خلال أيام، لا أرباع سنوية.",
      },
      {
        title: "ثقافة الاستوديو أولاً",
        body: "نعمل في مساحات جميلة مع منسّقي الأزهار والصنّاع الذين نتعاون معهم — لا في مكتب بلا وجه.",
      },
      {
        title: "في ثلاث أسواق",
        body: "لبنان والإمارات وقبرص اليوم — وأخرى قادمة. السفر بين الاستوديوهات مُشجَّع.",
      },
    ],
    openingsHeading: "الوظائف المتاحة",
    noOpenings:
      "لا توجد وظائف محدّدة مفتوحة حالياً، لكن يسعدنا دائماً التعرّف على منسّقي أزهار ومصمّمين ومهندسي تطبيقات وأخصائيي خدمة كونسيرج يناسبون فريقنا.",
    generalPitch:
      "حدّثنا قليلاً عن نفسك، وعمّا تودّ العمل عليه، وأين تقيم.",
    applyHeading: "تواصل معنا",
    applyBody:
      "أرسل لنا سيرتك الذاتية مع رسالة قصيرة. نقرأ كل بريد ونردّ خلال أسبوع.",
    applyCta: "أرسل سيرتك الذاتية",
    applySubject: "الانضمام إلى بريزانتيل",
  },
  fr: {
    eyebrow: "Carrières chez Presentail",
    title: "Construisez la plus belle expérience cadeau de la région.",
    intro:
      "Nous sommes une petite équipe de fleuristes, chocolatiers, designers et ingénieurs basée entre Beyrouth, Dubaï et Limassol. Si vous aimez le savoir-faire, le service attentionné et livrer des produits qui ravissent les gens dans leurs meilleurs (et plus difficiles) moments, nous serions ravis d'échanger.",
    perksHeading: "Ce que c'est de travailler ici",
    perks: [
      {
        title: "Une vraie autonomie",
        body: "Petite équipe, boucles de retour courtes. Votre travail atteint de vrais clients en quelques jours, pas en trimestres.",
      },
      {
        title: "Une culture d'atelier",
        body: "Nous travaillons depuis de beaux espaces aux côtés des fleuristes et artisans avec qui nous collaborons — pas depuis un bureau anonyme.",
      },
      {
        title: "Dans trois marchés",
        body: "Liban, Émirats arabes unis et Chypre aujourd'hui — et d'autres à venir. Les déplacements entre studios sont encouragés.",
      },
    ],
    openingsHeading: "Postes ouverts",
    noOpenings:
      "Nous n'avons pas de postes spécifiques ouverts pour le moment, mais nous serons toujours ravis de rencontrer des fleuristes, designers, ingénieurs mobiles et spécialistes conciergerie qui pourraient nous rejoindre.",
    generalPitch:
      "Parlez-nous un peu de vous, de ce sur quoi vous aimeriez travailler, et d'où vous êtes basé(e).",
    applyHeading: "Contactez-nous",
    applyBody:
      "Envoyez-nous votre CV et un court message. Nous lisons chaque email et répondons sous une semaine.",
    applyCta: "Envoyez-nous votre CV",
    applySubject: "Rejoindre Presentail",
  },
};

export default function Careers() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;
  const mailto = `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(c.applySubject)}`;

  return (
    <div className="bg-background" data-testid="careers-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="careers-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {c.intro}
        </p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.perksHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.perks.map((p) => (
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
        <h2 className="text-2xl md:text-3xl font-serif mb-6">
          {c.openingsHeading}
        </h2>
        <div
          className="rounded-lg border border-dashed border-border p-6 bg-card/50"
          data-testid="careers-no-openings"
        >
          <p className="text-muted-foreground leading-relaxed mb-3">
            {c.noOpenings}
          </p>
          <p className="text-sm text-muted-foreground">{c.generalPitch}</p>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.applyHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.applyBody}</p>
          <a href={mailto} data-testid="careers-cta-email">
            <Button variant="secondary">{c.applyCta}</Button>
          </a>
          <p className="mt-4 text-sm opacity-80">{APPLY_EMAIL}</p>
        </div>
      </section>
    </div>
  );
}

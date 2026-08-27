import { useLocale, type Language } from "@/contexts/LocaleContext";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { JobBoardEmbed } from "@/components/careers/JobBoardEmbed";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  perksHeading: string;
  perks: { title: string; body: string }[];
  openingsHeading: string;
  openingsIntro: string;
  jobBoardTitle: string;
  viewAllJobs: string;
  jobBoardUnavailable: string;
  generalPitch: string;
};

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
    openingsIntro:
      "Browse our current openings below and apply directly — or send us a note if nothing quite fits yet.",
    jobBoardTitle: "Presentail open roles",
    viewAllJobs: "View all jobs",
    jobBoardUnavailable:
      "We couldn't load our live job board right now — use the link below to view all open roles, or reach out directly.",
    generalPitch:
      "Tell us a little about yourself, what you'd love to work on, and where you're based.",
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
    openingsIntro:
      "تصفّح وظائفنا المتاحة حالياً أدناه وقدّم طلبك مباشرة — أو راسلنا إذا لم تجد ما يناسبك بعد.",
    jobBoardTitle: "الوظائف المتاحة في بريزانتيل",
    viewAllJobs: "عرض جميع الوظائف",
    jobBoardUnavailable:
      "تعذّر تحميل لوحة الوظائف المباشرة حالياً — استخدم الرابط أدناه لعرض جميع الوظائف المتاحة، أو تواصل معنا مباشرة.",
    generalPitch:
      "حدّثنا قليلاً عن نفسك، وعمّا تودّ العمل عليه، وأين تقيم.",
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
    openingsIntro:
      "Parcourez nos postes ouverts ci-dessous et postulez directement — ou écrivez-nous si rien ne correspond encore tout à fait.",
    jobBoardTitle: "Postes ouverts chez Presentail",
    viewAllJobs: "Voir tous les postes",
    jobBoardUnavailable:
      "Nous n'avons pas pu charger notre offre d'emploi en direct — utilisez le lien ci-dessous pour voir tous les postes ouverts, ou contactez-nous directement.",
    generalPitch:
      "Parlez-nous un peu de vous, de ce sur quoi vous aimeriez travailler, et d'où vous êtes basé(e).",
  },
  el: {
    eyebrow: "Καριέρα στο Presentail",
    title: "Χτίστε την πιο προσεγμένη εμπειρία δώρου στην περιοχή.",
    intro:
      "Είμαστε μια μικρή, πρακτική ομάδα ανθοπωλών, σοκολατοποιών, σχεδιαστών και μηχανικών, μοιρασμένη ανάμεσα σε Βηρυτό, Ντουμπάι και Λεμεσό. Αν νοιάζεστε για την τέχνη, την ευγενική εξυπηρέτηση και το να παραδίδετε πράγματα που χαροποιούν τους ανθρώπους στις καλύτερες (και δυσκολότερες) μέρες τους, θα θέλαμε πολύ να ακούσουμε από εσάς.",
    perksHeading: "Πώς είναι να δουλεύεις εδώ",
    perks: [
      {
        title: "Πραγματική ευθύνη",
        body: "Μικρή ομάδα, σύντομοι κύκλοι ανατροφοδότησης. Η δουλειά σας φτάνει σε πραγματικούς πελάτες μέσα σε μέρες, όχι σε τρίμηνα.",
      },
      {
        title: "Κουλτούρα με το στούντιο πρώτα",
        body: "Δουλεύουμε από όμορφους χώρους δίπλα στους ανθοπώλες και τους δημιουργούς με τους οποίους συνεργαζόμαστε — όχι από ένα απρόσωπο γραφείο.",
      },
      {
        title: "Σε τρεις αγορές",
        body: "Λίβανος, ΗΑΕ και Κύπρος σήμερα — κι άλλες σε ετοιμότητα. Τα ταξίδια μεταξύ των στούντιο ενθαρρύνονται.",
      },
    ],
    openingsHeading: "Ανοιχτές θέσεις",
    openingsIntro:
      "Δείτε τις ανοιχτές θέσεις μας παρακάτω και κάντε αίτηση απευθείας — ή στείλτε μας ένα σημείωμα αν δεν βρείτε κάτι που ταιριάζει ακόμα.",
    jobBoardTitle: "Ανοιχτές θέσεις στο Presentail",
    viewAllJobs: "Δείτε όλες τις θέσεις",
    jobBoardUnavailable:
      "Δεν μπορέσαμε να φορτώσουμε τον πίνακα θέσεων εργασίας αυτή τη στιγμή — χρησιμοποιήστε τον παρακάτω σύνδεσμο για να δείτε όλες τις ανοιχτές θέσεις, ή επικοινωνήστε μαζί μας απευθείας.",
    generalPitch:
      "Πείτε μας λίγα λόγια για εσάς, με τι θα θέλατε να ασχοληθείτε και πού βρίσκεστε.",
  },
};

export default function Careers() {
  const { language, t } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="careers-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: c.eyebrow }]} />
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

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
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
          className="rounded-lg border border-border p-6 bg-card/50 overflow-hidden"
          data-testid="careers-open-roles"
        >
          <p className="text-muted-foreground leading-relaxed mb-4">
            {c.openingsIntro}
          </p>
          <JobBoardEmbed
            title={c.jobBoardTitle}
            viewAllLabel={c.viewAllJobs}
            unavailableMessage={c.jobBoardUnavailable}
          />
          <p className="text-sm text-muted-foreground mt-6">{c.generalPitch}</p>
        </div>
      </section>

    </div>
  );
}

import { Link } from "wouter";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  storyHeading: string;
  story: string[];
  pillarsHeading: string;
  pillars: { title: string; body: string }[];
  ctaHeading: string;
  ctaBody: string;
  ctaShop: string;
  ctaContact: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "About Presentail",
    title: "Gifts that feel like an event, not an errand.",
    intro:
      "Presentail is a luxury flower and gift atelier delivering across Lebanon, the United Arab Emirates, and Cyprus. We exist to make every send feel personal, considered, and beautifully arranged — whether it's a milestone birthday or a quiet thank-you.",
    storyHeading: "Our story",
    story: [
      "We started in Beirut's Gemmayzeh neighbourhood with a simple idea: gifting should be effortless for the sender and unforgettable for the recipient. A dozen years and several borders later, that idea still drives every bouquet we tie and every box we wrap.",
      "Today our florists, chocolatiers, and concierge team work together to source the season's best blooms, partner with the region's most-loved makers, and hand-deliver each gift with the kind of care you'd expect from a maison, not a marketplace.",
    ],
    pillarsHeading: "What we believe",
    pillars: [
      {
        title: "Craft over speed",
        body: "Every arrangement is hand-tied the day it's delivered, by florists who treat each order like their own.",
      },
      {
        title: "Local makers, global standard",
        body: "We partner with the chocolatiers, bakers, and ateliers we'd buy from ourselves — and never compromise on freshness.",
      },
      {
        title: "Real people, ready to help",
        body: "Our concierge is on hand seven days a week to fix the unexpected, suggest the perfect gift, or hand-write a card you can't quite find the words for.",
      },
    ],
    ctaHeading: "Send something thoughtful",
    ctaBody:
      "Browse the season's collection or talk to our concierge about a custom request.",
    ctaShop: "Shop the collection",
    ctaContact: "Talk to concierge",
  },
  ar: {
    eyebrow: "عن بريزانتيل",
    title: "هدايا تشبه الحدث، لا تشبه المهمّة.",
    intro:
      "بريزانتيل أتيليه فاخر للأزهار والهدايا، يوصّل في لبنان والإمارات العربية المتحدة وقبرص. نسعى لأن تكون كل هدية شخصية ومدروسة ومنسّقة بأناقة — سواء كانت لعيد ميلاد مميّز أو لكلمة شكر صغيرة.",
    storyHeading: "قصّتنا",
    story: [
      "بدأنا في حيّ الجميزة ببيروت بفكرة بسيطة: أن يكون إرسال الهدية سهلاً على المُرسِل ولا يُنسى للمُستلم. وبعد أكثر من عشر سنوات وعدّة بلدان، ما زالت تلك الفكرة هي ما يحرّك كل باقة نُنسّقها وكل علبة نُغلّفها.",
      "اليوم يعمل فريقنا من منسّقي الأزهار وصنّاع الشوكولاتة وخدمة الكونسيرج معاً لانتقاء أفضل أزهار الموسم، والتعاون مع أحبّ صنّاع المنطقة، وتسليم كل هدية بأيدينا بعناية تليق بالمَزون لا بالسوق.",
    ],
    pillarsHeading: "ما نؤمن به",
    pillars: [
      {
        title: "الحرفة قبل السرعة",
        body: "تُنسَّق كل باقة في يوم تسليمها، على يد منسّقين يعتنون بكل طلب وكأنه لهم.",
      },
      {
        title: "صنّاع محليّون بمعايير عالمية",
        body: "نتعاون مع صنّاع الشوكولاتة والمخابز والأتيليهات الذين نشتري منهم لأنفسنا — ولا نتنازل أبداً عن النضارة.",
      },
      {
        title: "أشخاص حقيقيّون لخدمتك",
        body: "خدمة الكونسيرج لدينا متاحة سبعة أيام في الأسبوع لحلّ غير المتوقع، أو اقتراح الهدية المثالية، أو كتابة بطاقة لا تجد كلماتها.",
      },
    ],
    ctaHeading: "أرسل شيئاً مدروساً",
    ctaBody:
      "تصفّح مجموعة الموسم أو تحدّث إلى الكونسيرج لطلب مخصّص.",
    ctaShop: "تسوّق المجموعة",
    ctaContact: "تحدّث إلى الكونسيرج",
  },
  fr: {
    eyebrow: "À propos de Presentail",
    title: "Des cadeaux qui ressemblent à un événement, pas à une corvée.",
    intro:
      "Presentail est un atelier de fleurs et de cadeaux de luxe livrant au Liban, aux Émirats arabes unis et à Chypre. Notre mission : faire de chaque envoi un geste personnel, réfléchi et magnifiquement composé — qu'il s'agisse d'un anniversaire marquant ou d'un simple merci.",
    storyHeading: "Notre histoire",
    story: [
      "Nous avons commencé dans le quartier de Gemmayzeh à Beyrouth avec une idée simple : offrir doit être facile pour l'expéditeur et inoubliable pour le destinataire. Une douzaine d'années et plusieurs frontières plus tard, cette idée guide encore chaque bouquet que nous nouons et chaque boîte que nous emballons.",
      "Aujourd'hui, nos fleuristes, chocolatiers et concierges travaillent ensemble pour sélectionner les plus belles fleurs de saison, collaborer avec les artisans les plus aimés de la région, et livrer chaque cadeau en main propre avec le soin d'une maison, pas d'une plateforme.",
    ],
    pillarsHeading: "Ce en quoi nous croyons",
    pillars: [
      {
        title: "Le savoir-faire avant la vitesse",
        body: "Chaque composition est nouée à la main le jour de sa livraison, par des fleuristes qui traitent chaque commande comme la leur.",
      },
      {
        title: "Artisans locaux, standard international",
        body: "Nous collaborons avec les chocolatiers, pâtissiers et ateliers chez qui nous achèterions nous-mêmes — sans jamais transiger sur la fraîcheur.",
      },
      {
        title: "De vraies personnes, prêtes à aider",
        body: "Notre conciergerie est disponible sept jours sur sept pour gérer l'imprévu, suggérer le cadeau idéal, ou écrire à la main une carte dont vous ne trouvez pas les mots.",
      },
    ],
    ctaHeading: "Envoyez quelque chose de réfléchi",
    ctaBody:
      "Parcourez la collection de la saison ou parlez à notre conciergerie pour une demande sur mesure.",
    ctaShop: "Voir la collection",
    ctaContact: "Parler à la conciergerie",
  },
};

export default function About() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="about-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="about-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          {c.intro}
        </p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-4xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-6">
          {c.storyHeading}
        </h2>
        <div className="space-y-4 text-muted-foreground leading-relaxed">
          {c.story.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.pillarsHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.pillars.map((p) => (
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

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.ctaHeading}
          </h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">{c.ctaBody}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/shop">
              <Button
                variant="secondary"
                data-testid="about-cta-shop"
              >
                {c.ctaShop}
              </Button>
            </Link>
            <a
              href="https://wa.me/96181791515"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="about-cta-contact"
            >
              <Button
                variant="outline"
                className="bg-transparent text-primary-foreground border-primary-foreground/40 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                {c.ctaContact}
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

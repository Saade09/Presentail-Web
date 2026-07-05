import { useEffect, useState } from "react";
import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { CITY_NAMES, buildContactSeo } from "@/lib/seo";
import { SEOContentSection } from "@/components/SEOContentSection";
import { Mail, MessageCircle, Phone, MapPin, ArrowRight, ExternalLink } from "lucide-react";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  channelsHeading: string;
  whatsapp: string;
  whatsappDesc: string;
  whatsappResponse: string;
  whatsappBadge: string;
  phone: string;
  phoneDesc: string;
  email: string;
  emailDesc: string;
  emailResponse: string;
  hoursHeading: string;
  hoursBody: string;
  openNow: string;
  closedNow: string;
  addressHeading: string;
  addressBody: string;
  viewOnMaps: string;
  ctaHeading: string;
  ctaBody: string;
  ctaButton: string;
};

const SUPPORT_EMAIL = "hello@presentail.com";
const PHONE_DISPLAY = "+961 3 136 532";
const PHONE_E164 = "+9613136532";
const WHATSAPP_URL = "https://wa.me/9613136532";
const ADDRESS =
  "3rd Floor, Karam w Mwannes, Abdel Wahab El Inglizi St, Achrafieh, Beirut, Lebanon";
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Karam+w+Mwannes+Abdel+Wahab+El+Inglizi+Achrafieh+Beirut+Lebanon";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Contact Us",
    title: "Talk to a real person, fast.",
    intro:
      "Our concierge team is here for orders, deliveries, custom requests and anything in between — every day of the week.",
    channelsHeading: "How to reach us",
    whatsapp: "WhatsApp",
    whatsappDesc: "Fastest way to reach us. Tap to start a chat.",
    whatsappResponse: "Usually within minutes",
    whatsappBadge: "Fastest response",
    phone: "Phone",
    phoneDesc: "Call us directly during business hours.",
    email: "Email",
    emailDesc: "Best for detailed requests or attachments.",
    emailResponse: "Within 24 hours",
    hoursHeading: "Hours",
    hoursBody:
      "Monday – Sunday, 8:00 AM – 12:00 AM (Beirut time). We respond to messages outside hours first thing the next morning.",
    openNow: "Open now",
    closedNow: "Closed",
    addressHeading: "Our office",
    addressBody: ADDRESS,
    viewOnMaps: "View on Maps",
    ctaHeading: "Still have a question?",
    ctaBody: "Our team typically replies within minutes on WhatsApp.",
    ctaButton: "Chat on WhatsApp",
  },
  ar: {
    eyebrow: "تواصل معنا",
    title: "تحدّث مع شخص حقيقي، بسرعة.",
    intro:
      "فريق الكونسيرج لدينا موجود للطلبات والتوصيلات والطلبات الخاصة وأي شيء بينها — كل يوم في الأسبوع.",
    channelsHeading: "كيف نصلك",
    whatsapp: "واتساب",
    whatsappDesc: "أسرع طريقة للتواصل معنا. اضغط لبدء محادثة.",
    whatsappResponse: "عادةً خلال دقائق",
    whatsappBadge: "أسرع رد",
    phone: "الهاتف",
    phoneDesc: "اتصل بنا مباشرة خلال ساعات العمل.",
    email: "البريد الإلكتروني",
    emailDesc: "الأفضل للطلبات التفصيلية أو المرفقات.",
    emailResponse: "خلال 24 ساعة",
    hoursHeading: "ساعات العمل",
    hoursBody:
      "الإثنين – الأحد، 8:00 ص – 12:00 ص (منتصف الليل، بتوقيت بيروت). نردّ على الرسائل خارج الدوام أوّل صباح اليوم التالي.",
    openNow: "مفتوح الآن",
    closedNow: "مغلق",
    addressHeading: "مكتبنا",
    addressBody:
      "الطابق الثالث، كرم ومونّس، شارع عبد الوهاب الإنكليزي، الأشرفية، بيروت، لبنان",
    viewOnMaps: "عرض على الخريطة",
    ctaHeading: "لا تزال لديك سؤال؟",
    ctaBody: "يرد فريقنا عادةً خلال دقائق على واتساب.",
    ctaButton: "تحدّث عبر واتساب",
  },
  fr: {
    eyebrow: "Contactez-nous",
    title: "Parlez à un vrai humain, rapidement.",
    intro:
      "Notre équipe concierge est là pour les commandes, les livraisons, les demandes sur mesure et tout le reste — sept jours sur sept.",
    channelsHeading: "Comment nous joindre",
    whatsapp: "WhatsApp",
    whatsappDesc: "Le moyen le plus rapide. Appuyez pour démarrer une discussion.",
    whatsappResponse: "Généralement en quelques minutes",
    whatsappBadge: "Réponse la plus rapide",
    phone: "Téléphone",
    phoneDesc: "Appelez-nous pendant les heures d'ouverture.",
    email: "E-mail",
    emailDesc: "Idéal pour les demandes détaillées ou les pièces jointes.",
    emailResponse: "Sous 24 heures",
    hoursHeading: "Horaires",
    hoursBody:
      "Lundi – dimanche, 8h00 – 00h00 (minuit, heure de Beyrouth). Les messages reçus en dehors des horaires sont traités dès le lendemain matin.",
    openNow: "Ouvert maintenant",
    closedNow: "Fermé",
    addressHeading: "Notre bureau",
    addressBody:
      "3e étage, Karam w Mwannes, rue Abdel Wahab El Inglizi, Achrafieh, Beyrouth, Liban",
    viewOnMaps: "Voir sur Maps",
    ctaHeading: "Vous avez encore une question ?",
    ctaBody: "Notre équipe répond généralement en quelques minutes sur WhatsApp.",
    ctaButton: "Discuter sur WhatsApp",
  },
};

function useBeirutOpen() {
  const [isOpen, setIsOpen] = useState<boolean | null>(null);

  useEffect(() => {
    function check() {
      const now = new Date();
      const beirutTime = new Date(
        now.toLocaleString("en-US", { timeZone: "Asia/Beirut" })
      );
      const hour = beirutTime.getHours();
      const minute = beirutTime.getMinutes();
      const totalMinutes = hour * 60 + minute;
      setIsOpen(totalMinutes >= 8 * 60 && totalMinutes < 24 * 60);
    }
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  return isOpen;
}

export default function Contact() {
  const { language } = useLocale();
  const { cityId, countryCode } = useLocationSelection();
  const c = COPY[language] ?? COPY.en;
  const isOpen = useBeirutOpen();
  const isRtl = language === "ar";
  const cityDisplay = cityId
    ? ((CITY_NAMES[language] ?? CITY_NAMES.en)[cityId] ?? "")
    : "";
  const h1 = buildContactSeo({ lang: language, city: cityDisplay }).title.split(" | ")[0];

  return (
    <div className="bg-background" data-testid="contact-page" lang={language}>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Decorative radial gradient accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(var(--primary) / 0.07) 0%, transparent 70%)",
          }}
        />
        {/* Subtle petal-like SVG motif — top right corner */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 -right-16 w-72 h-72 opacity-[0.06] text-primary"
          viewBox="0 0 200 200"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(0 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(45 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(90 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(135 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(180 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(225 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(270 100 100)" />
          <ellipse cx="100" cy="60" rx="30" ry="55" transform="rotate(315 100 100)" />
        </svg>

        <div className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl relative">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            {c.eyebrow}
          </p>
          {/* Thin decorative rule between eyebrow and title */}
          <div className="w-10 h-px bg-primary/40 mb-5" />
          <h1
            className="text-4xl md:text-6xl font-serif leading-tight mb-6"
            data-testid="contact-title"
          >
            {h1}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
            {c.intro}
          </p>
        </div>
      </section>

      {/* ── Channel cards ───────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-content">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.channelsHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {/* WhatsApp — highlighted card */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative rounded-xl border border-green-200 dark:border-green-900 p-6 bg-card hover:bg-green-50/60 dark:hover:bg-green-950/30 transition-colors"
            data-testid="contact-whatsapp"
          >
            {/* Fastest response badge */}
            <span className="absolute top-4 end-4 inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-green-700 dark:text-green-300">
              {c.whatsappBadge}
            </span>
            {/* Green-tinted icon background */}
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
              <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </span>
            <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
              <h3 className="font-serif text-lg">{c.whatsapp}</h3>
              <ArrowRight
                className={`h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 ${isRtl ? "rotate-180 -translate-x-1 group-hover:translate-x-0" : "translate-x-0 group-hover:translate-x-1"}`}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1 mb-2">
              {c.whatsappDesc}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-3">
              {c.whatsappResponse}
            </p>
            <p className="text-sm font-medium">{PHONE_DISPLAY}</p>
          </a>

          {/* Phone */}
          <a
            href={`tel:${PHONE_E164}`}
            className="group rounded-xl border border-border p-6 bg-card hover:bg-muted/40 transition-colors"
            data-testid="contact-phone"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-4">
              <Phone className="h-5 w-5 text-primary" />
            </span>
            <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
              <h3 className="font-serif text-lg">{c.phone}</h3>
              <ArrowRight
                className={`h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 ${isRtl ? "rotate-180 -translate-x-1 group-hover:translate-x-0" : "translate-x-0 group-hover:translate-x-1"}`}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1 mb-3">{c.phoneDesc}</p>
            <p className="text-sm font-medium">{PHONE_DISPLAY}</p>
          </a>

          {/* Email */}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="group rounded-xl border border-border p-6 bg-card hover:bg-muted/40 transition-colors"
            data-testid="contact-email"
          >
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-4">
              <Mail className="h-5 w-5 text-primary" />
            </span>
            <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
              <h3 className="font-serif text-lg">{c.email}</h3>
              <ArrowRight
                className={`h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-200 ${isRtl ? "rotate-180 -translate-x-1 group-hover:translate-x-0" : "translate-x-0 group-hover:translate-x-1"}`}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-1 mb-2">{c.emailDesc}</p>
            <p className="text-xs text-muted-foreground font-medium mb-3">
              {c.emailResponse}
            </p>
            <p className="text-sm font-medium break-all">{SUPPORT_EMAIL}</p>
          </a>
        </div>
      </section>

      {/* ── Hours + Address ──────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 pb-16 md:pb-20 max-w-content">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Hours card with live open/closed pill */}
          <div className="rounded-xl border border-border p-6 bg-card">
            <div className={`flex items-center gap-3 mb-3 ${isRtl ? "flex-row-reverse" : ""}`}>
              <h3 className="font-serif text-lg">{c.hoursHeading}</h3>
              {isOpen !== null && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isOpen
                      ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                      : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-500" : "bg-amber-500"}`}
                  />
                  {isOpen ? c.openNow : c.closedNow}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {c.hoursBody}
            </p>
          </div>

          {/* Address card with Maps link */}
          <div className="rounded-xl border border-border p-6 bg-card">
            <div className={`flex items-start gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
              <MapPin className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="font-serif text-lg mb-2">{c.addressHeading}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  {c.addressBody}
                </p>
                <a
                  href={MAPS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline ${isRtl ? "flex-row-reverse" : ""}`}
                >
                  {c.viewOnMaps}
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing CTA strip ───────────────────────────────────────────── */}
      <section
        className="w-full"
        style={{
          background:
            "radial-gradient(ellipse 100% 200% at 50% 100%, hsl(var(--primary) / 0.06) 0%, transparent 70%)",
        }}
      >
        <div
          className={`container mx-auto px-4 py-16 md:py-20 max-w-content flex flex-col items-center text-center gap-6 ${isRtl ? "rtl" : ""}`}
        >
          <h2 className="text-3xl md:text-4xl font-serif">{c.ctaHeading}</h2>
          <p className="text-muted-foreground max-w-md leading-relaxed">{c.ctaBody}</p>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2.5 rounded-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold px-7 py-3.5 transition-colors shadow-sm ${isRtl ? "flex-row-reverse" : ""}`}
          >
            <MessageCircle className="h-5 w-5 flex-shrink-0" />
            {c.ctaButton}
          </a>
        </div>
      </section>

      <SEOContentSection
        pageType="contact"
        cityLabel={cityDisplay}
        lang={language}
        countryCode={countryCode ?? ""}
        suppressFaqJsonLd
      />
    </div>
  );
}

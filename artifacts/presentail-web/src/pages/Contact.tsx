import { useLocale, type Language } from "@/contexts/LocaleContext";
import { Mail, MessageCircle, Phone, MapPin } from "lucide-react";

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  channelsHeading: string;
  whatsapp: string;
  whatsappDesc: string;
  phone: string;
  phoneDesc: string;
  email: string;
  emailDesc: string;
  hoursHeading: string;
  hoursBody: string;
  addressHeading: string;
  addressBody: string;
};

const SUPPORT_EMAIL = "concierge@presentail.com";
const PHONE_DISPLAY = "+961 81 392 194";
const PHONE_E164 = "+96181392194";
const WHATSAPP_URL = "https://wa.me/96181392194";
const ADDRESS =
  "3rd Floor, Karam w Mwannes, Abdel Wahab El Inglizi St, Achrafieh, Beirut, Lebanon";

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Contact Us",
    title: "Talk to a real person, fast.",
    intro:
      "Our concierge team is here for orders, deliveries, custom requests and anything in between — every day of the week.",
    channelsHeading: "How to reach us",
    whatsapp: "WhatsApp",
    whatsappDesc: "Fastest way to reach us. Tap to start a chat.",
    phone: "Phone",
    phoneDesc: "Call us directly during business hours.",
    email: "Email",
    emailDesc: "Best for detailed requests or attachments.",
    hoursHeading: "Hours",
    hoursBody:
      "Monday – Sunday, 8:00 AM – 10:00 PM (Beirut time). We respond to messages outside hours first thing the next morning.",
    addressHeading: "Our office",
    addressBody: ADDRESS,
  },
  ar: {
    eyebrow: "تواصل معنا",
    title: "تحدّث مع شخص حقيقي، بسرعة.",
    intro:
      "فريق الكونسيرج لدينا موجود للطلبات والتوصيلات والطلبات الخاصة وأي شيء بينها — كل يوم في الأسبوع.",
    channelsHeading: "كيف نصلك",
    whatsapp: "واتساب",
    whatsappDesc: "أسرع طريقة للتواصل معنا. اضغط لبدء محادثة.",
    phone: "الهاتف",
    phoneDesc: "اتصل بنا مباشرة خلال ساعات العمل.",
    email: "البريد الإلكتروني",
    emailDesc: "الأفضل للطلبات التفصيلية أو المرفقات.",
    hoursHeading: "ساعات العمل",
    hoursBody:
      "الإثنين – الأحد، 8:00 ص – 10:00 م (بتوقيت بيروت). نردّ على الرسائل خارج الدوام أوّل صباح اليوم التالي.",
    addressHeading: "مكتبنا",
    addressBody:
      "الطابق الثالث، كرم ومونّس، شارع عبد الوهاب الإنكليزي، الأشرفية، بيروت، لبنان",
  },
  fr: {
    eyebrow: "Contactez-nous",
    title: "Parlez à un vrai humain, rapidement.",
    intro:
      "Notre équipe concierge est là pour les commandes, les livraisons, les demandes sur mesure et tout le reste — sept jours sur sept.",
    channelsHeading: "Comment nous joindre",
    whatsapp: "WhatsApp",
    whatsappDesc: "Le moyen le plus rapide. Appuyez pour démarrer une discussion.",
    phone: "Téléphone",
    phoneDesc: "Appelez-nous pendant les heures d'ouverture.",
    email: "E-mail",
    emailDesc: "Idéal pour les demandes détaillées ou les pièces jointes.",
    hoursHeading: "Horaires",
    hoursBody:
      "Lundi – dimanche, 8h00 – 22h00 (heure de Beyrouth). Les messages reçus en dehors des horaires sont traités dès le lendemain matin.",
    addressHeading: "Notre bureau",
    addressBody:
      "3e étage, Karam w Mwannes, rue Abdel Wahab El Inglizi, Achrafieh, Beyrouth, Liban",
  },
};

export default function Contact() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="contact-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="contact-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.channelsHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border p-6 bg-card hover:bg-muted/40 transition-colors"
            data-testid="contact-whatsapp"
          >
            <MessageCircle className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-serif text-lg mb-1">{c.whatsapp}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {c.whatsappDesc}
            </p>
            <p className="text-sm font-medium">{PHONE_DISPLAY}</p>
          </a>

          <a
            href={`tel:${PHONE_E164}`}
            className="rounded-lg border border-border p-6 bg-card hover:bg-muted/40 transition-colors"
            data-testid="contact-phone"
          >
            <Phone className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-serif text-lg mb-1">{c.phone}</h3>
            <p className="text-sm text-muted-foreground mb-3">{c.phoneDesc}</p>
            <p className="text-sm font-medium">{PHONE_DISPLAY}</p>
          </a>

          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="rounded-lg border border-border p-6 bg-card hover:bg-muted/40 transition-colors"
            data-testid="contact-email"
          >
            <Mail className="h-6 w-6 mb-3 text-primary" />
            <h3 className="font-serif text-lg mb-1">{c.email}</h3>
            <p className="text-sm text-muted-foreground mb-3">{c.emailDesc}</p>
            <p className="text-sm font-medium break-all">{SUPPORT_EMAIL}</p>
          </a>
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-5xl">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-border p-6 bg-card">
            <h3 className="font-serif text-lg mb-3">{c.hoursHeading}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {c.hoursBody}
            </p>
          </div>
          <div className="rounded-lg border border-border p-6 bg-card">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 mt-0.5 text-primary flex-shrink-0" />
              <div>
                <h3 className="font-serif text-lg mb-3">{c.addressHeading}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {c.addressBody}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

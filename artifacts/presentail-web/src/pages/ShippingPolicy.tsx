import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";

// i18n-ignore — legal policy page; content is EN-authoritative with AR/FR summaries
const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
};

const TITLE: Record<Language, string> = {
  en: "Shipping & Delivery Policy",
  ar: "سياسة الشحن والتوصيل",
  fr: "Politique d'expédition et de livraison",
};

const INTRO_NOTE: Record<Language, string> = {
  en: "We strive to deliver your gifts on time and in perfect condition. Please read our delivery policy carefully before placing your order.",
  ar: "نسعى جاهدين لتوصيل هداياك في الوقت المحدد وبحالة ممتازة. يرجى قراءة سياسة التوصيل بعناية قبل تقديم طلبك.",
  fr: "Nous nous efforçons de livrer vos cadeaux à temps et en parfait état. Veuillez lire attentivement notre politique de livraison avant de passer votre commande.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Delivery Zones",
    body: [
      "Presentail currently delivers to the following markets:",
      {
        subheading: "Markets",
        body: [
          "Lebanon — Beirut and most Lebanese governorates. Remote areas may require additional lead time.",
          "United Arab Emirates — Dubai and Abu Dhabi.",
          "Cyprus — Nicosia and major urban areas.",
        ],
      },
      "Delivery availability is confirmed at checkout based on your selected city and delivery address.",
    ],
  },
  {
    heading: "Same-Day & Scheduled Delivery",
    body: [
      "Presentail offers same-day delivery on most orders placed before the cut-off time shown at checkout (typically 2:00 PM local time). Orders placed after the cut-off are automatically scheduled for the next available delivery slot.",
      "At checkout you may choose a specific delivery date and, where available, a preferred time window (morning or afternoon). We will do our best to honour your preference, but exact delivery times cannot be guaranteed due to traffic, weather, and vendor preparation times.",
      "For wedding, corporate, and large-volume orders, please contact our team at least 48 hours in advance to confirm availability and scheduling.",
    ],
  },
  {
    heading: "Delivery Fees",
    body: [
      "Delivery fees are calculated at checkout based on your selected city and order value. Free delivery thresholds may apply in certain markets — the applicable threshold is displayed on the checkout page.",
      "During peak periods (Valentine's Day, Mother's Day, and similar occasions) or for deliveries to remote areas, an additional fee may apply. This will always be shown clearly before you confirm your order.",
    ],
  },
  {
    heading: "Recipient Availability",
    body: [
      "Please ensure that the recipient is available at the delivery address on the chosen date. Our delivery partners will attempt to contact the recipient before arrival.",
      "If the recipient is unavailable and cannot be reached, we will make one re-delivery attempt. If the second attempt also fails, the order may be returned and a re-delivery fee may apply.",
      "For surprise deliveries, please ensure that someone at the address will be able to accept the order on behalf of the recipient.",
    ],
  },
  {
    heading: "Perishable & Fresh Products",
    body: [
      "Flowers, cakes, chocolates, and other fresh or perishable items must be kept in an appropriate environment after delivery. Presentail is not responsible for the condition of these items after they have been successfully delivered.",
      "If you believe there is a quality issue with your order at the time of delivery, please photograph the items and contact our support team within 24 hours of delivery.",
    ],
  },
  {
    heading: "Contact Us",
    body: [
      "If you have any questions about your delivery, please reach out to our customer support team via the Contact page on our website or through our WhatsApp channel. We are happy to help you track your order or reschedule a delivery.",
    ],
  },
];

export default function ShippingPolicy() {
  const { language } = useLocale();
  return (
    <LegalPage
      eyebrow={EYEBROW[language]}
      title={TITLE[language]}
      intro={<p>{INTRO_NOTE[language]}</p>}
      testId="shipping-policy-page"
      lang={language}
      sections={SECTIONS}
    />
  );
}

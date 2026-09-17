import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

// i18n-ignore — legal policy page; content is EN-authoritative with AR/FR summaries
const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
  el: "Νομικά",
};

const TITLE: Record<Language, string> = {
  en: "Shipping & Delivery Policy",
  ar: "سياسة الشحن والتوصيل",
  fr: "Politique d'expédition et de livraison",
  el: "Πολιτική Αποστολής & Παράδοσης",
};

const INTRO_NOTE: Record<Language, string> = {
  en: "We strive to deliver your gifts on time and in perfect condition. Please read our delivery policy carefully before placing your order.",
  ar: "نسعى جاهدين لتوصيل هداياك في الوقت المحدد وبحالة ممتازة. يرجى قراءة سياسة التوصيل بعناية قبل تقديم طلبك.",
  fr: "Nous nous efforçons de livrer vos cadeaux à temps et en parfait état. Veuillez lire attentivement notre politique de livraison avant de passer votre commande.",
  el: "Καταβάλλουμε κάθε προσπάθεια να παραδίδουμε τα δώρα σας εγκαίρως και σε άριστη κατάσταση. Παρακαλούμε διαβάστε προσεκτικά την πολιτική παράδοσής μας πριν υποβάλετε την παραγγελία σας.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Local Fulfilment & Delivery Method",
    body: [
      "Presentail fulfils orders locally in each supported market. Orders are prepared by Presentail and delivered by Presentail couriers or vetted local delivery partners.",
      "We hand-deliver each order to the delivery address supplied at checkout. We do not use postal services or air freight for Presentail deliveries.",
      {
        subheading: "Supported markets",
        body: [
          "Local fulfilment and delivery availability vary by market and delivery address. Presentail currently supports Lebanon, the United Arab Emirates, and Cyprus.",
        ],
      },
      "The available products, dates, delivery windows, and fees are confirmed at checkout for the selected market and address.",
    ],
  },
  {
    heading: "Cyprus Same-Day & Scheduled Delivery",
    body: [
      "For qualifying Cyprus orders, same-day delivery is available when the order is placed before 9:00 AM Cyprus local time. Orders placed after the 9:00 AM cutoff may be delivered the next day, subject to availability.",
      "The verified Cyprus delivery operating window is 9:00 AM to 6:00 PM Cyprus local time. Availability can vary by delivery address and date, so the delivery options shown at checkout are the current options for your order.",
      "Checkout supports the available future delivery dates and delivery windows. Select the date shown at checkout before payment; an exact delivery time cannot be guaranteed because traffic, weather, preparation, and access conditions can affect delivery.",
      "For wedding, corporate, and large-volume orders, please contact our team at least 48 hours in advance to confirm availability and scheduling.",
    ],
  },
  {
    heading: "Delivery Fees",
    body: [
      "Delivery fees are address-based. They are calculated at checkout for the supplied delivery address and shown clearly before you make payment.",
      "The fee shown can vary by market, delivery address, date, and available delivery option. Any applicable free-delivery threshold or additional charge is displayed before you confirm the order.",
    ],
  },
  {
    heading: "Recipient Availability",
    body: [
      "Please provide an accurate address and a working recipient phone number, and make sure that someone can receive the order during the selected delivery window. Our courier or local delivery partner will contact the recipient to arrange delivery.",
      "If the recipient cannot be reached, our team will try to contact the order placer to coordinate delivery. We will not deliver to a different address unless an alternative address has been provided and agreed. If no suitable arrangement can be made after attempts to contact you or the recipient, Presentail may cancel the order in line with the Terms of Use; a refund or Presentail credit will be handled according to those terms.",
      "For surprise deliveries, please ensure that someone at the supplied address can accept the order on the recipient's behalf.",
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
  const { language, t } = useLocale();
  return (
    <LegalPage
      eyebrow={EYEBROW[language]}
      title={TITLE[language]}
      intro={<p>{INTRO_NOTE[language]}</p>}
      testId="shipping-policy-page"
      lang={language}
      sections={SECTIONS}
      breadcrumb={<PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: TITLE[language] }]} />}
    />
  );
}

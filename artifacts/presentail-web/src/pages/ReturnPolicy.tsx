import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

// i18n-ignore — legal policy page; content is EN-authoritative with AR/FR summaries
const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
};

const TITLE: Record<Language, string> = {
  en: "Return & Refund Policy",
  ar: "سياسة الإرجاع والاسترداد",
  fr: "Politique de retour et de remboursement",
};

const INTRO_NOTE: Record<Language, string> = {
  en: "Customer satisfaction is our top priority. Please review our return and refund policy before placing your order.",
  ar: "رضا العملاء هو أولويتنا القصوى. يرجى مراجعة سياسة الإرجاع والاسترداد قبل تقديم طلبك.",
  fr: "La satisfaction de nos clients est notre priorité absolue. Veuillez consulter notre politique de retour et de remboursement avant de passer votre commande.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "General Policy",
    body: [
      "Due to the perishable and personalised nature of most of our products — including fresh flowers, cakes, chocolates, and custom gift arrangements — we are generally unable to accept returns or process refunds once an order has been delivered.",
      "We inspect every order carefully before dispatch and work with our vendor partners to maintain the highest quality standards. However, if you receive an order that does not meet our quality standards, we are committed to making it right.",
    ],
  },
  {
    heading: "Reporting a Quality Issue",
    body: [
      "If you believe there is a quality issue with your delivered order, you must contact our customer support team within 24 hours of delivery. Claims submitted after this window cannot be processed.",
      "To process your claim, please provide:",
      {
        subheading: "Required information",
        body: [
          "Your order number.",
          "Clear photographs of the items received, showing the quality issue.",
          "A brief description of the problem.",
        ],
      },
      "You can reach us via the Contact page on our website or through our WhatsApp support channel. Our team will review your claim within one business day.",
    ],
  },
  {
    heading: "Resolutions",
    body: [
      "Depending on the nature and severity of the quality issue, we will offer one or more of the following resolutions at our discretion:",
      {
        subheading: "Resolution options",
        body: [
          "Replacement delivery — we will arrange a replacement order at no additional charge.",
          "Partial or full store credit — issued to your account for use on a future order.",
          "Partial or full refund — processed to your original payment method within 5–10 business days, subject to payment provider timelines.",
        ],
      },
      "We reserve the right to request additional information before approving a resolution.",
    ],
  },
  {
    heading: "Order Cancellations",
    body: [
      "Cancellations are only accepted if the request is made before the order has been dispatched for delivery. Once an order is out for delivery, cancellation is no longer possible.",
      "To request a cancellation, please contact our support team immediately after placing your order. We will confirm whether cancellation is still possible based on the current preparation status.",
      "Orders cancelled within the eligible window will be refunded to the original payment method within 5–10 business days.",
    ],
  },
  {
    heading: "Non-Returnable Items",
    body: [
      "The following items cannot be returned or refunded unless there is a quality issue:",
      {
        subheading: "Non-returnable items",
        body: [
          "Fresh flowers and floral arrangements.",
          "Cakes, chocolates, Arabic sweets, and other food items.",
          "Personalised or custom-engraved products.",
          "Items that have been used or altered after delivery.",
        ],
      },
    ],
  },
  {
    heading: "Contact Us",
    body: [
      "For any questions about our return and refund policy, or to submit a quality claim, please visit our Contact page or reach out via WhatsApp. Our support team is available seven days a week to assist you.",
    ],
  },
];

export default function ReturnPolicy() {
  const { language, t } = useLocale();
  return (
    <LegalPage
      eyebrow={EYEBROW[language]}
      title={TITLE[language]}
      intro={<p>{INTRO_NOTE[language]}</p>}
      testId="return-policy-page"
      lang={language}
      sections={SECTIONS}
      breadcrumb={<PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: TITLE[language] }]} />}
    />
  );
}

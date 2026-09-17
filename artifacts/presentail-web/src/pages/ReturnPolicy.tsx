import { useLocale, type Language } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
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
  en: "Return & Refund Policy",
  ar: "سياسة الإرجاع والاسترداد",
  fr: "Politique de retour et de remboursement",
  el: "Πολιτική Επιστροφών & Αποζημιώσεων",
};

const INTRO_NOTE: Record<Language, string> = {
  en: "Customer satisfaction is our top priority. Please review our return and refund policy before placing your order.",
  ar: "رضا العملاء هو أولويتنا القصوى. يرجى مراجعة سياسة الإرجاع والاسترداد قبل تقديم طلبك.",
  fr: "La satisfaction de nos clients est notre priorité absolue. Veuillez consulter notre politique de retour et de remboursement avant de passer votre commande.",
  el: "Η ικανοποίηση των πελατών μας είναι η ύψιστη προτεραιότητά μας. Παρακαλούμε ελέγξτε την πολιτική επιστροφών και αποζημιώσεων πριν υποβάλετε την παραγγελία σας.",
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

// Cyprus storefront copy is intentionally kept separate from the shared
// policy. The Cyprus entry point is required for local regulatory review, but
// the existing Lebanon/UAE customer experience must remain unchanged.
const CYPRUS_INTRO_NOTE: Record<Language, string> = {
  en: "This returns and refund policy applies to orders delivered in Cyprus. Please review it before placing your order.",
  ar: "تنطبق سياسة الإرجاع والاسترداد هذه على الطلبات التي يتم توصيلها في قبرص. يرجى مراجعتها قبل تقديم طلبك.",
  fr: "Cette politique de retour et de remboursement s'applique aux commandes livrées à Chypre. Veuillez la consulter avant de passer votre commande.",
  el: "Αυτή η πολιτική επιστροφών και αποζημιώσεων ισχύει για παραγγελίες που παραδίδονται στην Κύπρο. Παρακαλούμε ελέγξτε την πριν υποβάλετε την παραγγελία σας.",
};

const CYPRUS_SECTIONS: LegalSection[] = [
  {
    heading: "Perishable goods and statutory withdrawal",
    body: [
      "Fresh flowers and other qualifying perishable goods can deteriorate or expire rapidly. Where the applicable rapid-deterioration exemption applies, the statutory right of withdrawal under applicable EU and Cyprus consumer rules does not apply to those goods.",
      "This statement is limited to the applicable rapid-deterioration exemption and does not make any broader claim about your mandatory consumer rights.",
    ],
  },
  {
    heading: "Freshness and quality complaints",
    body: [
      "If you have a freshness or quality concern with an order delivered in Cyprus, please contact us within 24 hours after delivery. Please provide your order number, clear photographs showing the issue, and a short description so our team can assess the complaint.",
      "Complaints are reviewed based on the order and the evidence provided. The 24-hour window and photographs help us assess the condition of perishable goods promptly.",
    ],
  },
  {
    heading: "Possible resolutions",
    body: [
      "Depending on the nature of the complaint, we may offer a replacement, redelivery, or an appropriate partial or full refund. The outcome depends on the details of the complaint; a refund is not automatic for every issue.",
    ],
  },
  {
    heading: "Order cancellations",
    body: [
      "To request a cancellation, contact us as soon as possible and before the order has been dispatched, while preparation has not started. We will confirm whether cancellation is still possible based on the order's current status.",
      "There is no fixed cancellation cut-off stated in this policy. Once preparation or fulfilment has started, cancellation may be unavailable.",
    ],
  },
  {
    heading: "Approved refunds",
    body: [
      "If a card-paid order is approved for a refund, the refund will be returned to the original payment method or card used for the order. Bank and card processing times may vary after Presentail submits the refund.",
    ],
  },
  {
    heading: "Contact us",
    body: [
      "For a Cyprus quality complaint, cancellation request, or question about this policy, email hello@presentail.com or contact us through the Contact page or WhatsApp. Please include your order number.",
    ],
  },
];

export default function ReturnPolicy() {
  const { language, t } = useLocale();
  const { countryCode } = useLocationSelection();
  // Also treat the canonical /cyprus/ URL path as Cyprus-specific regardless of
  // the shopper's stored location — crawlers and first-time visitors do not have
  // a CY location stored, so checking only countryCode would render the generic
  // policy at the canonical Cyprus URL.
  const isCyprus =
    countryCode?.toUpperCase() === "CY" ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/cyprus/"));
  const sections = isCyprus ? CYPRUS_SECTIONS : SECTIONS;
  return (
    <LegalPage
      eyebrow={EYEBROW[language]}
      title={TITLE[language]}
      intro={<p>{isCyprus ? CYPRUS_INTRO_NOTE[language] : INTRO_NOTE[language]}</p>}
      testId="return-policy-page"
      lang={language}
      sections={sections}
      breadcrumb={<PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: TITLE[language] }]} />}
    />
  );
}

import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

// i18n-ignore — store-compliance page; content is EN-authoritative with AR/FR summaries
const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
  el: "Νομικά",
};

const TITLE: Record<Language, string> = {
  en: "Account Deletion Policy",
  ar: "سياسة حذف الحساب",
  fr: "Politique de suppression de compte",
  el: "Πολιτική Διαγραφής Λογαριασμού",
};

const INTRO: Record<Language, string> = {
  en: "This page explains how to request the deletion of your Presentail account and what happens to your data. The in-app flow is available to all registered users.",
  ar: "توضّح هذه الصفحة كيفية طلب حذف حسابك في Presentail وما يحدث لبياناتك. تتوفر خاصية الحذف داخل التطبيق لجميع المستخدمين المسجّلين.",
  fr: "Cette page explique comment demander la suppression de votre compte Presentail et ce qui arrive à vos données. Le parcours de suppression est disponible dans l'application pour tous les utilisateurs inscrits.",
  el: "Αυτή η σελίδα εξηγεί πώς να ζητήσετε τη διαγραφή του λογαριασμού σας στο Presentail και τι συμβαίνει με τα δεδομένα σας. Η διαδικασία εντός της εφαρμογής είναι διαθέσιμη σε όλους τους εγγεγραμμένους χρήστες.",
};

const META: Record<Language, { label: string; value: string }[]> = {
  en: [{ label: "Last Modified", value: "August 6, 2026" }],
  ar: [{ label: "آخر تعديل", value: "August 6, 2026" }],
  fr: [{ label: "Dernière modification", value: "6 août 2026" }],
  el: [{ label: "Τελευταία τροποποίηση", value: "6 Αυγούστου 2026" }],
};

const HOME_LABEL: Record<Language, string> = {
  en: "Home",
  ar: "الرئيسية",
  fr: "Accueil",
  el: "Αρχική",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "How to Delete Your Account",
    body: [
      "You can delete your Presentail account at any time directly from within the app or website, without needing to contact support.",
      {
        subheading: "Delete via the mobile app",
        body: [
          [
            "Open the Presentail app on your iOS or Android device.",
            "Tap the Account tab (bottom navigation).",
            "Tap Personal Information.",
            "Scroll to the bottom and tap Delete Account.",
            "Confirm the deletion when prompted.",
          ],
        ],
      },
      {
        subheading: "Delete via the website",
        body: [
          [
            "Sign in at presentail.com.",
            "Go to My Account → Personal Information.",
            "Click Delete Account at the bottom of the page.",
            "Confirm the deletion when prompted.",
          ],
        ],
      },
      {
        subheading: "Request by email",
        body: [
          "If you are unable to access the in-app or website flow, you may email us at privacy@presentail.com with the subject line \"Account Deletion Request\". Include the email address associated with your account. We will process your request and confirm by email.",
        ],
      },
    ],
  },
  {
    heading: "What Data Is Deleted",
    body: [
      "When your deletion request is confirmed, the following personal data will be erased from our systems:",
      {
        subheading: "Data that is deleted",
        body: [
          [
            "Your name, email address, phone number, and profile information.",
            "Saved delivery addresses.",
            "Saved payment methods (tokens held with payment providers are revoked).",
            "Personalised occasion notes, gift messages, and recipient records.",
            "Marketing preferences and push-notification tokens.",
            "Your account credentials and login history.",
          ],
        ],
      },
      {
        subheading: "Data that is retained",
        body: [
          "We are required by law and legitimate business interests to retain certain data even after account deletion:",
          [
            "Completed order records (for accounting, tax, and fraud-prevention purposes) — retained for up to 7 years in accordance with applicable financial regulations.",
            "Transaction logs required to support chargebacks or payment disputes.",
            "Any data that must be kept to comply with a court order or regulatory obligation.",
          ],
          "Retained records are held in a minimised, anonymised, or pseudonymised form wherever possible and are not used for marketing or product personalisation.",
        ],
      },
    ],
  },
  {
    heading: "Processing Timeline",
    body: [
      "After you submit a deletion request through the app, website, or by email, your account will be deactivated immediately. Full erasure of personal data from all our systems — including backups — will be completed within 15 days of the request date.",
      "During this 15-day window your account cannot be accessed or reactivated. If you change your mind, you must contact us at privacy@presentail.com within 24 hours of submitting the request.",
      "Once the erasure is complete you will receive a confirmation email. You will not be able to recover your account, order history, or any data associated with the deleted account. To use Presentail again you will need to create a new account.",
    ],
  },
  {
    heading: "Children's Accounts",
    body: [
      "Presentail does not knowingly create accounts for users under 18 years of age. If you believe a minor's data has been collected, please contact us at privacy@presentail.com and we will delete the relevant data promptly.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "For any questions about account deletion or your data rights, please contact our privacy team:",
      {
        subheading: "Privacy contact",
        body: [
          "Email: privacy@presentail.com",
          "Response time: within 2 business days.",
        ],
      },
      "For full details on how we collect, use, and protect your personal data, please refer to our Privacy Policy at presentail.com/privacy.",
    ],
  },
];

export default function AccountDeletion() {
  const { language } = useLocale();

  return (
    <LegalPage
      eyebrow={EYEBROW[language]}
      title={TITLE[language]}
      intro={INTRO[language]}
      meta={META[language]}
      sections={SECTIONS}
      testId="account-deletion-page"
      lang={language}
      breadcrumb={
        <PageBreadcrumb
          crumbs={[
            { label: HOME_LABEL[language], href: "/" },
            { label: TITLE[language] },
          ]}
        />
      }
    />
  );
}

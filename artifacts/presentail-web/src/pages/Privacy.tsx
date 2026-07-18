import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";

const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
};
const TITLE: Record<Language, string> = {
  en: "Privacy Policy",
  ar: "سياسة الخصوصية",
  fr: "Politique de confidentialité",
};
const INTRO_NOTE: Record<Language, string> = {
  en: "This Privacy Policy explains how Presentail collects, uses and protects your personal information across our website, mobile applications and social channels. The legally binding text below is provided in English.",
  ar: "تشرح سياسة الخصوصية هذه كيف تجمع بريزانتيل معلوماتك الشخصية وتستخدمها وتحميها عبر موقعنا وتطبيقاتنا للهواتف وقنواتنا الاجتماعية. النص القانوني الملزم أدناه متوفّر باللغة الإنكليزية.",
  fr: "Cette Politique de confidentialité explique comment Presentail collecte, utilise et protège vos informations personnelles sur notre site, nos applications mobiles et nos canaux sociaux. Le texte juridiquement contraignant ci-dessous est fourni en anglais.",
};
const META: Record<Language, { label: string; value: string }[]> = {
  en: [
    { label: "Last Modified", value: "December 17, 2025" },
    { label: "Effective Date", value: "August 30, 2019" },
  ],
  ar: [
    { label: "آخر تعديل", value: "December 17, 2025" },
    { label: "تاريخ النفاذ", value: "August 30, 2019" },
  ],
  fr: [
    { label: "Dernière modification", value: "December 17, 2025" },
    { label: "Date d'entrée en vigueur", value: "August 30, 2019" },
  ],
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Privacy Policy",
    body: [
      "Presentail recognizes and respects the importance of maintaining the privacy of our customers, registered members, gift recipients, and users, and has established this Privacy Policy consequently. The information you will find in this Privacy Policy includes:",
      {
        subheading: "What this Policy covers",
        body: [
          [
            "the personal information we may collect from you when you visit our website, respond or subscribe to our emails, use our mobile applications, place orders through social media applications (such as WhatsApp or Facebook Messenger), use our online gifting service or otherwise contact us via telephone, text (SMS), or email.",
            "why we gather information from you.",
            "how we collect it.",
            "how we use it (including with whom we may share it).",
            "the choices you have regarding our use of, and your access to and correction of, personal information you have provided.",
          ],
        ],
      },
      "This Privacy Policy is part of our Terms of Use, which governs the use of our website located at https://presentail.com/. By submitting personal information through the Presentail website or Presentail services, you provide consent to the terms of this Privacy Policy and you expressly consent to the collection, use, and disclosure of your personal information in accordance with this Privacy Policy. If at any point you need us to delete your data, please email us at concierge@presentail.com.",
    ],
  },
  {
    heading: "I. Information We Collect",
    body: [
      "The following information is collected by or on behalf of Presentail:",
      "We may collect, use, store, and share various types of personal information about you. For clarity, we categorize this data as follows:",
      {
        subheading: "Identity Data",
        body: [
          "This includes your first name, last name, maiden name, username or similar identifiers, marital status, title, date of birth, and gender.",
        ],
      },
      {
        subheading: "Contact Data",
        body: [
          "This includes your billing address, delivery address, email address, and phone numbers.",
        ],
      },
      {
        subheading: "Financial Data",
        body: [
          "This includes your bank account information and payment card details. For online debit/credit card transactions, your full card information is securely transmitted to the relevant card provider using industry-standard encryption. With your permission, we may store part of your card information in an encrypted format, and we maintain strict physical, electronic, and procedural safeguards to protect your payment data.",
          "This information is provided directly by you during the purchase process. We collect only what is necessary and required under applicable banking and regulatory laws, both local and international.",
        ],
      },
      {
        subheading: "Transaction Data",
        body: [
          "This includes details of payments you make or receive, as well as information about the products and services you have purchased from Presentail.",
        ],
      },
      {
        subheading: "Technical Data",
        body: [
          "This includes your IP address, personal identifiable information (PII), login details, browser type and version, time zone and location settings, browser plug-in types and versions, operating system, device information, and other technical data related to your interaction with our Platforms.",
        ],
      },
      {
        subheading: "Profile Data",
        body: [
          "This includes your username and password, your purchase history, your interests and preferences, and any feedback or survey responses you provide.",
        ],
      },
      {
        subheading: "Usage Data",
        body: [
          "This includes information on how you navigate and use our Platforms, products, and services.",
        ],
      },
      {
        subheading: "Marketing and Communications Data",
        body: [
          "This includes your preferences regarding marketing communications from us or third parties, as well as your communication settings.",
        ],
      },
      "We do not collect any Special Categories of Personal Data (such as race, ethnicity, religion, health information, sexual orientation, political views, union membership, genetic or biometric data). We also do not collect information regarding criminal convictions or offenses.",
      "It is important that the personal information we hold about you remains accurate and up-to-date. Please notify us of any changes to your personal data during your relationship with Presentail.",
    ],
  },
  {
    heading: "II. Why We Collect Information from You",
    body: [
      {
        subheading: "Direct Interactions",
        body: [
          "You may provide us with your Identity, Contact, and Financial Data by completing forms or communicating with us by mail, phone, email, or other means. This includes personal information you share when you:",
          [
            "Purchase any of our products or services",
            "Create an account on our Platforms",
            "Subscribe to our newsletters or services",
            "Request to receive marketing communications",
            "Enter a contest, promotion, or survey",
            "Send us feedback or contact our support team",
          ],
        ],
      },
      {
        subheading: "Automated Technologies and Third-Party Interactions",
        body: [
          "When you interact with our Platforms, we automatically collect certain Technical Data about your device, browsing behavior, and usage patterns. We gather this information through cookies, server logs, and similar technologies. We may also receive Technical Data about you when you visit other websites that use our cookies.",
          "Presentail and our third-party service providers may use cookies, pixel tags, web beacons, and related tracking tools to provide you with more personalized experiences and to enhance your use of our Platforms.",
        ],
      },
    ],
  },
  {
    heading: "III. Personal Contact Information",
    body: [
      "Presentail may collect the following personal details from users of our Platforms: first name, last name, street address, area and city, phone numbers, email address, and GPS location (collectively referred to as “Personally Identifiable Information” or “PII”).",
      "In addition, Presentail may gather information about your past orders placed through Presentail, your customer service interactions, your chosen recipients, feedback submitted through the Platforms, participation in promotions, and certain social media preferences (such as pages you “Like” or “Recommend”).",
      "Presentail also uses web analytics tools to track and analyze site traffic for advertising and promotional purposes. We may publish or share these statistics with third parties, but any shared data will exclude PII.",
      "Non-Personally Identifiable Information (“Non-PII”) includes aggregated or demographic data and any other information that does not identify you personally. We and our third-party service providers may collect Non-PII such as your MAC address, device type, screen resolution, operating system version, browser type, and demographic information like your general location, gender, or date of birth. We may also aggregate PII in a way that prevents identification of you or any individual for example, using PII to calculate what percentage of users share a specific telephone area code.",
      "IP Addresses are numerical identifiers assigned to your device by your Internet Service Provider (ISP). Your IP Address is automatically collected and stored in our server logs whenever you visit the Platforms, along with timestamps and the specific pages you accessed. Collecting IP Addresses is a common and automatic practice across most websites.",
    ],
  },
  {
    heading: "IV. How We Use Your Information",
    body: [
      "We will only process your personal information when permitted by law. Most commonly, we use your personal data in the following situations:",
      {
        subheading: "Lawful bases for processing",
        body: [
          [
            "When it is necessary to perform a contract we are entering into or have already entered into with you.",
            "When it is required for our legitimate business interests (or those of a third party), provided your rights and interests do not override those interests.",
            "When we must comply with a legal obligation.",
            "To verify your identity as required under banking and financial regulations.",
            "To securely process your Presentail Card transactions.",
            "To prevent fraud, meet legal requirements, and uphold the security and integrity of our services.",
          ],
        ],
      },
      "We generally do not rely on consent as the primary basis for processing your data, except when contacting you with third-party marketing via email or SMS. You may withdraw your consent for such marketing at any time.",
      {
        subheading: "Personally Identifiable Information (PII)",
        body: [
          "Presentail uses PII to create and manage Presentail accounts, communicate with customers about our services, offer additional products, promotions, or special offers, and process payments for purchases made through Presentail. We may also use PII to enforce our Terms of Use and service agreements.",
          "Presentail uses cookies to recognize returning users and enhance your browsing experience. For example, cookies allow the Platforms to display personalized information such as login details, preferred language, country selection, and other data we may collect in the future. Presentail does not sell any collected information to third parties.",
        ],
      },
      {
        subheading: "Sharing of PII",
        body: [
          "We may disclose PII in the following circumstances:",
          [
            "(a) To trusted third-party service providers who support our operations, such as web hosting, analytics, payment processing, order fulfillment, infrastructure services, IT support, email delivery, customer service, and similar functions. This also includes Presentail staff who need the information to process your order.",
            "(b) To identify you to individuals you send content or messages to through the Platforms.",
            "(c) To third-party sponsors of promotions (regardless of who hosts them), or as otherwise stated in the rules of that promotion. You should carefully review the terms of each promotion, as those terms may override parts of this Privacy Policy.",
            "(d) Where the promotion rules conflict with this Privacy Policy, the promotion rules take precedence.",
            "(e) To affiliates or third parties in the event of a reorganization, merger, sale, joint venture, assignment, transfer, or other business change (including bankruptcy) when appropriate.",
          ],
          "Other circumstances include: under applicable law, including laws outside your country of residence; to comply with legal proceedings; in response to requests from public or government authorities, inside or outside your country; to enforce our Terms and Conditions; to protect our business operations or those of our affiliates; to protect our rights, privacy, safety, or property, and that of our affiliates, you, or others; to pursue available legal remedies or reduce potential damages; Gate to Pay, our financial partner, for mandatory identity verification and compliance with financial regulations; Government banking authorities, when required by law.",
          "User-generated content (such as product reviews or social media preferences like “Likes” or “Recommendations”) may be visible to the public. Presentail cannot guarantee the privacy of any PII included in such content.",
          "We ensure that any third party we share your data with is contractually obligated to provide equal or stronger data protection in accordance with this Privacy Policy and applicable data protection laws.",
        ],
      },
      {
        subheading: "Non-Personally Identifiable Information (Non-PII)",
        body: [
          "Since Non-PII does not identify you personally, Presentail may use it for any lawful purpose. We may also share such data with affiliates or third parties. In some cases, we may combine Non-PII with PII (for example, pairing your name with your general geographic location). If combined data can identify you, we treat it as PII.",
        ],
      },
      {
        subheading: "IP Addresses",
        body: [
          "We use IP addresses to evaluate site usage, diagnose server issues, and manage the Platforms. We may also use and disclose IP addresses for the same purposes as PII. Generally, IP addresses, log files, and similar data are treated as Non-PII unless otherwise required by law.",
        ],
      },
      {
        subheading: "Legal Basis for Processing (for users protected by data laws)",
        body: [
          "For individuals covered by relevant data protection laws, our processing of personal information is based on:",
          [
            "The necessity to perform a contract or take steps at your request;",
            "Compliance with a legal obligation;",
            "Our legitimate interests, provided your fundamental rights are not compromised;",
            "Your explicit consent, when required.",
          ],
        ],
      },
      {
        subheading: "Data Retention",
        body: [
          "We retain your personal information only for as long as necessary to fulfill the purposes for which it was collected — including compliance with legal and regulatory requirements across the GCC (Kuwait, Saudi Arabia, UAE, Oman, Bahrain, Qatar), Jordan, Egypt, and the United Kingdom, as well as for the establishment, exercise, or defense of legal claims.",
        ],
      },
    ],
  },
  {
    heading: "V. Order Placement Information",
    body: [
      "Personal information required during the ordering process includes your name, address, phone number, email address, recipient details, and any other data needed to identify you and complete your purchase. This information may be shared with Presentail staff responsible for handling and fulfilling your order.",
      "All Presentail staff are bound by agreements that limit the disclosure and any additional processing of personal information provided to them. Your personal data is used primarily to keep you updated about the status of your order. Your information will not be shared with any of our business partners without your explicit consent. We treat all personal information as confidential and will only disclose it when required by applicable law.",
      "We send marketing communications only to individuals who have specifically opted in to receive such messages.",
    ],
  },
  {
    heading: "VI. AI and Machine Learning",
    body: [
      "Artificial Intelligence (AI) refers to technologies designed to simulate human abilities such as learning, reasoning, and decision-making. Machine learning, a branch of AI, uses algorithms to analyze large amounts of data, identify patterns, and improve performance over time without being explicitly programmed.",
      {
        subheading: "How Presentail May Use AI and Machine Learning",
        body: [
          "We may use AI and machine learning tools in several areas to enhance your experience and support our operations, including:",
          [
            "Customer Support: AI-powered virtual assistants may help provide personalized support, answer questions instantly, and offer efficient, around-the-clock assistance.",
            "Risk Evaluation and Pricing: AI models may analyze data to assess risk and support fair, accurate, and responsible pricing of our services.",
            "Fraud Prevention: AI systems help us detect unusual or suspicious activity, adding an extra layer of protection for your data and transactions.",
            "Marketing and Business Improvement: AI models may study market trends and customer behavior to personalize marketing campaigns and help improve our internal workflows and overall performance.",
          ],
          "AI may also review information such as your card usage and gift-giving history to identify meaningful dates or occasions. Based on this, we may share reminders or notifications with your network (including individuals you have gifted or who have gifted you) to strengthen connections and improve communication.",
        ],
      },
      {
        subheading: "Our Commitment to Responsible AI Use",
        body: [
          "Presentail is dedicated to implementing AI responsibly and ethically. Our approach is built on five core principles:",
          [
            "Privacy & Security: We protect your information using strong security controls and ensure your data is handled responsibly during all AI-related processes.",
            "Fairness: We work to identify and minimize bias, ensuring AI-driven outcomes are fair and consistent for all users.",
            "Transparency: We aim to clearly explain how our AI systems work and how they may affect your experience.",
            "Safety: We prioritize safety and proactively address risks associated with AI technologies.",
            "Accountability: We take responsibility for the decisions and results produced by our AI systems and put processes in place to resolve any issues that may arise.",
          ],
        ],
      },
    ],
  },
  {
    heading: "VII. Transfer of Information",
    body: [
      "We may process or store your personal information through trusted third-party service providers, such as Amazon Web Services (AWS), a global cloud provider headquartered in the United States with data centers in multiple regions, including locations outside the Kingdom of Saudi Arabia.",
      "Any transfer of your data is carried out strictly in compliance with applicable laws and regulations, including the Saudi Personal Data Protection Law (PDPL) and its Implementing Regulations. We ensure that appropriate contractual, technical, and organizational safeguards are implemented to protect your personal data and to maintain its confidentiality, integrity, and availability during all stages of transfer and processing.",
    ],
  },
  {
    heading: "VIII. Protection of Your Information",
    body: [
      "Our Platforms use secure pages when collecting user information, and all sensitive data is stored in an encrypted format. We employ a range of technical and administrative measures to safeguard the confidentiality, integrity, and security of the information stored within our systems. Our servers utilize Secure Sockets Layer (SSL) protocols and encryption technologies compatible with major web browsers, including Microsoft Edge/Internet Explorer, Firefox, Safari, and Chrome.",
    ],
  },
  {
    heading: "IX. How Long is Your Information Stored For",
    body: [
      "We will keep your personal information only for as long as necessary to fulfill the purposes for which it was collected, including meeting any legal, regulatory, tax, accounting, or reporting obligations. We may retain your data for a longer period if a complaint is filed or if we reasonably anticipate potential legal action related to our relationship with you.",
      "To determine the appropriate retention period, we take several factors into account, including the type, quantity, and sensitivity of the personal data; the potential risks associated with unauthorized access or disclosure; the reasons we process the data; whether those objectives can be achieved by other means; and any applicable legal, regulatory, tax, or accounting requirements.",
      "In certain cases, we may anonymize your personal data so it can no longer be linked to you. When anonymized, the information may be used for research or statistical purposes indefinitely without further notice.",
    ],
  },
  {
    heading: "X. Cookie Policy",
    body: [
      "A “cookie” is a small data file that a website sends to your browser and stores on your device. We use cookies primarily to recognize returning customers, users, or registered members, and to enable certain features on our Platforms. As you navigate our Platforms, we also collect browsing and click-stream data such as the pages you visit, the features you use, and how long you stay on each page.",
      "This information does not reveal your identity and cannot be linked to you personally. We use it to support, process, and analyze your purchases; improve your experience on the Platforms; meet legal requirements; and provide personalized or relevant advertising or recommendations, either directly or through third-party partners. We may also use this information internally to enhance our services and performance.",
      "Such data may be shared only with Presentail staff and trusted third parties involved in fulfilling your order, processing your transaction, or analyzing and supporting your use of the Platforms. Cookies do not carry viruses and can only be accessed by the server that originally placed them.",
      "You can adjust your browser settings to block all cookies, block certain cookies, or receive alerts when cookies are being set. However, disabling cookies may cause some parts of the Platforms to function improperly or become inaccessible.",
      "For more details about cookies, you may visit: http://www.allaboutcookies.org",
    ],
  },
  {
    heading: "XI. Ads",
    body: [
      "Advertisements for our products and services may appear on third-party websites across the Internet. Some of these websites and services display ads based on data collected from your prior online behavior.",
      "For example, if you have visited websites related to gift baskets, those websites or services may show you advertisements for our gift baskets. This type of targeted advertising is often referred to as interest-based or online behavioral advertising.",
      "We do not control the third-party websites or services where such advertisements appear, nor do we control how these parties collect or use data regarding your online activities. Any information collected by third parties through cookies or tracking technologies is fully anonymous and does not include personal contact details.",
    ],
  },
  {
    heading: "XII. Marketing",
    body: [
      "We are committed to providing you with the highest level of service. To support this, we may send you information about products, services, discounts, promotions, and campaigns that we believe may be of interest to you.",
      "We may send you marketing communications with your consent. At times, we may also share relevant updates or special-occasion notifications with members of your network specifically, individuals to whom you have sent gifts or from whom you have received gifts through our platforms. If you no longer wish to receive marketing emails or prefer not to participate in our ad-customization program, you may unsubscribe at any time by contacting us via email.",
      "If you would rather not receive notifications related to special occasions within your network such as reminders or updates about individuals with whom you have previously exchanged gifts you may opt out by contacting our customer service team.",
      "We do not sell or rent your personal information to third parties for their own marketing purposes without your explicit consent. However, we may share certain information within your private network those who have sent or received gifts to or from you to enhance your overall experience, offer personalized suggestions, and support meaningful connections. Periodically, your network may receive relevant updates or occasion-based notifications to support these personalized interactions.",
      "We also work with trusted third parties who may collect or receive information from cookies placed by our service on your device. This helps us analyze customer behavior, understand business performance, and attribute marketing traffic directed to our platforms.",
      "Additionally, we may share your information with our staff and third parties involved in processing and delivering your orders and may authorize them to use this information on our behalf. This may include providing tailored offers and facilitating better communication with you and your intended gift recipients.",
      "We require all third parties to uphold strict security standards and to handle your personal data in full compliance with applicable law. These parties are not permitted to use your data for their own purposes and may process it only for the specific functions we authorize and in accordance with our instructions.",
      "We may also disclose your information when necessary to protect our legal rights, prevent harmful conduct, or when we believe in good faith that such action is required to: comply with legal obligations, including applicable laws, governmental directives, court orders, or legal proceedings; or safeguard our property, rights, users, or the public.",
      "This may include sharing information with other companies and organizations for fraud prevention and credit-risk protection.",
    ],
  },
  {
    heading: "XIII. Discovering and Sharing Special Occasions",
    body: [
      "We are committed to providing you with the best possible experience. By accepting our terms and conditions, you acknowledge and consent to our analysis of the card message content you send or receive through our platforms. This analysis allows us to automatically identify meaningful occasions such as birthdays, anniversaries, and other special events to help you celebrate them.",
      "We may share these significant occasions with your private network, which includes individuals who have sent or received gifts to or from you through our platforms, in accordance with applicable data privacy laws and regulations. If, at any time, you wish to stop sharing or receiving such occasion notifications, you may opt out by contacting us via email. Please note that processing an opt-out request may take up to three working days.",
      "Our intention is to strengthen connections and help spread joy among the people who matter to you and who care about you.",
    ],
  },
  {
    heading: "XIV. Account Deletion",
    body: [
      "You may delete your account at any time through the “Personal Information” page on www.presentail.com or via the “Profile” section in our mobile apps. Once your account is deleted, all processed data will be automatically erased. You will not be able to reactivate your account or regain access, and we will not retain or restore any of your data. To make future purchases on Presentail, you will need to create a new account.",
      "After you submit a deletion request, we will process it and deactivate your account. This procedure may take up to 15 days from the date we receive your request.",
      "If you are accessing our platforms from the United Kingdom, this Policy operates in accordance with the Data Protection Act 1998.",
      {
        subheading: "Your data protection rights",
        body: [
          "Under certain circumstances, you may have rights under data protection laws regarding your personal data. These rights include:",
          [
            "The right to be informed: You have the right to receive clear information about how we use your data. This Policy is intended to provide that information.",
            "The right of access: You may request access to the information we hold about you—for example, to verify that we are processing your data in compliance with applicable laws.",
            "The right to rectification: You may request correction of your data if it is inaccurate or incomplete.",
            "The right to erasure: You may request deletion or removal of certain information we hold about you if it is inaccurate, incomplete, or no longer required.",
            "The right to withdraw consent: If we rely on your consent to process your data, you may withdraw that consent at any time. Withdrawing consent does not affect the lawfulness of processing carried out before the withdrawal.",
            "The right to object to processing: You may request that we suspend processing of your personal data when (a) you want us to verify the accuracy of the data; (b) our use of the data is unlawful but you prefer that we restrict it rather than erase it; (c) you need the data retained to establish, exercise, or defend legal claims, even if we no longer require it; (d) you have objected to our use of your data and we must assess whether we have overriding legitimate grounds to continue processing it.",
            "The right to data portability: You may request the transfer of your personal data to you or a third party. We will provide the data in a structured, commonly used, machine-readable format. This right applies only to automated data for which you provided consent or which we used to perform a contract with you.",
          ],
          "To ensure the security of your information, we may request additional details to verify your identity before granting access to your personal data or enabling you to exercise any of the above rights. This is to prevent unauthorized disclosure. We may also contact you for further information to expedite our response.",
          "You will not be charged a fee to access your personal data or exercise your rights unless your request is clearly unfounded, repetitive, or excessive. In such cases, we may charge a reasonable fee or refuse the request.",
          "If you require further details about the legal basis on which we process your personal data, or if you have any additional questions, we encourage you to contact us through our available communication channels. We will respond promptly to your inquiries or feedback.",
        ],
      },
    ],
  },
  {
    heading: "XV. Data Security",
    body: [
      "The security of your personal information is important to us. We employ reputable organizational, technical, and administrative measures to protect the personal data under our control. However, no method of transmitting data over the Internet or storing data can be guaranteed to be 100% secure.",
      "While we take reasonable steps to safeguard personal information once it is received, we cannot guarantee the security of data transmitted to us. For this reason, please refrain from sending sensitive information via email.",
      "If you believe that your interactions with us are no longer secure (for example, if you suspect that the security of an account you hold with us has been compromised), you must notify us immediately of any unauthorized activity by contacting us through the email provided in the “Contact Details” section available across our platforms. Please note that if you choose to notify us by physical mail, our response may take longer.",
      "Certain goods and services we offer may require registration and login processes during which you will create a user ID and password (collectively, the “Password”). You are responsible for maintaining the confidentiality of your Password and for all activities carried out using it, whether or not such actions are authorized by you.",
    ],
  },
  {
    heading: "XVI. Changes To Policy",
    body: [
      "We reserve the right to update or modify our platforms or this Policy at any time without prior notice. Any changes to this Policy will take effect once they are posted. The latest version of this Policy can be found at www.presentail.com.",
      "You are encouraged to review this Policy regularly to stay informed of any updates across our platforms. If you do not agree with any modifications, you must discontinue your use of our platforms. This Policy was last updated on the date shown at the top of this page. Your continued use of our platforms following any updates signifies your acceptance of the revised Policy.",
    ],
  },
  {
    heading: "XVII. Contact Us",
    body: [
      "If you wish to exercise any of the rights mentioned above, or if you have any concerns or additional questions regarding our data privacy policy, please reach out to us at concierge@presentail.com or via the phone numbers listed on www.presentail.com.",
    ],
  },
];

export default function Privacy() {
  const { language, t } = useLocale();
  return (
    <LegalPage
      testId="privacy-page"
      lang={language}
      eyebrow={EYEBROW[language] ?? EYEBROW.en}
      title={TITLE[language] ?? TITLE.en}
      intro={<p>{INTRO_NOTE[language] ?? INTRO_NOTE.en}</p>}
      meta={META[language] ?? META.en}
      sections={SECTIONS}
      breadcrumb={<PageBreadcrumb crumbs={[{ label: t("nav.home"), href: "/" }, { label: TITLE[language] ?? TITLE.en }]} />}
    />
  );
}

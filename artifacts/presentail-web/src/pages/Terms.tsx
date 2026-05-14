import { useLocale, type Language } from "@/contexts/LocaleContext";
import { LegalPage, type LegalSection } from "./legal/LegalPage";

const EYEBROW: Record<Language, string> = {
  en: "Legal",
  ar: "قانوني",
  fr: "Mentions légales",
};
const TITLE: Record<Language, string> = {
  en: "Terms of Use",
  ar: "شروط الاستخدام",
  fr: "Conditions d'utilisation",
};
const INTRO_NOTE: Record<Language, string> = {
  en: "These Terms apply when you use the Presentail website, our mobile applications, and orders placed through our social channels. The legally binding text below is provided in English.",
  ar: "تنطبق هذه الشروط عند استخدامك لموقع بريزانتيل وتطبيقاتنا للهواتف وعند الطلبات عبر قنواتنا الاجتماعية. النص القانوني الملزم أدناه متوفّر باللغة الإنكليزية.",
  fr: "Ces Conditions s'appliquent à votre utilisation du site Presentail, de nos applications mobiles et aux commandes passées via nos canaux sociaux. Le texte juridiquement contraignant ci-dessous est fourni en anglais.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Terms of Use",
    body: [
      "BY ACCESSING AND USING PRESENTAIL AND ITS RELATED SERVICES IN ANY FORM, YOU ACCEPT AND AGREE TO BE BOUND BY AND ABIDE BY THE TERMS AND PROVISION OF THIS AGREEMENT. IN ADDITION, WHEN USING THESE PARTICULAR SERVICES, YOU SHALL BE SUBJECT TO ANY POSTED GUIDELINES OR RULES APPLICABLE TO THESE SERVICES.",
      "Presentail invites you to use all of its available services. These Terms of Use apply when you use the Presentail website and any related mobile applications as well as when you place orders through our social media channels (such as Facebook Messenger or WhatsApp).",
      "The aim of Presentail is to be the online gift shop and delivery platform that connects the Lebanese, both locally and abroad, to some of Lebanon's most famous and recognized brands.",
      "To ensure a safe and enjoyable Presentail experience for all of our users, we have established these Terms of Use. Please read them carefully.",
      "Note: The use of Presentail and its services by minors is permitted (the age of minors depends on where you reside) along with parent and/or guardian supervision.",
      "Presentail is not liable for credit/debit card transactions performed by minors without the consent of a parent or guardian.",
    ],
  },
  {
    heading: "I. Presentail Privacy Policy",
    body: [
      "You agree to Presentail's Privacy Policy, which explains how we collect, use, and protect the personal information that you provide to us.",
    ],
  },
  {
    heading: "II. Disclaimer",
    body: [
      "The entirety of Presentail and its related services are provided “as is” and “as available”.",
      "Presentail disclaims all representations and warranties, express, implied or statutory, not expressly set out in these terms, including the implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
      "In addition, Presentail makes no representation, warranty or guarantee regarding the reliability, timeliness, quality, sustainability, or availability of the services or any services or good requested through the use of the services or that the services will be uninterrupted or free of errors.",
      "Presentail does not guarantee the quality, sustainability, safety or ability of the third party providers, such as the vendors available on our website.",
      "Presentail shall not be responsible or liable for the accuracy, usefulness, or availability of any information transmitted or made available via the site, and shall not be responsible or liable for any error or omissions in that information.",
      "You agree that the entire risk arising out of your use of our services, and any service or good requested in connection therewith, remains solely with you, to the maximum extent permitted under applicable law.",
    ],
  },
  {
    heading: "III. Refund and Cancellation",
    body: [
      "Your satisfaction means everything to us, and we stand behind every flower arrangement and gift with a 100% Customer Satisfaction Guarantee. If you are unhappy with what was delivered for any valid reason, we can arrange a replacement as quickly as possible. Should you choose not to receive a replacement, you may qualify for a partial refund issued as a Presentail coupon, valid for 12 months. In some cases, additional compensation may also be provided. If your order arrives damaged, simply share a photo of the issue so our team can assess the situation and offer the most appropriate solution. Partial refunds may be granted in these cases, though there is no specific timeframe for when the refund will be completed.",
      "For any concerns related to your order, please reach out to Presentail Customer Care, and our team will respond as soon as they can to assist you. We are committed to delivering your order on time; if it arrives more than 4 hours after your selected delivery window, you may contact Customer Care for support.",
      "Please note that this guarantee does not apply when delays are caused by circumstances beyond our control. If the recipient's details were entered incorrectly, Presentail cannot be held responsible for refunds or compensation related to delayed or incorrect deliveries. Presentail is also not liable if the recipient refuses to accept the order. Any refunds processed through a bank will be returned using the same payment method originally used. While we aim to complete refunds promptly, transactions involving the bank may take up to 15 days.",
      "If an order is canceled at least 24 hours before the start of the delivery time slot, or if the recipient refuses the order before sharing their delivery location (meaning the order has not yet been prepared or sent out), Presentail will make every effort to process the cancellation, which may qualify for a full refund.",
      "However, once we receive your request, our team begins preparing and coordinating your arrangement to ensure the highest quality and timely delivery. Because our operations cover multiple regions and preparation starts quickly, canceling an order that is already being processed or prepared can be very challenging, and may not always be possible.",
      "In rare situations, Presentail may need to cancel your order. If this happens, you will receive either a full bank refund or a Presentail credit refund, depending on what Presentail determines is most appropriate. Such cases may include situations where we are unable to confirm or deliver your order, the recipient is unresponsive, the ordered product is unexpectedly unavailable, or we are otherwise unable to complete your order and no suitable alternative can be arranged after attempting to contact you. Please note that if your order has been fully prepared and we are unable to reach you or the recipient within a reasonable timeframe, or if we have attempted delivery more than three times within a 48-hour period, Presentail may have to cancel the order without issuing a refund.",
    ],
  },
  {
    heading: "IV. Rescheduling Policy",
    body: [
      "We understand that situations may arise where you need to change your delivery date, and Presentail will always try to accommodate your request. If your order has not yet been prepared, you may reschedule it for a new date within the next 30 days. If preparation has already begun, the order can only be rescheduled for a time no later than 48 hours from the original delivery slot to ensure product quality is maintained. Please note that rescheduling is not available for edible items or branded products.",
    ],
  },
  {
    heading: "V. Terms and Conditions of Sales",
    body: [
      {
        subheading: "A. Products and Pricing",
        body: [
          "All of the products listed on the Presentail website, their available descriptions, and their respective prices are each subject to change. Presentail reserves the right, at any given time, to modify, suspend, or discontinue the sale of any item with or without prior notice.",
          "You agree that Presentail will not be liable to you or to any third party for any modification, suspension, or discontinuance of any product.",
          "In the event that a specific item is listed at an incorrect price or with incorrect information due to typographical errors or errors in pricing or product descriptions and information received from our suppliers, Presentail shall have the right to decline or cancel those orders, regardless of whether or not the order has been confirmed and/or your debit/credit card charged.",
          "In the event your credit/debit card or PayPal account has already been charged for the order and it is cancelled by us, we shall immediately issue a refund to your credit/debit card or PayPal account in the amount of the charge.",
        ],
      },
      {
        subheading: "B. Presentail Orders",
        body: [
          "Upon placing an order, you are making an offer to purchase, and such an offer is subject to our acceptance. Your receipt of an order confirmation from us does not indicate our acceptance of your order, nor does it constitute confirmation of our offer to sell.",
          "We reserve the right at any time after the receipt of your order to accept, modify, decline, or cancel your order (in whole or in part) for any reason.",
          "Presentail may require additional verifications or information before accepting and processing any order. Please review which information Presentail may collect from you in our Privacy Policy.",
          "Shall Presentail decide to cancel all or part of your order, we will either (1) issue a refund if you have been charged, or (2) not charge you for the cancelled portion of your order.",
        ],
      },
      {
        subheading: "C. Payment Policy",
        body: [
          "Upon purchasing an item off the Presentail website, you agree to pay the price applicable for the item as of the time you submitted your order, any applicable delivery fees, and any applicable taxes.",
          "Late payments are not available for ANY item on the Presentail website. Shall an error occur prior to, while, or after submitting an order, or if you have any questions or concerns regarding our Payment Policy, please reach out to us using the contact information provided at the end of this Terms of Use.",
        ],
      },
      {
        subheading: "D. Shipping and Delivery Services",
        body: [
          "During any delivery carried out by Presentail, if neither you nor the recipient has provided an alternative delivery address, the Product will not be delivered to any location other than the one originally submitted. In such cases, you acknowledge and accept full legal responsibility for placing an Order using an incorrect or invalid address.",
        ],
      },
      {
        subheading: "F. Promo Codes and Coupons",
        body: [
          "Promo codes and coupons are distributed in accordance with and on the basis of Presentail top management decisions. They may be disseminated via on-site pop-ups, emails, advertisements on third-party sites or company owned social media, and others.",
          "Promo codes, discounts, and coupons are valid for a limited time, and users are encouraged to use these devices as soon as they receive them.",
          "We may decline to provide such discount or credit for any reason including, but not limited to, fraud, actual or expected financial hardship, or any other reason at our sole discretion.",
          "Publishing user-specific promo codes, discounts, coupons, or custom URLs via, but not limited to, mass messages to individuals the user does not personally know, automated systems or bots, coupon websites, or other third-party websites may constitute a breach of the Terms of Use and result in, but not limited to, forfeiture of all acquired discounts and credits, and/or suspension or termination of the user's account.",
          "Should a user abuse a promo code, custom URL, or referral through fraudulent activities such as referring oneself, creating multiple accounts or other means that constitute theft and/or fraud, we may notify the authorities, and you may be held accountable by the laws applicable in your location of residence as well as the laws of Lebanon.",
        ],
      },
      {
        subheading: "G. Loyalty Points",
        body: ["200 points = 2$"],
      },
      {
        subheading: "H. Limitation of Our Liability to You Regarding Products",
        body: [
          "To clarify, and subject always to any mandatory consumer protection laws in the country where the Order was placed, the maximum liability Presentail owes you in relation to the Products provided is strictly limited to the total value of those Products. Any damage or loss must be reported to us within seven days, either through clear digital photographs or by presenting the issue in person.",
          "Additionally, Presentail will not be responsible for any loss of profits, loss of business, business interruption, or loss of business opportunities under any circumstances.",
        ],
      },
    ],
  },
  {
    heading: "VI. Account Termination",
    body: [
      "Presentail reserves the right to terminate your access to our website and services, without cause or notice, which may result in the forfeiture and destruction of all information associated with your Presentail account.",
      "In the event we terminate your account on the basis of breach of terms, other fraudulent activity, or any other reason, we will refund you any credit remaining on your account.",
    ],
  },
  {
    heading: "VII. User Submissions",
    body: [
      "“User submissions” are any and all information and content that a user submits to, or uses with, the Presentail website and its respective services. You are solely responsible for your user content and assume all risks associated with use of your user content.",
      "You hereby represent and warrant that your user content does not violate Presentail's Acceptable Use Policy. You may not state or imply that your user content is in any way provided, sponsored, or endorsed by Presentail.",
      "Since only you, and not Presentail, is responsible for your user content, you may expose yourself to liability if, for example, your user content does not meet the terms under our Acceptable Use Policy. Presentail is not responsible for backing up any user content, and your user content may be deleted at any time.",
      {
        subheading: "Presentail Acceptable Use Policy",
        body: [
          "You agree not to use the Presentail website and respective services to collect, upload, transmit, display, or display any user content:",
          [
            "that violates any third-party right, including any copyrights, trademarks, patents, trade secrets, moral rights, privacy rights, rights of publicity, or any other intellectual property or proprietary right;",
            "that is illegal, harassing, abusive, tortious, threatening, harmful, invasive of another's privacy, vulgar, defamatory, false, intentionally misleading, trade libelous, pornographic, obscene, patently offensive, promotes racism, bigotry, hatred, political messages, or physical harm of any kind against any group or individual or is otherwise objectionable;",
            "that is harmful to minors in any way;",
            "that is in violation of any law, regulation, or obligations or restrictions imposed by any third party;",
            "that constitutes a computer virus, worm, or any software intended to damage or alter a computer system or data; or",
            "that constitutes unsolicited or unauthorized advertising, promotional materials, junk mail, spam, chain letters, pyramid schemes, or any other form of duplicative or unsolicited messages, whether commercial or otherwise.",
          ],
        ],
      },
    ],
  },
  {
    heading: "VIII. Notification Provision",
    body: [
      {
        subheading: "A. Modifications to Terms of Use",
        body: [
          "Presentail reserves the right to change these conditions periodically as it sees fit and your continued use of the site will signify your acceptance of any adjustment to these terms.",
          "Major changes to our Terms of Use will be announced via email, the website, or any other method the company finds suitable. However, Presentail users are encouraged to regularly review our Terms of Use.",
        ],
      },
      {
        subheading: "B. Modifications to Presentail Services",
        body: [
          "Presentail reserves the right to modify or discontinue certain parts of the website and/or our services at any time without prior notice. If you object to any changes to our website and related services, your sole recourse will be to stop using the site and service.",
          "Continued use of the Presentail website and services indicates your acknowledgment and consent of any changes.",
        ],
      },
    ],
  },
  {
    heading: "IX. Contact Us",
    body: [
      "Thank you for reading Presentail's Terms of Use. We would like to hear your feedback regarding these Terms of Use or if you have any questions or concerns regarding any part of our Terms of Use.",
      "Please email us at concierge@presentail.com or reach us by phone or WhatsApp at (+961) 81 392 194.",
      "Questions about the Terms of Service should be sent to us at concierge@presentail.com.",
    ],
  },
  {
    heading: "X. Intellectual Property Rights",
    body: [
      "All content available on the Platforms (“Presentail Content”), along with any trademarks, service marks, and logos displayed (“Marks”), is owned by or licensed to Presentail and is protected by copyright and other intellectual property laws under international conventions. Presentail Content includes, without limitation, all source code, databases, functionalities, software, website layouts, audio and video material, text, photographs, images, and graphics.",
      "All Presentail graphics, logos, designs, page headers, button icons, scripts, and service names are registered trademarks of Presentail. These trademarks may not be used including as part of other trademarks or domain names in connection with any product or service in a manner that could cause confusion. They may not be copied, imitated, reproduced, or used, whether in whole or in part, without prior written authorization from Presentail.",
      "The Presentail Content on the Platforms is provided “AS IS” strictly for your personal information and non-commercial use. It may not be used, copied, reproduced (fully or partially), distributed, transmitted, broadcast, displayed, sold, licensed, or otherwise exploited for any other purpose without Presentail's prior written permission. Systematically retrieving data or other content from the Platforms to create or compile, directly or indirectly, any type of collection, compilation, database, or directory is prohibited unless written approval is obtained from Presentail.",
      "If you are eligible to use the Platforms, you are granted a limited permission to access and use the Platforms and the Presentail Content. You may download or print a copy of any part of the Presentail Content to which you have lawful access, but only for personal, non-commercial use. Presentail retains all rights not expressly granted to you with respect to the Platforms, Presentail Content, and Marks.",
      "If you download or print Presentail Content for personal use, you must keep all copyright notices and proprietary markings intact. You also agree not to bypass, disable, or interfere with any features of the Platforms that relate to security, restrict copying or use of Presentail Content, or enforce usage limitations.",
      "Please note that Presentail is not an authorized retailer or official partner of the brands featured on the Platforms (unless explicitly stated on the product page). All branded items are sourced from reliable suppliers, and we guarantee their authenticity. The trademarks, logos, and brand names displayed belong to their respective owners.",
      "The Presentail trademark is a registered trademark of PRESENTAIL FLOWERS TRADING L.L.C. and may not be used without our permission, except where allowed under these Terms and with Presentail's explicit consent.",
    ],
  },
  {
    heading: "XI. Permission",
    body: [
      "Presentail grants you a limited, revocable permission to view the Platforms and to download, email, share through social media, or print individual pages from the Platforms for your personal, non-commercial use, provided that you do not remove or alter any trademark, copyright, or other proprietary notices displayed on those pages. Any use beyond this scope is strictly prohibited.",
      "You may not, for example, include any information, content, or material from the Platforms in a database, archive, compilation, or cache. You are not permitted to modify, copy, distribute, republish, transmit, display, perform, reproduce, reuse, resell, license, create derivative works from, transfer, or sell any information, content, material, software, products, or services obtained from the Platforms, unless explicitly permitted above.",
      "Except with express authorization from Presentail, you may not use deep-linking, nor may you access the Platforms manually or through automated means such as robots, spiders, crawlers, extraction tools, or similar technologies to scrape, copy, or monitor any part of the Platforms or their content. Presentail retains all statutory and common law rights to pursue action against anyone who violates these restrictions.",
      "You may not link to or frame any part of the Platforms or their content, in whole or in part, without prior written approval from Presentail. However, you may become a “fan” of the Platforms or share links to them through the social networking features referenced on the Platforms.",
      "All rights not expressly granted in these Terms are reserved by Presentail.",
    ],
  },
  {
    heading: "XII. Circumstances Outside our Control",
    body: [
      "We shall not be held liable or responsible for any failure to fulfill, or delay in fulfilling, our obligations under these Terms when such delay or failure is caused by events outside our reasonable control or by actions of third parties.",
      "“Circumstances Outside Our Control” refers to any act or event beyond our ability to manage, including but not limited to strikes, lockouts, or other industrial actions by third parties; civil unrest; riots; invasions; terrorist attacks or threats; war (declared or not) or preparations for war; fires; explosions; storms; floods; earthquakes; landslides; epidemics; pandemics; natural disasters; failures or shutdowns of public infrastructure; disruptions to public or private telecommunications networks; or government-imposed lockdowns.",
      "If such an event occurs and affects our ability to meet our obligations under these Terms: we will notify you as soon as reasonably possible, and our duties under these Terms will be paused, with the time needed for performance extended for as long as the uncontrollable circumstances persist.",
      "Additionally, you may cancel your Presentail order through the Platforms, or we may cancel it on your behalf without requiring your prior approval.",
    ],
  },
  {
    heading: "XIII. Governing Law and Competent Jurisdiction",
    body: [
      "These Terms are governed by, and must be interpreted according to, the laws and regulations of the country selected as the delivery location for your Order. You agree that any claim, dispute, controversy, action, or proceeding whether contractual or non-contractual arising from or relating to your Order, these Terms, their interpretation, or anything involving the creation, manufacture, distribution, promotion, marketing, advertising (including verbal or written statements), use, sale, or exploitation of any Presentail products or services, across any sales channel (including the internet, this Platform, phone orders, catalogs, radio, television, mobile applications, social media, or retail outlets), as well as any issues related to the Platform content (collectively, “Claims”), shall fall under the exclusive jurisdiction of the courts located in the country chosen for delivery.",
      "For example, if you place an Order through the Platforms for delivery in Lebanon, then Lebanon law applies and any dispute must be resolved in Lebanon. If you place an Order for delivery in the UAE, then UAE law applies and the dispute will be handled in the UAE.",
      "Presentail makes no guarantee that the Service or its Content is appropriate or accessible in all locations. Accessing the Service from territories where the Content is unlawful is strictly prohibited. Anyone choosing to use or access the Service from outside the designated service areas does so voluntarily and is responsible for complying with all applicable local laws.",
    ],
  },
  {
    heading: "XIV. Copy Rights Policy",
    body: [
      "You acknowledge that using Presentail's content or information for commercial purposes or republishing it may result in significant and potentially unlimited financial liability, and that monetary damages alone may not adequately remedy such misuse. Therefore, Presentail shall have the right to seek both temporary and permanent injunctive relief to prevent or stop any such unauthorized use.",
    ],
  },
  {
    heading: "XV. Closure of Account",
    body: [
      "Presentail may suspend or terminate your access to all or part of the Service at any time, without prior notice, and for any reason or no reason. This may occur if Presentail determines, at its sole discretion, that your behavior violates these Terms, breaches any applicable laws, or negatively affects another user, customer, recipient, subscriber, third-party partner, content provider, service provider, Presentail, or its affiliates.",
      "Presentail shall not be held responsible if the Service, in whole or in part, becomes unavailable at any time. We reserve the right to modify, suspend, or discontinue the Service (or any portion of it), either temporarily or permanently, at any time and without notice. We are under no obligation to update, revise, or clarify any information on the Service unless legally required to do so.",
    ],
  },
  {
    heading: "XVI. User Information and Conduct",
    body: [
      "User Information: Except for personal information protected under the Presentail Privacy Policy, any content you upload, transmit, or post on the Platforms will be treated as non-confidential and non-proprietary. Presentail assumes no responsibility for such material. Presentail and any third parties we authorize may freely copy, disclose, distribute, incorporate, or otherwise use any such material including data, images, audio, text, or other elements for any commercial or non-commercial purpose.",
      {
        subheading: "You are not permitted to post, upload, or transmit any material on the Platforms that:",
        body: [
          [
            "Violates any applicable local, national, or international law",
            "Is unlawful, fraudulent, or misleading",
            "Constitutes unauthorized advertising",
            "Contains viruses, malware, or other harmful code",
          ],
        ],
      },
      "You must not misuse the Platforms in any manner, including acts of hacking or attempts to gain unauthorized access.",
      {
        subheading: "Any comments, reviews, or feedback submitted through the Platforms must not:",
        body: [
          [
            "Include defamatory, obscene, or offensive content",
            "Encourage violence, discrimination, or any form of illegal or unethical behavior",
            "Infringe upon someone else's intellectual property rights",
            "Breach any legal obligations owed to a third party, such as confidentiality",
            "Promote illegal activities or invade another person's privacy",
            "Suggest that the content originates from Presentail",
            "Be used to impersonate another individual or misrepresent your identity or affiliation",
          ],
        ],
      },
      "This list is not exhaustive. You agree to compensate Presentail for any costs, losses, or damages arising from your violation of this clause.",
      "Presentail will fully cooperate with law enforcement authorities or comply with court orders that request or require the disclosure of the identity or location of individuals posting material that violates the rules outlined above.",
    ],
  },
  {
    heading: "XVII. Username and Password",
    body: [
      "Any user who signs in using an email address creates a personal password, chosen solely by the user. Each username is unique and cannot be duplicated or assigned to more than one person. Your password is strictly private and should be known only to you. You may update or change your password at any time, and you are fully responsible for selecting and protecting the confidentiality of your login details.",
      "Presentail is not responsible for any issues or damages that may occur due to improper use or sharing of your password.",
    ],
  },
];

export default function Terms() {
  const { language } = useLocale();
  return (
    <LegalPage
      testId="terms-page"
      lang={language}
      eyebrow={EYEBROW[language] ?? EYEBROW.en}
      title={TITLE[language] ?? TITLE.en}
      intro={<p>{INTRO_NOTE[language] ?? INTRO_NOTE.en}</p>}
      sections={SECTIONS}
    />
  );
}

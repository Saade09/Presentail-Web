/**
 * Shared FAQ copy used by both the Faqs page component and the server-side
 * SEO injector (seo-inject.mjs). Keep this file as plain ES module JS so the
 * Node.js SEO injector can import it without a TypeScript compilation step.
 *
 * Structure: { [lang]: { eyebrow, title, intro, groups: [{ title, items: [{ q, a }] }] } }
 */

export const FAQ_COPY = {
  en: {
    eyebrow: "FAQs",
    title: "Frequently asked questions.",
    intro:
      "Quick answers to the questions we hear most. If yours isn't here, our concierge team is one tap away on WhatsApp.",
    groups: [
      {
        title: "Orders & delivery",
        items: [
          {
            q: "How fast can you deliver?",
            a: "Standard same-day delivery is available in Beirut, Dubai, Abu Dhabi, Nicosia and Limassol when ordered before the checkout cut-off. Express delivers within roughly 90 minutes during 8 AM – 10 PM in select cities. Select the recipient's city and address first, then review the delivery dates and slots shown at checkout before paying.",
          },
          {
            q: "Do you deliver outside the listed cities?",
            a: "Yes — we deliver across Lebanon, the United Arab Emirates and Cyprus. Some areas use a next-day window. Select the destination country, city and address at checkout to see the available dates, slots and any area-specific delivery option before you place the order.",
          },
          {
            q: "Can I schedule a delivery for a future date?",
            a: "You can choose any date and available time slot up to several months in advance at checkout. Review the recipient details before payment; we'll send a reminder the day before delivery so you can contact us promptly if anything needs changing.",
          },
          {
            q: "What happens if the recipient is not home?",
            a: "Our courier will call the recipient before arriving and coordinate a safe drop-off or a second attempt the same day where possible. Add the recipient's working phone number and any building, gate or concierge instructions at checkout to help us reach them.",
          },
        ],
      },
      {
        title: "Payments & pricing",
        items: [
          {
            q: "Which payment methods do you accept?",
            a: "We accept credit and debit cards via Stripe, Apple Pay, Whish (Lebanon), Mamo (UAE), PayPal and Western Union. The checkout only shows methods available for your selected destination, so choose the country before selecting how to pay.",
          },
          {
            q: "Which currency will I be charged in?",
            a: "Prices are shown in your selected display currency, while the actual charge is processed in the local currency of the destination country. Check your order summary before payment; your card provider may apply its own exchange rate or foreign-transaction fee.",
          },
          {
            q: "Can I get an invoice?",
            a: "Yes — every order receipt includes a downloadable invoice. Download it from your order receipt after payment, or contact us with your order number to request a consolidated invoice for corporate orders.",
          },
        ],
      },
      {
        title: "Changes, refunds & quality",
        items: [
          {
            q: "Can I change or cancel my order?",
            a: "If your order has not yet been prepared, contact our concierge as soon as possible with your order number and requested change; we'll confirm what can be amended or cancelled. Once an order is in production, changes may not be possible.",
          },
          {
            q: "What if something arrives damaged?",
            a: "Send us a photo within 7 days, together with your order number and a short description of the issue. Our team will review it and arrange a replacement, partial refund (Presentail credit) or other compensation under our 100% Customer Satisfaction Guarantee.",
          },
          {
            q: "How long do refunds take?",
            a: "Bank refunds return to the original payment method and may take up to 15 business days after approval. Presentail credit is issued immediately, is valid for 12 months, and can be selected for a future Presentail order.",
          },
        ],
      },
      {
        title: "Account & privacy",
        items: [
          {
            q: "Do I need an account to order?",
            a: "No — you can check out as a guest. Create an account during or after checkout if you want to reorder in one tap, save addresses and recipients, track past orders and earn loyalty points.",
          },
          {
            q: "How do I delete my account?",
            a: "On the website, go to My Account \u2192 Personal Information and click \u201cDelete Account\u201d at the bottom of the page. In the mobile app, tap Account \u2192 Delete account. Confirm the request when prompted; your data is removed within 15 days.",
          },
        ],
      },
    ],
  },
  ar: {
    eyebrow: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0634\u0627\u0626\u0639\u0629",
    title: "\u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0623\u0643\u062b\u0631 \u062a\u0643\u0631\u0627\u0631\u0627\u064b.",
    intro:
      "\u0625\u062c\u0627\u0628\u0627\u062a \u0633\u0631\u064a\u0639\u0629 \u0644\u0644\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0623\u0643\u062b\u0631 \u0634\u064a\u0648\u0639\u0627\u064b. \u0625\u0630\u0627 \u0644\u0645 \u064a\u0643\u0646 \u0633\u0624\u0627\u0644\u0643 \u0647\u0646\u0627\u060c \u0641\u0631\u064a\u0642 \u0627\u0644\u0643\u0648\u0646\u0633\u064a\u0631\u062c \u0644\u062f\u064a\u0646\u0627 \u0639\u0644\u0649 \u0628\u0639\u062f \u0636\u063a\u0637\u0629 \u0639\u0644\u0649 \u0648\u0627\u062a\u0633\u0627\u0628.",
    groups: [
      {
        title: "\u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u0627\u0644\u062a\u0648\u0635\u064a\u0644",
        items: [
          {
            q: "\u0643\u0645 \u062a\u0633\u062a\u063a\u0631\u0642 \u0627\u0644\u062a\u0648\u0635\u064a\u0644\u061f",
            a: "\u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0641\u064a \u0627\u0644\u064a\u0648\u0645 \u0646\u0641\u0633\u0647 \u0645\u062a\u0648\u0641\u0651\u0631 \u0641\u064a \u0628\u064a\u0631\u0648\u062a \u0648\u062f\u0628\u064a \u0648\u0623\u0628\u0648 \u0638\u0628\u064a \u0648\u0646\u064a\u0642\u0648\u0633\u064a\u0627 \u0648\u0644\u064a\u0645\u0627\u0633\u0648\u0644 \u0642\u0628\u0644 \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0646\u0647\u0627\u0626\u064a. \u062e\u062f\u0645\u0629 Express \u062a\u0648\u0635\u0651\u0644 \u062e\u0644\u0627\u0644 \u0646\u062d\u0648 90 \u062f\u0642\u064a\u0642\u0629 \u0628\u064a\u0646 8 \u0635 \u0648 10 \u0645 \u0641\u064a \u0645\u062f\u0646 \u0645\u062e\u062a\u0627\u0631\u0629. \u0627\u062e\u062a\u0631 \u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0623\u0648\u0644\u0627\u064b \u062b\u0645 \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0648\u0627\u0639\u064a\u062f \u0648\u0627\u0644\u0641\u062a\u0631\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629 \u0641\u064a \u0627\u0644\u062f\u0641\u0639.",
          },
          {
            q: "\u0647\u0644 \u062a\u0648\u0635\u0651\u0644\u0648\u0646 \u062e\u0627\u0631\u062c \u0627\u0644\u0645\u062f\u0646 \u0627\u0644\u0645\u0630\u0643\u0648\u0631\u0629\u061f",
            a: "\u0646\u0639\u0645 \u2014 \u0646\u0648\u0635\u0651\u0644 \u0641\u064a \u0643\u0644 \u0644\u0628\u0646\u0627\u0646 \u0648\u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a \u0648\u0642\u0628\u0631\u0635. \u0628\u0639\u0636 \u0627\u0644\u0645\u0646\u0627\u0637\u0642 \u062a\u0633\u062a\u062e\u062f\u0645 \u0641\u062a\u0631\u0629 \u0627\u0644\u064a\u0648\u0645 \u0627\u0644\u062a\u0627\u0644\u064a. \u0627\u062e\u062a\u0631 \u0627\u0644\u0628\u0644\u062f \u0648\u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0648\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0641\u064a \u0627\u0644\u062f\u0641\u0639 \u0644\u0631\u0624\u064a\u0629 \u0627\u0644\u062a\u0648\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0641\u062a\u0631\u0627\u062a \u0627\u0644\u0645\u062a\u0627\u062d\u0629 \u0642\u0628\u0644 \u0625\u062a\u0645\u0627\u0645 \u0627\u0644\u0637\u0644\u0628.",
          },
          {
            q: "\u0647\u0644 \u064a\u0645\u0643\u0646\u0646\u064a \u062c\u062f\u0648\u0644\u0629 \u0627\u0644\u062a\u0648\u0635\u064a\u0644 \u0644\u062a\u0627\u0631\u064a\u062e \u0645\u0633\u062a\u0642\u0628\u0644\u064a\u061f",
            a: "\u064a\u0645\u0643\u0646\u0643 \u0627\u062e\u062a\u064a\u0627\u0631 \u0623\u064a \u062a\u0627\u0631\u064a\u062e \u0648\u0641\u062a\u0631\u0629 \u0632\u0645\u0646\u064a\u0629 \u0645\u062a\u0627\u062d\u0629 \u062d\u062a\u0649 \u0639\u062f\u0651\u0629 \u0623\u0634\u0647\u0631 \u0645\u0642\u062f\u0651\u0645\u0627\u064b. \u0631\u0627\u062c\u0639 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0644\u0645 \u0642\u0628\u0644 \u0627\u0644\u062f\u0641\u0639\u061b \u0633\u0646\u0631\u0633\u0644 \u062a\u0630\u0643\u064a\u0631\u0627\u064b \u0642\u0628\u0644 \u064a\u0648\u0645 \u0645\u0646 \u0627\u0644\u062a\u0648\u0635\u064a\u0644.",
          },
          {
            q: "\u0645\u0627\u0630\u0627 \u064a\u062d\u062f\u062b \u0625\u0646 \u0644\u0645 \u064a\u0643\u0646 \u0627\u0644\u0645\u0633\u062a\u0644\u0645 \u0641\u064a \u0627\u0644\u0645\u0646\u0632\u0644\u061f",
            a: "\u0633\u064a\u062a\u0651\u0635\u0644 \u0633\u0627\u0639\u064a\u0646\u0627 \u0628\u0627\u0644\u0645\u0633\u062a\u0644\u0645 \u0642\u0628\u0644 \u0627\u0644\u0648\u0635\u0648\u0644 \u0648\u064a\u0646\u0633\u0651\u0642 \u0627\u0644\u062a\u0633\u0644\u064a\u0645 \u0628\u0623\u0645\u0627\u0646 \u0623\u0648 \u0645\u062d\u0627\u0648\u0644\u0629 \u062b\u0627\u0646\u064a\u0629 \u0641\u064a \u0627\u0644\u064a\u0648\u0645 \u0646\u0641\u0633\u0647 \u0639\u0646\u062f \u0627\u0644\u0625\u0645\u0643\u0627\u0646. \u0623\u0636\u0641 \u0631\u0642\u0645 \u0647\u0627\u062a\u0641 \u0635\u062d\u064a\u062d\u0627\u064b \u0648\u0623\u064a \u062a\u0639\u0644\u064a\u0645\u0627\u062a \u0644\u0644\u0645\u0628\u0646\u0649 \u0623\u0648 \u0627\u0644\u0628\u0648\u0627\u0628\u0629 \u0639\u0646\u062f \u0627\u0644\u062f\u0641\u0639.",
          },
        ],
      },
      {
        title: "\u0627\u0644\u062f\u0641\u0639 \u0648\u0627\u0644\u0623\u0633\u0639\u0627\u0631",
        items: [
          {
            q: "\u0645\u0627 \u0637\u0631\u0642 \u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0645\u0642\u0628\u0648\u0644\u0629\u061f",
            a: "\u0628\u0637\u0627\u0642\u0627\u062a \u0627\u0644\u0627\u0626\u062a\u0645\u0627\u0646 \u0648\u0627\u0644\u062e\u0635\u0645 \u0639\u0628\u0631 Stripe\u060c Apple Pay\u060c Whish (\u0644\u0628\u0646\u0627\u0646)\u060c Mamo (\u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a)\u060c PayPal\u060c \u0648Western Union. \u0627\u062e\u062a\u0631 \u0628\u0644\u062f \u0627\u0644\u0648\u062c\u0647\u0629 \u0623\u0648\u0644\u0627\u064b \u0641\u062a\u0638\u0647\u0631 \u0644\u0643 \u0627\u0644\u0648\u0633\u0627\u0626\u0644 \u0627\u0644\u0645\u062a\u0627\u062d\u0629 \u0641\u064a \u0627\u0644\u062f\u0641\u0639.",
          },
          {
            q: "\u0628\u0623\u064a \u0639\u0645\u0644\u0629 \u0633\u064a\u064f\u062d\u0633\u0628 \u0627\u0644\u062f\u0641\u0639\u061f",
            a: "\u062a\u064f\u0639\u0631\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0628\u0639\u0645\u0644\u0629 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629. \u064a\u064f\u0646\u0641\u064e\u0651\u0630 \u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0641\u0639\u0644\u064a \u0628\u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0645\u062d\u0644\u064a\u0629 \u0644\u0628\u0644\u062f \u0627\u0644\u0648\u062c\u0647\u0629. \u0631\u0627\u062c\u0639 \u0645\u0644\u062e\u0635 \u0627\u0644\u0637\u0644\u0628 \u0642\u0628\u0644 \u0627\u0644\u062f\u0641\u0639\u061b \u0642\u062f \u064a\u0637\u0628\u0642 \u0645\u0632\u0648\u062f \u0628\u0637\u0627\u0642\u062a\u0643 \u0633\u0639\u0631 \u0635\u0631\u0641 \u0623\u0648 \u0631\u0633\u0648\u0645\u0627\u064b.",
          },
          {
            q: "\u0647\u0644 \u064a\u0645\u0643\u0646\u0646\u064a \u0627\u0644\u062d\u0635\u0648\u0644 \u0639\u0644\u0649 \u0641\u0627\u062a\u0648\u0631\u0629\u061f",
            a: "\u0646\u0639\u0645 \u2014 \u0643\u0644 \u0625\u064a\u0635\u0627\u0644 \u0637\u0644\u0628 \u064a\u062a\u0636\u0645\u0651\u0646 \u0641\u0627\u062a\u0648\u0631\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062a\u0646\u0632\u064a\u0644. \u0646\u0632\u0651\u0644\u0647\u0627 \u0645\u0646 \u0625\u064a\u0635\u0627\u0644\u0643 \u0628\u0639\u062f \u0627\u0644\u062f\u0641\u0639\u060c \u0623\u0648 \u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627 \u0628\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628 \u0644\u0637\u0644\u0628 \u0641\u0627\u062a\u0648\u0631\u0629 \u0645\u0648\u062d\u0651\u062f\u0629 \u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0627\u062a.",
          },
        ],
      },
      {
        title: "\u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a \u0648\u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0648\u0627\u0644\u062c\u0648\u062f\u0629",
        items: [
          {
            q: "\u0647\u0644 \u064a\u0645\u0643\u0646\u0646\u064a \u062a\u0639\u062f\u064a\u0644 \u0623\u0648 \u0625\u0644\u063a\u0627\u0621 \u0637\u0644\u0628\u064a\u061f",
            a: "\u0625\u0630\u0627 \u0644\u0645 \u064a\u0628\u062f\u0623 \u062a\u062d\u0636\u064a\u0631 \u0637\u0644\u0628\u0643\u060c \u062a\u0648\u0627\u0635\u0644 \u0645\u0639\u0646\u0627 \u0641\u064a \u0623\u0642\u0631\u0628 \u0648\u0642\u062a \u0645\u0639 \u0631\u0642\u0645 \u0637\u0644\u0628\u0643 \u0648\u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628. \u0633\u0646\u0624\u0643\u062f \u0645\u0627 \u064a\u0645\u0643\u0646 \u062a\u0639\u062f\u064a\u0644\u0647 \u0623\u0648 \u0625\u0644\u063a\u0627\u0624\u0647\u061b \u0628\u0639\u062f \u0628\u062f\u0621 \u0627\u0644\u0625\u0646\u062a\u0627\u062c \u0642\u062f \u0644\u0627 \u064a\u0643\u0648\u0646 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0645\u0645\u0643\u0646\u0627\u064b.",
          },
          {
            q: "\u0645\u0627\u0630\u0627 \u0644\u0648 \u0648\u0635\u0644 \u0634\u064a\u0621 \u062a\u0627\u0644\u0641\u061f",
            a: "\u0623\u0631\u0633\u0644 \u0644\u0646\u0627 \u0635\u0648\u0631\u0629 \u062e\u0644\u0627\u0644 7 \u0623\u064a\u0627\u0645 \u0645\u0639 \u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628 \u0648\u0648\u0635\u0641 \u0645\u0648\u062c\u0632 \u0644\u0644\u0645\u0634\u0643\u0644\u0629. \u0633\u064a\u0631\u0627\u062c\u0639 \u0641\u0631\u064a\u0642\u0646\u0627 \u0627\u0644\u0637\u0644\u0628 \u0648\u064a\u0631\u062a\u0651\u0628 \u0628\u062f\u064a\u0644\u0627\u064b \u0623\u0648 \u0627\u0633\u062a\u0631\u062c\u0627\u0639\u0627\u064b \u062c\u0632\u0626\u064a\u0627\u064b (\u0631\u0635\u064a\u062f \u0628\u0631\u064a\u0632\u0627\u0646\u062a\u064a\u0644) \u0623\u0648 \u062a\u0639\u0648\u064a\u0636\u0627\u064b \u0622\u062e\u0631 \u0628\u0645\u0648\u062c\u0628 \u0636\u0645\u0627\u0646\u0646\u0627 100% \u0644\u0631\u0636\u0649 \u0627\u0644\u0639\u0645\u064a\u0644.",
          },
          {
            q: "\u0643\u0645 \u062a\u0633\u062a\u063a\u0631\u0642 \u0627\u0644\u0645\u0628\u0627\u0644\u063a \u0627\u0644\u0645\u0633\u062a\u0631\u062f\u0651\u0629\u061f",
            a: "\u062a\u064f\u0639\u0627\u062f \u0627\u0644\u0645\u0628\u0627\u0644\u063a \u0628\u0637\u0631\u064a\u0642\u0629 \u0627\u0644\u062f\u0641\u0639 \u0627\u0644\u0623\u0635\u0644\u064a\u0629 \u0648\u0642\u062f \u062a\u0633\u062a\u063a\u0631\u0642 \u062d\u062a\u0649 15 \u064a\u0648\u0645 \u0639\u0645\u0644 \u0628\u0639\u062f \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629. \u0623\u0645\u0651\u0627 \u0631\u0635\u064a\u062f \u0628\u0631\u064a\u0632\u0627\u0646\u062a\u064a\u0644 \u0641\u064a\u064f\u0645\u0646\u062d \u0641\u0648\u0631\u0627\u064b \u0648\u0635\u0627\u0644\u062d 12 \u0634\u0647\u0631\u0627\u064b \u0648\u064a\u0645\u0643\u0646 \u0627\u0633\u062a\u062e\u062f\u0627\u0645\u0647 \u0641\u064a \u0637\u0644\u0628 \u0642\u0627\u062f\u0645.",
          },
        ],
      },
      {
        title: "\u0627\u0644\u062d\u0633\u0627\u0628 \u0648\u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
        items: [
          {
            q: "\u0647\u0644 \u0623\u062d\u062a\u0627\u062c \u062d\u0633\u0627\u0628\u0627\u064b \u0644\u0644\u0637\u0644\u0628\u061f",
            a: "\u0644\u0627 \u2014 \u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u062f\u0641\u0639 \u0643\u0632\u0627\u0626\u0631. \u0623\u0646\u0634\u0626 \u062d\u0633\u0627\u0628\u0627\u064b \u0623\u062b\u0646\u0627\u0621 \u0627\u0644\u062f\u0641\u0639 \u0623\u0648 \u0628\u0639\u062f\u0647 \u0644\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0637\u0644\u0628 \u0628\u0636\u063a\u0637\u0629 \u0648\u0627\u062d\u062f\u0629 \u0648\u062d\u0641\u0638 \u0627\u0644\u0639\u0646\u0627\u0648\u064a\u0646 \u0648\u0627\u0644\u0645\u0633\u062a\u0644\u0645\u064a\u0646 \u0648\u062a\u062a\u0628\u0651\u0639 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0648\u062c\u0645\u0639 \u0646\u0642\u0627\u0637 \u0627\u0644\u0648\u0644\u0627\u0621.",
          },
          {
            q: "\u0643\u064a\u0641 \u0623\u062d\u0630\u0641 \u062d\u0633\u0627\u0628\u064a\u061f",
            a: "\u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639\u060c \u0627\u0630\u0647\u0628 \u0625\u0644\u0649 \u062d\u0633\u0627\u0628\u064a \u2190 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0634\u062e\u0635\u064a\u0629 \u0648\u0627\u0646\u0642\u0631 \u0639\u0644\u0649 \u00ab\u062d\u0630\u0641 \u0627\u0644\u062d\u0633\u0627\u0628\u00bb \u0641\u064a \u0623\u0633\u0641\u0644 \u0627\u0644\u0635\u0641\u062d\u0629. \u0641\u064a \u0627\u0644\u062a\u0637\u0628\u064a\u0642\u060c \u0627\u0636\u063a\u0637 \u0627\u0644\u062d\u0633\u0627\u0628 \u2190 \u062d\u0630\u0641 \u0627\u0644\u062d\u0633\u0627\u0628. \u0623\u0643\u062f \u0627\u0644\u0637\u0644\u0628 \u0639\u0646\u062f \u0638\u0647\u0648\u0631 \u0627\u0644\u0631\u0633\u0627\u0644\u0629\u061b \u062a\u064f\u0632\u0627\u0644 \u0628\u064a\u0627\u0646\u0627\u062a\u0643 \u062e\u0644\u0627\u0644 15 \u064a\u0648\u0645\u0627\u064b.",
          },
        ],
      },
    ],
  },
  fr: {
    eyebrow: "FAQ",
    title: "Questions fr\u00e9quentes.",
    intro:
      "Des r\u00e9ponses rapides aux questions qu\u2019on nous pose le plus. Si la v\u00f4tre n\u2019est pas ici, notre \u00e9quipe concierge est joignable sur WhatsApp.",
    groups: [
      {
        title: "Commandes & livraison",
        items: [
          {
            q: "Sous combien de temps livrez-vous\u00a0?",
            a: "La livraison standard le jour m\u00eame est disponible \u00e0 Beyrouth, Duba\u00ef, Abou Dhabi, Nicosie et Limassol avant l\u2019heure limite. L\u2019Express livre sous environ 90 minutes entre 8h et 22h dans certaines villes. Choisissez d\u2019abord la ville et l\u2019adresse du destinataire, puis v\u00e9rifiez les cr\u00e9neaux propos\u00e9s au paiement.",
          },
          {
            q: "Livrez-vous en dehors des villes list\u00e9es\u00a0?",
            a: "Oui \u2014 nous livrons partout au Liban, aux \u00c9mirats et \u00e0 Chypre. Certaines zones sont en J+1. S\u00e9lectionnez le pays, la ville et l\u2019adresse au paiement pour voir les dates et cr\u00e9neaux disponibles avant de commander.",
          },
          {
            q: "Puis-je planifier une livraison \u00e0 une date future\u00a0?",
            a: "Vous pouvez choisir n\u2019importe quelle date et cr\u00e9neau disponible, jusqu\u2019\u00e0 plusieurs mois \u00e0 l\u2019avance. V\u00e9rifiez les coordonn\u00e9es du destinataire avant de payer\u00a0; un rappel est envoy\u00e9 la veille de la livraison.",
          },
          {
            q: "Que se passe-t-il si le destinataire est absent\u00a0?",
            a: "Notre coursier appelle le destinataire avant d\u2019arriver et coordonne une remise en s\u00e9curit\u00e9 ou une seconde tentative le jour m\u00eame si possible. Ajoutez un num\u00e9ro joignable et les consignes d\u2019acc\u00e8s (immeuble, portail ou concierge) au paiement.",
          },
        ],
      },
      {
        title: "Paiements & tarifs",
        items: [
          {
            q: "Quels moyens de paiement acceptez-vous\u00a0?",
            a: "Cartes de cr\u00e9dit et de d\u00e9bit via Stripe, Apple Pay, Whish (Liban), Mamo (\u00c9mirats), PayPal et Western Union. Choisissez le pays de destination avant le paiement\u00a0: seuls les moyens disponibles pour cette commande seront affich\u00e9s.",
          },
          {
            q: "Dans quelle devise serai-je d\u00e9bit\u00e9(e)\u00a0?",
            a: "Les prix s\u2019affichent dans la devise d\u2019affichage choisie. Le paiement r\u00e9el est trait\u00e9 dans la devise locale du pays de destination\u00a0; v\u00e9rifiez le r\u00e9capitulatif, car votre banque peut appliquer son taux ou des frais.",
          },
          {
            q: "Puis-je obtenir une facture\u00a0?",
            a: "Oui \u2014 chaque re\u00e7u inclut une facture t\u00e9l\u00e9chargeable. T\u00e9l\u00e9chargez-la apr\u00e8s paiement ou contactez-nous avec le num\u00e9ro de commande pour demander une facture consolid\u00e9e pour une commande corporate.",
          },
        ],
      },
      {
        title: "Modifications, remboursements & qualit\u00e9",
        items: [
          {
            q: "Puis-je modifier ou annuler ma commande\u00a0?",
            a: "Si votre commande n\u2019est pas encore pr\u00e9par\u00e9e, contactez-nous au plus vite avec le num\u00e9ro de commande et la modification souhait\u00e9e. Nous confirmerons ce qui est possible\u00a0; une fois en production, les modifications peuvent ne plus \u00eatre possibles.",
          },
          {
            q: "Que faire si un article arrive ab\u00eem\u00e9\u00a0?",
            a: "Envoyez-nous une photo sous 7 jours, avec le num\u00e9ro de commande et une br\u00e8ve description du probl\u00e8me. Nous l\u2019examinerons et proposerons un remplacement, un remboursement partiel (cr\u00e9dit Presentail) ou une autre compensation au titre de notre garantie 100\u00a0% satisfaction.",
          },
          {
            q: "Combien de temps pour un remboursement\u00a0?",
            a: "Les remboursements bancaires utilisent le moyen de paiement initial et peuvent prendre jusqu\u2019\u00e0 15 jours ouvr\u00e9s apr\u00e8s approbation. Le cr\u00e9dit Presentail est imm\u00e9diat, valable 12 mois et utilisable sur une prochaine commande.",
          },
        ],
      },
      {
        title: "Compte & confidentialit\u00e9",
        items: [
          {
            q: "Faut-il un compte pour commander\u00a0?",
            a: "Non \u2014 vous pouvez r\u00e9gler en tant qu\u2019invit\u00e9. Cr\u00e9ez un compte pendant ou apr\u00e8s le paiement pour recommander en un clic, enregistrer adresses et destinataires, suivre vos commandes et cumuler des points fid\u00e9lit\u00e9.",
          },
          {
            q: "Comment supprimer mon compte\u00a0?",
            a: "Sur le site, allez dans Mon compte \u2192 Informations personnelles et cliquez sur \u00ab\u00a0Supprimer le compte\u00a0\u00bb en bas de la page. Dans l\u2019application, appuyez sur Compte \u2192 Supprimer le compte. Confirmez la demande lorsqu\u2019elle s\u2019affiche\u00a0; vos donn\u00e9es sont effac\u00e9es sous 15 jours.",
          },
        ],
      },
    ],
  },
};

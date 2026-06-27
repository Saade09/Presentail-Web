/**
 * llms-content.mjs — versioned prose for /llms.txt and /llms-full.txt.
 *
 * Edit this file (not serve.mjs) when any of the following change:
 *   • FAQs or policies (returns, cancellations, tracking, customisation)
 *   • Payment methods accepted
 *   • Delivery areas or cutoff-time rules
 *   • Contact / support email addresses
 *   • Partnership or corporate-gifting programme details
 *   • Any other shopper-visible copy on the static pages
 *
 * serve.mjs imports LLMS_INTRO, LLMS_PAGES, and LLMS_PAGE_SECTIONS and
 * splices in the dynamic origin+basePath URLs at request time — no server
 * restart is needed when only prose changes and the file is redeployed.
 *
 * Conventions:
 *   • LLMS_PAGES:        { label: string, path: string }[]
 *                        `path` is the locale-prefixed path after the base,
 *                        e.g. "/en-lb/beirut/faqs".  Use "/" for the homepage.
 *   • LLMS_PAGE_SECTIONS: { title: string, path: string, body: string }[]
 *                        `title` is the H3 heading (origin+path is appended in
 *                        parentheses by serve.mjs).
 *                        `body`  is the verbatim Markdown body for that section.
 */

export const LLMS_INTRO =
  "Luxury flower and gift delivery across Lebanon, UAE, and Cyprus.\n" +
  "Same-day and scheduled delivery. Shop online or via the mobile app.";

/** Pages listed in the ## Pages index of both /llms.txt and /llms-full.txt. */
export const LLMS_PAGES = [
  { label: "Home",              path: "/" },
  { label: "Shop",              path: "/en-lb/beirut/shop" },
  { label: "Brands",            path: "/en-lb/beirut/brands" },
  { label: "Occasions",         path: "/en-lb/beirut/occasions" },
  { label: "Categories",        path: "/en-lb/beirut/shop" },
  { label: "Blog",              path: "/en-lb/beirut/blog" },
  { label: "Corporate gifting", path: "/en-lb/beirut/corporate" },
  { label: "Weddings",          path: "/en-lb/beirut/weddings" },
  { label: "Partner with us",   path: "/en-lb/beirut/partner" },
  { label: "Contact",           path: "/en-lb/beirut/contact" },
  { label: "FAQs",              path: "/en-lb/beirut/faqs" },
  { label: "Terms",             path: "/en-lb/beirut/terms" },
  { label: "Privacy",           path: "/en-lb/beirut/privacy" },
];

/**
 * Full-page prose sections included only in /llms-full.txt.
 * Keep one entry per key static page; order matches the pages index above.
 */
export const LLMS_PAGE_SECTIONS = [
  {
    title: "Home",
    path: "/",
    body:
      "Presentail is a luxury flower and gift delivery service operating in Lebanon, the UAE, and " +
      "Cyprus. Browse hundreds of curated arrangements, gift boxes, and hampers from top local and " +
      "international brands. Order online or via the iOS / Android app. Same-day Express delivery " +
      "and scheduled delivery slots are available. All prices are shown in your local currency " +
      "(LBP, USD, AED, or EUR). Payment options include credit/debit card (Stripe), Whish Money, " +
      "Western Union, Mamo Pay, and PayPal.",
  },
  {
    title: "Brands",
    path: "/en-lb/beirut/brands",
    body:
      "Presentail partners with a curated selection of luxury florists, patisseries, chocolatiers, " +
      "and gift brands. Each brand page lists their full product catalogue with pricing and available " +
      "delivery windows. Featured partners include top names in Lebanon, Dubai, Abu Dhabi, and Cyprus. " +
      "Browse all brand pages to discover the full range of premium gifting options.",
  },
  {
    title: "Occasions",
    path: "/en-lb/beirut/occasions",
    body:
      "Shop gifts by occasion: Birthday, Anniversary, Valentine's Day, Mother's Day, Wedding, Baby " +
      "Shower, Graduation, Sympathy, Get Well Soon, Eid, Christmas, New Year, Corporate Events, and " +
      "more. Each occasion page shows a curated selection of arrangements, hampers, and gifts suitable " +
      "for that event. Presentail's gift curation team selects the best products for every occasion.",
  },
  {
    title: "Contact",
    path: "/en-lb/beirut/contact",
    body:
      "Get in touch with the Presentail team. For order support, delivery questions, or general " +
      "enquiries, contact us via the form on this page, by email at hello@presentail.com, or via " +
      "WhatsApp. Our customer support team operates seven days a week. Response times are typically " +
      "within a few hours during business hours.",
  },
  {
    title: "FAQs",
    path: "/en-lb/beirut/faqs",
    body:
      "Frequently asked questions about Presentail's delivery service, payment methods, order " +
      "tracking, and gift customisation.\n" +
      "\n" +
      "**Delivery:** Same-day Express delivery is available for orders placed before the daily cutoff " +
      "time. Scheduled delivery lets you pick a specific date and time slot up to 30 days in advance. " +
      "Delivery areas include all major cities and districts in Lebanon, Dubai, Abu Dhabi, and Cyprus.\n" +
      "\n" +
      "**Payment:** We accept Visa, Mastercard, and American Express via Stripe. Lebanese shoppers " +
      "can also pay with Whish Money, Western Union, Mamo Pay, or PayPal. All card payments are " +
      "processed securely. No card data is stored on Presentail's servers.\n" +
      "\n" +
      "**Order tracking:** After placing an order you receive an email and SMS confirmation. " +
      "Real-time status updates (Confirmed → Out for Delivery → Delivered) are sent by push " +
      "notification on the mobile app and by SMS to the sender's phone.\n" +
      "\n" +
      "**Customisation:** Add a personalised card message at checkout. Most arrangements can be " +
      "customised (colours, add-ons) — contact us before placing the order if you have a specific " +
      "request.\n" +
      "\n" +
      "**Returns and refunds:** Flowers and perishable items are non-refundable once delivered. If " +
      "there is a quality issue with your order, contact us within 24 hours with a photo and we will " +
      "make it right.",
  },
  {
    title: "Terms and Conditions",
    path: "/en-lb/beirut/terms",
    body:
      "By using Presentail's website or mobile app you agree to these terms. Presentail operates in " +
      "Lebanon, the UAE, and Cyprus. Orders are accepted subject to product availability and delivery " +
      "area coverage. Prices are displayed in your local currency and include applicable taxes and " +
      "delivery fees at checkout. Presentail reserves the right to substitute products of equal or " +
      "greater value if an item becomes unavailable. Cancellations must be requested before the order " +
      "is dispatched. Presentail's liability is limited to the value of the order placed. These terms " +
      "are governed by the laws of Lebanon.",
  },
  {
    title: "Privacy Policy",
    path: "/en-lb/beirut/privacy",
    body:
      "Presentail collects the personal information you provide when placing an order (name, email, " +
      "phone, delivery address) and, with your permission, your device location for automatic currency " +
      "and delivery area detection. Order data is shared with partner brands solely to fulfil your " +
      "delivery. Payment data is processed by Stripe, Mamo, and other payment providers and is never " +
      "stored on Presentail's servers. You may request deletion of your account and personal data at " +
      "any time by contacting hello@presentail.com. Presentail uses cookies and analytics to improve " +
      "the shopping experience. Full details are available on the privacy policy page.",
  },
  {
    title: "Corporate Gifting",
    path: "/en-lb/beirut/corporate",
    body:
      "Presentail offers tailored corporate gifting solutions for businesses of all sizes. Services " +
      "include bulk ordering with volume discounts, branded packaging and personalised messages, " +
      "recurring gift programmes (employee birthdays, client milestones, seasonal campaigns), and a " +
      "dedicated account manager. Same-day and scheduled delivery available across Lebanon, UAE, and " +
      "Cyprus. To discuss a corporate gifting package, fill in the enquiry form or email " +
      "corporate@presentail.com.",
  },
  {
    title: "Weddings",
    path: "/en-lb/beirut/weddings",
    body:
      "Presentail's wedding florals and gifting service covers bouquets, centrepieces, ceremony " +
      "arrangements, bridal party gifts, and guest favours. Work with our in-house floral designers " +
      "to create a bespoke look that matches your theme and colour palette. Full-service packages are " +
      "available for venues in Lebanon, Dubai, Abu Dhabi, and Cyprus. Schedule a consultation via the " +
      "weddings page to receive a personalised quote.",
  },
  {
    title: "Partner with Us",
    path: "/en-lb/beirut/partner",
    body:
      "Presentail welcomes applications from florists, patisseries, chocolatiers, gift boutiques, " +
      "and artisan producers who want to reach thousands of customers across Lebanon, UAE, and Cyprus. " +
      "Partners list their products on Presentail's marketplace, benefit from same-day fulfilment " +
      "logistics, and receive weekly payouts. To apply, complete the partnership form on this page. " +
      "The Presentail partnerships team reviews applications within five business days.",
  },
];

// Curated per-category SEO content for category listing pages.
//
// Shared by the server prerender (seo-inject.mjs) and the client route
// (Shop.tsx) so the raw crawled HTML and the hydrated page render the SAME
// visible content — Google's structured-data guidelines require FAQPage
// markup to correspond to content actually visible on the page.
//
// Keyed `${countryCode}/${citySlug}` → category slug. English-only for now:
// ar/fr locales keep the existing template-based copy.
//
// Slugs MUST match the real catalog category slugs (see /api/catalog/
// categories). Do not invent slugs here — a mismatched entry silently never
// renders.
//
// Facts used below (confirmed from codebase, 2026-08-07):
//   - Beirut same-day delivery cutoff: order before midday (noon).
//     Source: seo-inject.mjs:1151-1159, src/data/faqsCopy.js:20-22.
//   - Lebanon payment methods: Credit Card, Apple Pay, Google Pay, Cash on
//     Delivery. Source: src/lib/locationData.mjs (paymentAccepted).
//   - Delivery covers all of Lebanon; nationwide from Beirut.
//     Source: src/lib/locationData.mjs (all LB cities enumerated).
//   - Gift notes / personalised messages: supported at checkout via the
//     orderNote field. Source: src/pages/Checkout.tsx:3755-3780,
//     src/data/faqsCopy.js.
//   - International card orders: the site's mission copy confirms it serves
//     Lebanese diaspora ("locally and abroad"); standard Stripe acceptance.
//     Not explicitly confirmed per payment method — FAQ answer scoped
//     accordingly.
//   - Cake products confirmed in catalog: Strawberry Cheesecake, Chocolate
//     Rocher Cake (7 products total in cakes category for LB).
//
// Deliberately kept out (not confirmed):
//   - Exact flavour/size catalogue beyond the two confirmed product names.
//   - Whether COD is available for all delivery cities (confirmed for
//     Beirut/LB market overall; per-city COD not individually verified).
/* eslint-disable max-len */

/**
 * @typedef {{ heading: string, body: string, links?: Array<{ label: string, href: string, absolute?: boolean }> }} CategorySeoSection
 * @typedef {{ q: string, a: string }} CategorySeoFaq
 * @typedef {{
 *   title: string,
 *   metaDescription: string,
 *   h1: string,
 *   intro: string,
 *   sections: CategorySeoSection[],
 *   faqs: CategorySeoFaq[],
 * }} CategorySeoEntry
 */

/** @type {Record<string, Record<string, CategorySeoEntry>>} */
export const CATEGORY_SEO_CONTENT = {
  "lb/beirut": {
    chocolate: {
      title: "Chocolate Delivery in Beirut, Lebanon | Same-Day | Presentail",
      metaDescription:
        "Order chocolate gifts for same-day delivery in Beirut — or send one anywhere else in Lebanon. Boxed chocolates, gift sets and more, delivered today.",
      h1: "Chocolate Delivery in Beirut, Lebanon",
      intro:
        "Order same-day chocolate delivery in Beirut — Hamra, Achrafieh, Gemmayzeh, Verdun and beyond — or send a box of chocolates anywhere else in Lebanon, whether you're ordering from another city or from abroad.",
      sections: [
        {
          heading: "Shop Chocolate by Occasion",
          body: "Chocolate makes the perfect gift for almost every occasion — from birthdays and anniversaries to a simple thank you. Pair a box of chocolates with flowers or a hamper for a fuller gift.",
          links: [
            { label: "Birthday chocolates", href: "/occasion/birthday" },
            { label: "Anniversary chocolates", href: "/occasion/anniversary" },
            { label: "Thank You chocolates", href: "/occasion/thank-you" },
            { label: "Thinking of You", href: "/occasion/thinking-of-you" },
          ],
        },
        {
          heading: "Delivering Chocolate Across Lebanon",
          body: "Presentail delivers chocolate gifts to every region of Lebanon. Order from Beirut for delivery in the capital, or send chocolates to friends and family anywhere else in the country.",
          links: [
            { label: "Chocolate delivery in Tripoli", href: "/en-lb/tripoli/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Saida", href: "/en-lb/saida/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Zahle", href: "/en-lb/zahle/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Jbeil", href: "/en-lb/jbeil/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Batroun", href: "/en-lb/batroun/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Tyre", href: "/en-lb/tyre/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Metn", href: "/en-lb/metn/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Kesserwan", href: "/en-lb/kesserwan/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Baabda", href: "/en-lb/baabda/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Aley", href: "/en-lb/aley/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Chouf", href: "/en-lb/chouf/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Nabatieh", href: "/en-lb/nabatieh/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Koura", href: "/en-lb/koura/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Bcharre", href: "/en-lb/bcharee/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Zgharta", href: "/en-lb/zghorta/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Akkar", href: "/en-lb/akkar/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Hermel", href: "/en-lb/hermel/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Baalbeck", href: "/en-lb/baalbeck/category/chocolate", absolute: true },
            { label: "Chocolate delivery in West Bekaa", href: "/en-lb/west-bekaa/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Rachaya", href: "/en-lb/rechaya/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Hasbaya", href: "/en-lb/hasbaya/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Marjayoun", href: "/en-lb/marjayoun/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Bint Jbeil", href: "/en-lb/bent-jbeil/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Jezzine", href: "/en-lb/jezzine/category/chocolate", absolute: true },
            { label: "Chocolate delivery in Minnieh-Denniyeh", href: "/en-lb/minnieh-dennaya/category/chocolate", absolute: true },
          ],
        },
      ],
      faqs: [
        {
          q: "Can I get same-day chocolate delivery in Beirut?",
          a: "Yes — order before midday for same-day chocolate delivery in Beirut. Orders placed after midday are scheduled for the next available delivery window.",
        },
        {
          q: "Do you deliver chocolate gifts outside Beirut, anywhere in Lebanon?",
          a: "Yes, Presentail delivers chocolate gifts across Lebanon — Tripoli, Saida, Zahle, Jbeil and every other city and region. Select your delivery address at checkout to confirm availability.",
        },
        {
          q: "Can I order chocolate from abroad for delivery in Lebanon?",
          a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Lebanon. Presentail accepts international credit and debit cards at checkout.",
        },
        {
          q: "What chocolate gifts are available?",
          a: "Presentail's chocolate selection includes boxed chocolates, gift sets and assortment boxes. Browse this page for the current range — new products are added regularly.",
        },
        {
          q: "Can I add a personalised message with the chocolate?",
          a: "Yes — add your message in the gift note field at checkout and it will be included with the delivery.",
        },
        {
          q: "Do you deliver chocolate gifts to hotels or offices in Beirut?",
          a: "Yes — just enter the hotel or office address at checkout and we'll deliver there.",
        },
      ],
    },
    balloons: {
      title: "Balloon Delivery in Beirut, Lebanon | Same-Day | Presentail",
      metaDescription:
        "Same-day balloon delivery in Beirut — helium, mylar and balloon bouquets for birthdays, graduations and celebrations. We also deliver across Lebanon.",
      h1: "Balloon Delivery in Beirut, Lebanon",
      intro:
        "Order same-day balloon delivery in Beirut — Hamra, Achrafieh, Gemmayzeh, Verdun and beyond — or send balloons anywhere else in Lebanon, whether you're ordering from another city or from abroad.",
      sections: [
        {
          heading: "Shop Balloons by Type",
          body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Beirut.",
          links: [
            { label: "Helium balloons", href: "/category/balloons" },
            { label: "Foil & mylar balloons", href: "/category/balloons" },
            { label: "Balloon bouquets", href: "/category/balloons" },
            { label: "Number & letter balloons", href: "/category/balloons" },
          ],
        },
        {
          heading: "Shop Balloons by Occasion",
          body: "Balloons suit almost every celebration — from birthdays and anniversaries to a new baby's arrival or a graduation. Pair balloons with flowers, chocolates or a cake for a complete gift.",
          links: [
            { label: "Birthday balloons", href: "/occasion/birthday" },
            { label: "Anniversary balloons", href: "/occasion/anniversary" },
          ],
        },
        {
          heading: "Delivering Balloons Across Lebanon",
          body: "Presentail delivers balloons to every region of Lebanon. Order from Beirut for delivery in the capital, or send balloons to friends and family anywhere else in the country.",
          links: [
            { label: "Balloon delivery in Tripoli", href: "/en-lb/tripoli/category/balloons", absolute: true },
            { label: "Balloon delivery in Saida", href: "/en-lb/saida/category/balloons", absolute: true },
            { label: "Balloon delivery in Zahle", href: "/en-lb/zahle/category/balloons", absolute: true },
            { label: "Balloon delivery in Jbeil", href: "/en-lb/jbeil/category/balloons", absolute: true },
            { label: "Balloon delivery in Batroun", href: "/en-lb/batroun/category/balloons", absolute: true },
            { label: "Balloon delivery in Tyre", href: "/en-lb/tyre/category/balloons", absolute: true },
            { label: "Balloon delivery in Metn", href: "/en-lb/metn/category/balloons", absolute: true },
            { label: "Balloon delivery in Kesserwan", href: "/en-lb/kesserwan/category/balloons", absolute: true },
            { label: "Balloon delivery in Baabda", href: "/en-lb/baabda/category/balloons", absolute: true },
            { label: "Balloon delivery in Aley", href: "/en-lb/aley/category/balloons", absolute: true },
            { label: "Balloon delivery in Chouf", href: "/en-lb/chouf/category/balloons", absolute: true },
            { label: "Balloon delivery in Nabatieh", href: "/en-lb/nabatieh/category/balloons", absolute: true },
            { label: "Balloon delivery in Koura", href: "/en-lb/koura/category/balloons", absolute: true },
            { label: "Balloon delivery in Bcharre", href: "/en-lb/bcharee/category/balloons", absolute: true },
            { label: "Balloon delivery in Zgharta", href: "/en-lb/zghorta/category/balloons", absolute: true },
            { label: "Balloon delivery in Akkar", href: "/en-lb/akkar/category/balloons", absolute: true },
            { label: "Balloon delivery in Hermel", href: "/en-lb/hermel/category/balloons", absolute: true },
            { label: "Balloon delivery in Baalbeck", href: "/en-lb/baalbeck/category/balloons", absolute: true },
            { label: "Balloon delivery in West Bekaa", href: "/en-lb/west-bekaa/category/balloons", absolute: true },
            { label: "Balloon delivery in Rachaya", href: "/en-lb/rechaya/category/balloons", absolute: true },
            { label: "Balloon delivery in Hasbaya", href: "/en-lb/hasbaya/category/balloons", absolute: true },
            { label: "Balloon delivery in Marjayoun", href: "/en-lb/marjayoun/category/balloons", absolute: true },
            { label: "Balloon delivery in Bint Jbeil", href: "/en-lb/bent-jbeil/category/balloons", absolute: true },
            { label: "Balloon delivery in Jezzine", href: "/en-lb/jezzine/category/balloons", absolute: true },
            { label: "Balloon delivery in Minnieh-Denniyeh", href: "/en-lb/minnieh-dennaya/category/balloons", absolute: true },
          ],
        },
      ],
      faqs: [
        {
          q: "Can I get same-day balloon delivery in Beirut?",
          a: "Yes — order before midday for same-day balloon delivery in Beirut. Orders placed after midday are scheduled for the next available delivery window.",
        },
        {
          q: "Do you deliver balloons to hospitals in Beirut?",
          a: "Yes — we deliver balloons to hospitals, schools, offices and homes anywhere in Beirut.",
        },
        {
          q: "Do you deliver balloons to schools in Beirut?",
          a: "Yes, we deliver to schools as well as homes, offices and hospitals.",
        },
        {
          q: "Do you deliver balloons outside Beirut, anywhere in Lebanon?",
          a: "Yes — we deliver balloons everywhere in Lebanon, not just Beirut.",
        },
        {
          q: "What types of balloons do you offer?",
          a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current range.",
        },
      ],
    },
    cakes: {
      title: "Cake Delivery in Beirut, Lebanon | Same-Day | Presentail",
      metaDescription:
        "Order fresh cakes for same-day delivery in Beirut and across Lebanon. Birthday, wedding and celebration cakes, delivered today.",
      h1: "Cake Delivery in Beirut, Lebanon",
      intro:
        "Order same-day cake delivery in Beirut — Hamra, Achrafieh, Gemmayzeh, Verdun and beyond — or send a cake anywhere else in Lebanon, whether you're ordering from another city or from abroad for someone here.",
      sections: [
        {
          heading: "Shop Cakes by Occasion",
          body: "Find the right cake for every celebration — from birthday and anniversary cakes to elegant wedding cakes. Every cake is prepared fresh and delivered the same day.",
          links: [
            { label: "Birthday cakes", href: "/occasion/birthday" },
            { label: "Anniversary cakes", href: "/occasion/anniversary" },
            { label: "Wedding cakes", href: "/occasion/wedding" },
          ],
        },
        {
          heading: "Delivering Cakes Across Lebanon",
          body: "Presentail delivers cakes to every region of Lebanon. Order from Beirut for delivery in the capital, or send a cake to friends and family anywhere across the country.",
          links: [
            { label: "Cake delivery in Tripoli", href: "/en-lb/tripoli/category/cakes", absolute: true },
            { label: "Cake delivery in Saida", href: "/en-lb/saida/category/cakes", absolute: true },
            { label: "Cake delivery in Zahle", href: "/en-lb/zahle/category/cakes", absolute: true },
            { label: "Cake delivery in Jbeil", href: "/en-lb/jbeil/category/cakes", absolute: true },
            { label: "Cake delivery in Batroun", href: "/en-lb/batroun/category/cakes", absolute: true },
            { label: "Cake delivery in Tyre", href: "/en-lb/tyre/category/cakes", absolute: true },
            { label: "Cake delivery in Metn", href: "/en-lb/metn/category/cakes", absolute: true },
            { label: "Cake delivery in Kesserwan", href: "/en-lb/kesserwan/category/cakes", absolute: true },
            { label: "Cake delivery in Baabda", href: "/en-lb/baabda/category/cakes", absolute: true },
            { label: "Cake delivery in Aley", href: "/en-lb/aley/category/cakes", absolute: true },
            { label: "Cake delivery in Chouf", href: "/en-lb/chouf/category/cakes", absolute: true },
            { label: "Cake delivery in Nabatieh", href: "/en-lb/nabatieh/category/cakes", absolute: true },
            { label: "Cake delivery in Koura", href: "/en-lb/koura/category/cakes", absolute: true },
            { label: "Cake delivery in Bcharre", href: "/en-lb/bcharee/category/cakes", absolute: true },
            { label: "Cake delivery in Zgharta", href: "/en-lb/zghorta/category/cakes", absolute: true },
            { label: "Cake delivery in Akkar", href: "/en-lb/akkar/category/cakes", absolute: true },
            { label: "Cake delivery in Hermel", href: "/en-lb/hermel/category/cakes", absolute: true },
            { label: "Cake delivery in Baalbeck", href: "/en-lb/baalbeck/category/cakes", absolute: true },
            { label: "Cake delivery in West Bekaa", href: "/en-lb/west-bekaa/category/cakes", absolute: true },
            { label: "Cake delivery in Rachaya", href: "/en-lb/rechaya/category/cakes", absolute: true },
            { label: "Cake delivery in Hasbaya", href: "/en-lb/hasbaya/category/cakes", absolute: true },
            { label: "Cake delivery in Marjayoun", href: "/en-lb/marjayoun/category/cakes", absolute: true },
            { label: "Cake delivery in Bint Jbeil", href: "/en-lb/bent-jbeil/category/cakes", absolute: true },
            { label: "Cake delivery in Jezzine", href: "/en-lb/jezzine/category/cakes", absolute: true },
            { label: "Cake delivery in Minnieh-Denniyeh", href: "/en-lb/minnieh-dennaya/category/cakes", absolute: true },
          ],
        },
      ],
      faqs: [
        {
          q: "Can I get same-day cake delivery in Beirut?",
          a: "Yes — order before midday for same-day cake delivery in Beirut. Orders placed after midday are scheduled for the next available delivery window.",
        },
        {
          q: "Do you deliver cakes outside Beirut, anywhere in Lebanon?",
          a: "Yes, Presentail delivers cakes across Lebanon — Tripoli, Saida, Zahle, Jbeil, and every other city and region. Select your delivery address at checkout to confirm availability.",
        },
        {
          q: "Can I order a cake from abroad for delivery in Lebanon?",
          a: "Yes — you can place an order from anywhere in the world and send a cake to someone in Lebanon. Presentail accepts international credit and debit cards at checkout.",
        },
        {
          q: "What cake flavours and sizes are available?",
          a: "The cake selection includes fresh options such as Strawberry Cheesecake and Chocolate Rocher Cake, updated regularly. Browse the full range on this page for current availability.",
        },
        {
          q: "Can I add a personalised message or card with the cake?",
          a: "Yes — add your message in the gift note field at checkout and it will be included with the delivery.",
        },
      ],
    },
  },
};

/**
 * Look up curated SEO content for a specific category page.
 * Returns null for non-EN locales, missing keys, or any absent entry.
 *
 * @param {{ country?: string|null, city?: string|null, slug?: string|null, lang?: string|null }} opts
 * @returns {CategorySeoEntry|null}
 */
export function getCategorySeoContent({ country, city, slug, lang } = {}) {
  if (lang && lang !== "en") return null;
  if (!country || !city || !slug) return null;
  return CATEGORY_SEO_CONTENT[`${country}/${city}`]?.[slug] ?? null;
}

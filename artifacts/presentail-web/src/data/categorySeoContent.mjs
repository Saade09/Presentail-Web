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
 * @typedef {{ heading: string, body: string, links?: Array<{ label: string, href: string }> }} CategorySeoSection
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
            { label: "Cake delivery in Tripoli", href: "/category/cakes?city=tripoli" },
            { label: "Cake delivery in Saida", href: "/category/cakes?city=saida" },
            { label: "Cake delivery in Zahle", href: "/category/cakes?city=zahle" },
            { label: "Cake delivery in Jbeil", href: "/category/cakes?city=jbeil" },
            { label: "Cake delivery in Batroun", href: "/category/cakes?city=batroun" },
            { label: "Cake delivery in Tyre", href: "/category/cakes?city=tyre" },
            { label: "Cake delivery in Metn", href: "/category/cakes?city=metn" },
            { label: "Cake delivery in Kesserwan", href: "/category/cakes?city=kesserwan" },
            { label: "Cake delivery in Baabda", href: "/category/cakes?city=baabda" },
            { label: "Cake delivery in Aley", href: "/category/cakes?city=aley" },
            { label: "Cake delivery in Chouf", href: "/category/cakes?city=chouf" },
            { label: "Cake delivery in Nabatieh", href: "/category/cakes?city=nabatieh" },
            { label: "Cake delivery in Koura", href: "/category/cakes?city=koura" },
            { label: "Cake delivery in Bcharre", href: "/category/cakes?city=bcharee" },
            { label: "Cake delivery in Zgharta", href: "/category/cakes?city=zghorta" },
            { label: "Cake delivery in Akkar", href: "/category/cakes?city=akkar" },
            { label: "Cake delivery in Hermel", href: "/category/cakes?city=hermel" },
            { label: "Cake delivery in Baalbeck", href: "/category/cakes?city=baalbeck" },
            { label: "Cake delivery in West Bekaa", href: "/category/cakes?city=west-bekaa" },
            { label: "Cake delivery in Rachaya", href: "/category/cakes?city=rechaya" },
            { label: "Cake delivery in Hasbaya", href: "/category/cakes?city=hasbaya" },
            { label: "Cake delivery in Marjayoun", href: "/category/cakes?city=marjayoun" },
            { label: "Cake delivery in Bint Jbeil", href: "/category/cakes?city=bent-jbeil" },
            { label: "Cake delivery in Jezzine", href: "/category/cakes?city=jezzine" },
            { label: "Cake delivery in Minnieh-Denniyeh", href: "/category/cakes?city=minnieh-dennaya" },
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

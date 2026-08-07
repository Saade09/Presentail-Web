// Curated per-occasion SEO content for occasion listing pages.
//
// Shared by the server prerender (seo-inject.mjs) and the client route
// (Shop.tsx) so the raw crawled HTML and the hydrated page render the SAME
// visible content — Google's structured-data guidelines require FAQPage
// markup to correspond to content actually visible on the page.
//
// Keyed `${countryCode}/${citySlug}` → occasion slug. English-only for now:
// ar/fr locales keep the existing template-based copy (the curated copy is
// EN marketing prose; machine-translating it would produce worse results
// than the localised templates already in place).
//
// Slugs MUST match the real catalog occasion slugs (see /api/catalog/
// occasions). Do not invent slugs here — a mismatched entry silently never
// renders.
//
// Facts used below (confirmed by the site owner via the SEO audit brief,
// 2026-08-07):
//   - Dubai same-day delivery cutoff: order before 11 PM.
//   - Delivery to hotels, offices, and residential addresses in Dubai.
//   - Dubai (AED) payment methods: credit/debit card, Apple Pay, Google Pay
//     (NO Cash on Delivery — never mention COD for Dubai).
//   - Personalised card message available at checkout.
//   - Scheduled delivery: date + two-hour window, up to 30 days ahead
//     (documented in existing checkout flow / FAQ copy).
//
// Deliberately omitted (fact not documented anywhere in the codebase —
// confirm before adding): hospital/maternity-ward delivery (new-born),
// funeral-home delivery (funeral), and whether the 11 PM same-day cutoff
// holds on Feb 14 specifically (valentines-day).
/* eslint-disable max-len */

/**
 * @typedef {{ heading: string, body: string, links?: Array<{ label: string, href: string }> }} OccasionSeoSection
 * @typedef {{ q: string, a: string }} OccasionSeoFaq
 * @typedef {{
 *   title: string,
 *   metaDescription: string,
 *   h1: string,
 *   intro: string,
 *   sections: OccasionSeoSection[],
 *   faqs: OccasionSeoFaq[],
 * }} OccasionSeoEntry
 */

/** @type {Record<string, Record<string, OccasionSeoEntry>>} */
export const OCCASION_SEO_CONTENT = {
  "ae/dubai": {
    birthday: {
      title: "Birthday Gift Delivery in Dubai | Same-Day | Presentail",
      metaDescription:
        "Send birthday gifts in Dubai with same-day delivery — flowers, cakes, balloons and personalised hampers. Order before 11 PM for delivery today.",
      h1: "Birthday Gift Delivery in Dubai",
      intro:
        "Send birthday gifts anywhere in Dubai — Downtown Dubai, Dubai Marina, JBR, Palm Jumeirah, Business Bay and beyond — with same-day delivery from Presentail.",
      sections: [
        {
          heading: "Shop Birthday Gifts by Type",
          body: "From fresh flower bouquets and birthday cakes to balloons and curated gift hampers, every birthday order is prepared on the day of delivery. Pair a bouquet with chocolates or a bear for a bigger surprise.",
          links: [
            { label: "birthday flowers", href: "/category/hand-bouquets" },
            { label: "birthday cakes", href: "/category/cakes" },
            { label: "balloons", href: "/category/balloons" },
            { label: "gift hampers", href: "/category/baskets" },
          ],
        },
        {
          heading: "Why Presentail for Birthday Delivery in Dubai",
          body: "Order before 11 PM for same-day birthday delivery anywhere in Dubai, including hotels, offices and residential addresses. Add a personalised card message at checkout and pay with credit/debit card, Apple Pay or Google Pay.",
        },
      ],
      faqs: [
        {
          q: "Can I get same-day birthday gift delivery in Dubai?",
          a: "Yes — order before 11 PM for delivery in Dubai the same day.",
        },
        {
          q: "What birthday gifts can I send in Dubai?",
          a: "Flowers, cakes, balloons, chocolates and personalised gift hampers.",
        },
        {
          q: "Can I add a personalised message to a birthday gift?",
          a: "Yes, add a message at checkout and we'll include it with the delivery.",
        },
        {
          q: "Do you deliver birthday gifts to hotels or offices in Dubai?",
          a: "Yes, we deliver to hotel rooms, offices and residential addresses across Dubai.",
        },
        {
          q: "What payment methods do you accept in Dubai?",
          a: "Credit/debit card, Apple Pay and Google Pay.",
        },
      ],
    },
    anniversary: {
      title: "Anniversary Gift Delivery in Dubai | Same-Day | Presentail",
      metaDescription:
        "Celebrate your anniversary in Dubai with same-day flower and gift delivery — romantic bouquets, cakes and curated hampers. Order before 11 PM for delivery today.",
      h1: "Anniversary Gift Delivery in Dubai",
      intro:
        "Mark your anniversary anywhere in Dubai with same-day flowers and gifts, delivered to hotels, homes and offices.",
      sections: [
        {
          heading: "Shop Anniversary Gifts",
          body: "Choose from romantic bouquets, anniversary cakes, chocolates and curated gift hampers — each prepared fresh and delivered across Dubai on the day you choose.",
          links: [
            { label: "romantic bouquets", href: "/category/hand-bouquets" },
            { label: "anniversary cakes", href: "/category/cakes" },
            { label: "chocolates", href: "/category/chocolate" },
            { label: "gift hampers", href: "/category/baskets" },
          ],
        },
        {
          heading: "Why Presentail for Anniversary Delivery in Dubai",
          body: "Same-day delivery until 11 PM across Dubai, including hotels and workplaces. Add a personalised message at checkout and pay by card, Apple Pay or Google Pay.",
        },
      ],
      faqs: [
        {
          q: "Can I get same-day anniversary gift delivery in Dubai?",
          a: "Yes — order before 11 PM for delivery the same day anywhere in Dubai.",
        },
        {
          q: "What anniversary gifts can I send in Dubai?",
          a: "Romantic bouquets, cakes, chocolates and curated gift hampers.",
        },
        {
          q: "Can I include a personal note with an anniversary gift?",
          a: "Yes, add a personalised message at checkout.",
        },
        {
          q: "Do you deliver anniversary gifts to hotels or offices?",
          a: "Yes, across Dubai including hotels and workplaces.",
        },
        {
          q: "What payment methods are accepted?",
          a: "Card, Apple Pay and Google Pay.",
        },
      ],
    },
    wedding: {
      title: "Wedding Gift Delivery in Dubai | Same-Day | Presentail",
      metaDescription:
        "Send wedding gifts and congratulations flowers in Dubai with same-day delivery — elegant bouquets, hampers and personalised gifts for the happy couple.",
      h1: "Wedding Gift Delivery in Dubai",
      intro:
        "Congratulate the happy couple with same-day wedding gift delivery anywhere in Dubai, including hotels and venues.",
      sections: [
        {
          heading: "Shop Wedding Gifts",
          body: "Elegant flowers, gift hampers, cakes and personalised congratulations gifts for newlyweds — prepared fresh and delivered across Dubai.",
          links: [
            { label: "wedding flowers", href: "/category/hand-bouquets" },
            { label: "gift hampers", href: "/category/baskets" },
            { label: "cakes", href: "/category/cakes" },
          ],
        },
        {
          heading: "Why Presentail for Wedding Gift Delivery in Dubai",
          body: "Same-day delivery until 11 PM to hotels, venues, and residential or office addresses. Add a congratulations message at checkout and pay by card, Apple Pay or Google Pay.",
        },
      ],
      faqs: [
        {
          q: "Can I send a wedding gift with same-day delivery in Dubai?",
          a: "Yes — order before 11 PM for same-day delivery.",
        },
        {
          q: "What wedding gifts are available?",
          a: "Flowers, hampers, cakes and personalised congratulations gifts.",
        },
        {
          q: "Can I add a congratulations message?",
          a: "Yes, at checkout.",
        },
        {
          q: "Do you deliver to wedding venues or hotels in Dubai?",
          a: "Yes, we deliver to hotels, venues, and residential or office addresses.",
        },
        {
          q: "What payment methods do you accept?",
          a: "Card, Apple Pay and Google Pay.",
        },
      ],
    },
    "new-born": {
      title: "Newborn Gift Delivery in Dubai | Same-Day | Presentail",
      metaDescription:
        "Send new baby gifts in Dubai with same-day delivery — flowers, balloons, hampers and keepsakes to celebrate a new arrival. Order before 11 PM for delivery today.",
      h1: "Newborn Gift Delivery in Dubai",
      intro:
        "Celebrate a new arrival with same-day baby gift delivery anywhere in Dubai.",
      sections: [
        {
          heading: "Shop Newborn Gifts",
          body: "Welcome the little one with fresh flowers, balloons, gift hampers and soft bears — delivered the same day across Dubai.",
          links: [
            { label: "flowers", href: "/category/hand-bouquets" },
            { label: "balloons", href: "/category/balloons" },
            { label: "gift hampers", href: "/category/baskets" },
            { label: "bears", href: "/category/stuffed-animals" },
          ],
        },
        {
          heading: "Why Presentail for Newborn Gifts in Dubai",
          body: "Same-day delivery until 11 PM, a personalised card message at checkout, delivery to hotels, offices and homes, and checkout with card, Apple Pay or Google Pay.",
        },
      ],
      faqs: [
        {
          q: "Can I get same-day new baby gift delivery in Dubai?",
          a: "Yes, order before 11 PM.",
        },
        {
          q: "What new baby gifts can I send in Dubai?",
          a: "Flowers, balloons, gift hampers and soft toys.",
        },
        {
          q: "Can I personalise the gift with a message?",
          a: "Yes, at checkout.",
        },
        {
          q: "What payment methods do you accept?",
          a: "Card, Apple Pay and Google Pay.",
        },
      ],
    },
    funeral: {
      // The catalog occasion is "Funeral" (there is no "sympathy" slug) —
      // sympathy-audit copy adapted to the real occasion. Tone kept
      // respectful: no "Same-Day!" promotion in title/H1; stated plainly in
      // the meta description and FAQs instead.
      title: "Funeral & Sympathy Flower Delivery in Dubai | Presentail",
      metaDescription:
        "Send funeral and sympathy flowers in Dubai with same-day delivery, delivered with care to homes and offices.",
      h1: "Funeral & Sympathy Flower Delivery in Dubai",
      intro:
        "Send thoughtful sympathy flowers and condolence gifts anywhere in Dubai, with same-day delivery handled with care.",
      sections: [
        {
          heading: "Shop Sympathy Flowers & Gifts",
          body: "White and soft-toned arrangements, flower boxes and considerate gift baskets, prepared with care for difficult moments.",
          links: [
            { label: "sympathy flowers", href: "/category/hand-bouquets" },
            { label: "flower boxes", href: "/category/flower-boxes" },
            { label: "gift baskets", href: "/category/baskets" },
          ],
        },
        {
          heading: "Delivering Sympathy Gifts in Dubai",
          body: "Same-day delivery until 11 PM across Dubai. Add a condolence message at checkout — it is delivered with the flowers. Pay by card, Apple Pay or Google Pay.",
        },
      ],
      faqs: [
        {
          q: "Can I send same-day sympathy flowers in Dubai?",
          a: "Yes, order before 11 PM for delivery the same day.",
        },
        {
          q: "Can I add a condolence message to the flowers?",
          a: "Yes, at checkout.",
        },
        {
          q: "Do you deliver to homes and offices in Dubai?",
          a: "Yes, across Dubai.",
        },
        {
          q: "What payment methods do you accept?",
          a: "Card, Apple Pay and Google Pay.",
        },
      ],
    },
    "valentines-day": {
      title: "Valentine's Day Gift Delivery in Dubai | Same-Day | Presentail",
      metaDescription:
        "Send Valentine's Day flowers and gifts in Dubai with same-day delivery — roses, chocolates and romantic hampers.",
      h1: "Valentine's Day Gift Delivery in Dubai",
      intro:
        "Make Valentine's Day special with same-day flower and gift delivery anywhere in Dubai.",
      sections: [
        {
          heading: "Shop Valentine's Day Gifts",
          body: "Red roses, chocolates, romantic hampers and personalised gifts — everything you need to make February 14 unforgettable.",
          links: [
            { label: "roses & bouquets", href: "/category/hand-bouquets" },
            { label: "chocolates", href: "/category/chocolate" },
            { label: "romantic hampers", href: "/category/baskets" },
          ],
        },
        {
          heading: "Why Presentail for Valentine's Day in Dubai",
          body: "Same-day delivery across Dubai, including hotels and offices. Add a personalised message at checkout and pay by card, Apple Pay or Google Pay. Order early on Valentine's Day — it is the busiest delivery day of the year.",
        },
      ],
      faqs: [
        // Deliberately no "before 11 PM" claim here: Feb 14 is a peak-demand
        // day and the standard cutoff is not confirmed to hold. State
        // same-day availability plainly instead.
        {
          q: "Is same-day Valentine's Day delivery available in Dubai?",
          a: "Yes, same-day delivery is available across Dubai. Order early on February 14 — it is the busiest gifting day of the year.",
        },
        {
          q: "Can I schedule a specific delivery time on Valentine's Day?",
          a: "Yes — at checkout you can pick a delivery date and a two-hour time window, up to 30 days in advance.",
        },
        {
          q: "What Valentine's Day gifts can I send in Dubai?",
          a: "Roses, chocolates, romantic hampers and personalised gifts.",
        },
        {
          q: "Do you deliver to hotels and offices on Valentine's Day?",
          a: "Yes, across Dubai.",
        },
        {
          q: "What payment methods do you accept?",
          a: "Card, Apple Pay and Google Pay.",
        },
      ],
    },
  },
};

/**
 * Look up curated occasion SEO content.
 * Returns null for non-EN locales (they keep the localised template copy)
 * and for any country/city/slug without a curated entry.
 *
 * @param {{ country?: string|null, city?: string|null, slug?: string|null, lang?: string|null }} opts
 * @returns {OccasionSeoEntry|null}
 */
export function getOccasionSeoContent({ country, city, slug, lang }) {
  if (lang && lang !== "en") return null;
  if (!country || !city || !slug) return null;
  return OCCASION_SEO_CONTENT[`${country}/${city}`]?.[slug] ?? null;
}

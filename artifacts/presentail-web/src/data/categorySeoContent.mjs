// Curated per-category SEO content for category listing pages.
//
// Shared by the server prerender (seo-inject.mjs) and the client route
// (Shop.tsx) so the raw crawled HTML and the hydrated page render the SAME
// visible content — Google's structured-data guidelines require FAQPage
// markup to correspond to content actually visible on the page.
//
// Keyed by lang → `${countryCode}/${citySlug}` → category slug.
// All three supported locales (en/ar/fr) carry curated copy for each entry.
//
// Slugs MUST match the real catalog category slugs (see /api/catalog/
// categories). Do not invent slugs here — a mismatched entry silently never
// renders.
//
// Facts used below (confirmed from codebase, 2026-08-07):
//   - Beirut same-day delivery cutoff: order before midday (noon).
//     Source: seo-inject.mjs, src/data/faqsCopy.js.
//   - Lebanon payment methods: Credit Card, Apple Pay, Google Pay, Cash on
//     Delivery. Source: src/lib/locationData.mjs (paymentAccepted).
//   - Delivery covers all of Lebanon; nationwide from Beirut.
//     Source: src/lib/locationData.mjs (all LB cities enumerated).
//   - Gift notes / personalised messages: supported at checkout via the
//     orderNote field.
//   - International card orders: the site's mission copy confirms it serves
//     Lebanese diaspora ("locally and abroad"); standard Stripe acceptance.
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

/** @type {Record<string, Record<string, Record<string, CategorySeoEntry>>>} */
export const CATEGORY_SEO_CONTENT = {
  en: {
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
              // Batroun omitted — /en-lb/batroun/category/chocolate is noindex (too few products)
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
              // Batroun omitted — /en-lb/batroun/category/cakes is noindex (too few products)
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
              // Batroun omitted — /en-lb/batroun/category/balloons is noindex (too few products)
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
    },
    "ae/dubai": {
      balloons: {
        title: "Balloon Delivery in Dubai, UAE | Same-Day | Presentail",
        metaDescription:
          "Same-day balloon delivery in Dubai — helium, foil and mylar balloon bouquets for birthdays, graduations and celebrations. We also deliver across the UAE.",
        h1: "Balloon Delivery in Dubai, UAE",
        intro:
          "Order same-day balloon delivery in Dubai — Downtown, Marina, Jumeirah, Business Bay and beyond — or send balloons anywhere else in the UAE, whether you're ordering from another emirate or from abroad.",
        sections: [
          {
            heading: "Shop Balloons by Type",
            body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Dubai.",
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
            heading: "Delivering Balloons Across the UAE",
            body: "Presentail delivers balloons to every emirate in the UAE. Order from Dubai for delivery in the city, or send balloons to friends and family anywhere else in the country.",
            links: [
              { label: "Balloon delivery in Abu Dhabi", href: "/en-ae/abu-dhabi/category/balloons", absolute: true },
              { label: "Balloon delivery in Sharjah", href: "/en-ae/sharjah/category/balloons", absolute: true },
              { label: "Balloon delivery in Ajman", href: "/en-ae/ajman/category/balloons", absolute: true },
              { label: "Balloon delivery in Ras Al Khaimah", href: "/en-ae/ras-al-khaimah/category/balloons", absolute: true },
              { label: "Balloon delivery in Fujairah", href: "/en-ae/fujairah/category/balloons", absolute: true },
              { label: "Balloon delivery in Umm Al Quwain", href: "/en-ae/umm-al-quwain/category/balloons", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Can I get same-day balloon delivery in Dubai?",
            a: "Yes — order before 11 PM for same-day balloon delivery in Dubai. Orders placed after 11 PM are scheduled for the next available delivery window.",
          },
          {
            q: "Do you deliver balloons to hotels in Dubai?",
            a: "Yes — we deliver balloons to hotels, offices, homes and event venues anywhere in Dubai.",
          },
          {
            q: "Do you deliver balloons outside Dubai, anywhere in the UAE?",
            a: "Yes — we deliver balloons everywhere in the UAE, including Abu Dhabi, Sharjah, Ajman, Ras Al Khaimah and beyond.",
          },
          {
            q: "Can I order balloons from abroad for delivery in Dubai?",
            a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Dubai. Presentail accepts international credit and debit cards at checkout.",
          },
          {
            q: "What types of balloons do you offer?",
            a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current range.",
          },
        ],
      },
    },
    "cy/nicosia": {
      balloons: {
        title: "Balloon Delivery in Nicosia, Cyprus | Same-Day | Presentail",
        metaDescription:
          "Same-day balloon delivery in Nicosia — helium, foil and mylar balloon bouquets for birthdays, graduations and celebrations. We also deliver across Cyprus.",
        h1: "Balloon Delivery in Nicosia, Cyprus",
        intro:
          "Order same-day balloon delivery in Nicosia or send balloons anywhere else in Cyprus, whether you're ordering from another city or from abroad.",
        sections: [
          {
            heading: "Shop Balloons by Type",
            body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Nicosia.",
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
            heading: "Delivering Balloons Across Cyprus",
            body: "Presentail delivers balloons to every city in Cyprus. Order from Nicosia for delivery in the capital, or send balloons to friends and family anywhere else on the island.",
            links: [
              { label: "Balloon delivery in Limassol", href: "/en-cy/limassol/category/balloons", absolute: true },
              { label: "Balloon delivery in Larnaca", href: "/en-cy/larnaca/category/balloons", absolute: true },
              { label: "Balloon delivery in Paphos", href: "/en-cy/paphos/category/balloons", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Can I get same-day balloon delivery in Nicosia?",
            a: "Yes — order before midday for same-day balloon delivery in Nicosia. Orders placed after midday are scheduled for the next available delivery window.",
          },
          {
            q: "Do you deliver balloons to hotels and offices in Nicosia?",
            a: "Yes — we deliver balloons to hotels, offices, homes and event venues anywhere in Nicosia.",
          },
          {
            q: "Do you deliver balloons outside Nicosia, anywhere in Cyprus?",
            a: "Yes — we deliver balloons everywhere in Cyprus, including Limassol, Larnaca and Paphos.",
          },
          {
            q: "Can I order balloons from abroad for delivery in Cyprus?",
            a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Cyprus. Presentail accepts international credit and debit cards at checkout.",
          },
          {
            q: "What types of balloons do you offer?",
            a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current range.",
          },
        ],
      },
    },

    // -----------------------------------------------------------------------
    // Cyprus — non-hub city balloon pages
    // Each entry carries unique city-specific copy so it earns its own
    // indexable URL rather than consolidating under the Nicosia hub canonical.
    // -----------------------------------------------------------------------

    "cy/larnaca": {
      balloons: {
        title: "Balloon Delivery Larnaca | Same-Day Balloons | Presentail",
        metaDescription:
          "Send balloons in Larnaca with same-day delivery. Helium, foil and number balloon bouquets for birthdays, graduations and new arrivals. Order by midday.",
        h1: "Balloon Delivery in Larnaca, Cyprus",
        intro:
          "Order same-day balloon delivery in Larnaca — or send balloons anywhere else in Cyprus, whether you're placing an order from abroad or from another city on the island. We deliver helium, foil and number balloons to homes, hotels, offices and event venues across Larnaca.",
        sections: [
          {
            heading: "Shop Balloons by Type",
            body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Larnaca.",
            links: [
              { label: "Helium balloons", href: "/category/balloons" },
              { label: "Foil & mylar balloons", href: "/category/balloons" },
              { label: "Balloon bouquets", href: "/category/balloons" },
              { label: "Number & letter balloons", href: "/category/balloons" },
            ],
          },
          {
            heading: "Shop Balloons by Occasion",
            body: "Balloons suit almost every celebration — from birthdays and graduations to a new baby's arrival or a Valentine's Day surprise. Pair balloons with flowers, chocolates or a cake for a complete Larnaca gift delivery.",
            links: [
              { label: "Birthday balloons", href: "/occasion/birthday" },
              { label: "Graduation balloons", href: "/occasion/graduation" },
              { label: "New baby balloons", href: "/occasion/new-born" },
              { label: "Anniversary balloons", href: "/occasion/anniversary" },
            ],
          },
          {
            // UNVERIFIED: neighbourhood names below sourced from public mapping
            // data; confirm delivery coverage with the ops team before running
            // paid search targeting these specific areas.
            heading: "Balloon Delivery Across Larnaca",
            body: "We deliver balloons across all parts of Larnaca, including the seafront at Finikoudes, Mackenzie Beach, Aradippou, Livadia, Oroklini and the areas around Larnaca airport. If you're sending to a hotel, villa or office, just enter the full address at checkout.",
            links: [],
          },
          {
            heading: "Delivering Balloons Across Cyprus",
            body: "Presentail delivers balloons to every city in Cyprus. Order from Larnaca, or send balloons to friends and family anywhere else on the island.",
            links: [
              { label: "Balloon delivery in Nicosia", href: "/en-cy/nicosia/category/balloons", absolute: true },
              { label: "Balloon delivery in Limassol", href: "/en-cy/limassol/category/balloons", absolute: true },
              { label: "Balloon delivery in Paphos", href: "/en-cy/paphos/category/balloons", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Can I get same-day balloon delivery in Larnaca?",
            a: "Yes — order before midday for same-day balloon delivery in Larnaca. Orders placed after midday are scheduled for the next available delivery window.",
          },
          {
            q: "Do you deliver balloons to hotels and resorts in Larnaca?",
            a: "Yes — we deliver balloons to hotels, resorts, villas, offices and homes anywhere in Larnaca. Enter the full address at checkout and we'll take care of the rest.",
          },
          {
            q: "Do you deliver to the Finikoudes area and Mackenzie Beach?",
            a: "Yes — we deliver balloons across all Larnaca neighbourhoods including Finikoudes, Mackenzie Beach, Aradippou and areas near the airport.",
          },
          {
            q: "Do you deliver balloons outside Larnaca, anywhere in Cyprus?",
            a: "Yes — we deliver balloons everywhere in Cyprus. Select your delivery city at checkout to confirm availability and timing.",
          },
          {
            q: "Can I order balloons from abroad for delivery in Larnaca?",
            a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Larnaca. Presentail accepts international credit and debit cards at checkout.",
          },
          {
            q: "What types of balloons do you offer in Larnaca?",
            a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current Larnaca range.",
          },
        ],
      },
    },

    "cy/limassol": {
      balloons: {
        title: "Balloon Delivery Limassol | Same-Day Balloons | Presentail",
        metaDescription:
          "Send balloons in Limassol with same-day delivery. Helium, foil and number balloon bouquets for birthdays, graduations and new arrivals. Order by midday.",
        h1: "Balloon Delivery in Limassol, Cyprus",
        intro:
          "Order same-day balloon delivery in Limassol — or send balloons anywhere else in Cyprus, whether you're placing an order from abroad or from another city on the island. We deliver helium, foil and number balloons to homes, hotels, offices and event venues across Limassol.",
        sections: [
          {
            heading: "Shop Balloons by Type",
            body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Limassol.",
            links: [
              { label: "Helium balloons", href: "/category/balloons" },
              { label: "Foil & mylar balloons", href: "/category/balloons" },
              { label: "Balloon bouquets", href: "/category/balloons" },
              { label: "Number & letter balloons", href: "/category/balloons" },
            ],
          },
          {
            heading: "Shop Balloons by Occasion",
            body: "Balloons suit almost every celebration — from birthdays and graduations to a new baby's arrival or an anniversary surprise. Pair balloons with flowers, chocolates or a cake for a complete Limassol gift delivery.",
            links: [
              { label: "Birthday balloons", href: "/occasion/birthday" },
              { label: "Graduation balloons", href: "/occasion/graduation" },
              { label: "New baby balloons", href: "/occasion/new-born" },
              { label: "Anniversary balloons", href: "/occasion/anniversary" },
            ],
          },
          {
            heading: "Delivering Balloons Across Cyprus",
            body: "Presentail delivers balloons to every city in Cyprus. Order from Limassol, or send balloons to friends and family anywhere else on the island.",
            links: [
              { label: "Balloon delivery in Nicosia", href: "/en-cy/nicosia/category/balloons", absolute: true },
              { label: "Balloon delivery in Larnaca", href: "/en-cy/larnaca/category/balloons", absolute: true },
              { label: "Balloon delivery in Paphos", href: "/en-cy/paphos/category/balloons", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Can I get same-day balloon delivery in Limassol?",
            a: "Yes — order before midday for same-day balloon delivery in Limassol. Orders placed after midday are scheduled for the next available delivery window.",
          },
          {
            q: "Do you deliver balloons to hotels and offices in Limassol?",
            a: "Yes — we deliver balloons to hotels, offices, homes and event venues anywhere in Limassol. Enter the full address at checkout.",
          },
          {
            q: "Do you deliver balloons outside Limassol, anywhere in Cyprus?",
            a: "Yes — we deliver balloons everywhere in Cyprus, including Nicosia, Larnaca and Paphos. Select your delivery city at checkout.",
          },
          {
            q: "Can I order balloons from abroad for delivery in Limassol?",
            a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Limassol. Presentail accepts international credit and debit cards at checkout.",
          },
          {
            q: "What types of balloons do you offer in Limassol?",
            a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current Limassol range.",
          },
        ],
      },
    },

    "cy/paphos": {
      balloons: {
        title: "Balloon Delivery Paphos | Same-Day Balloons | Presentail",
        metaDescription:
          "Send balloons in Paphos with same-day delivery. Helium, foil and number balloon bouquets for birthdays, graduations and new arrivals. Order by midday.",
        h1: "Balloon Delivery in Paphos, Cyprus",
        intro:
          "Order same-day balloon delivery in Paphos — or send balloons anywhere else in Cyprus, whether you're placing an order from abroad or from another city on the island. We deliver helium, foil and number balloons to homes, hotels, offices and event venues across Paphos.",
        sections: [
          {
            heading: "Shop Balloons by Type",
            body: "Presentail carries helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone occasions. Every type is available for same-day delivery across Paphos.",
            links: [
              { label: "Helium balloons", href: "/category/balloons" },
              { label: "Foil & mylar balloons", href: "/category/balloons" },
              { label: "Balloon bouquets", href: "/category/balloons" },
              { label: "Number & letter balloons", href: "/category/balloons" },
            ],
          },
          {
            heading: "Shop Balloons by Occasion",
            body: "Balloons suit almost every celebration — from birthdays and graduations to a new baby's arrival or an anniversary surprise. Pair balloons with flowers, chocolates or a cake for a complete Paphos gift delivery.",
            links: [
              { label: "Birthday balloons", href: "/occasion/birthday" },
              { label: "Graduation balloons", href: "/occasion/graduation" },
              { label: "New baby balloons", href: "/occasion/new-born" },
              { label: "Anniversary balloons", href: "/occasion/anniversary" },
            ],
          },
          {
            heading: "Delivering Balloons Across Cyprus",
            body: "Presentail delivers balloons to every city in Cyprus. Order from Paphos, or send balloons to friends and family anywhere else on the island.",
            links: [
              { label: "Balloon delivery in Nicosia", href: "/en-cy/nicosia/category/balloons", absolute: true },
              { label: "Balloon delivery in Larnaca", href: "/en-cy/larnaca/category/balloons", absolute: true },
              { label: "Balloon delivery in Limassol", href: "/en-cy/limassol/category/balloons", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Can I get same-day balloon delivery in Paphos?",
            a: "Yes — order before midday for same-day balloon delivery in Paphos. Orders placed after midday are scheduled for the next available delivery window.",
          },
          {
            q: "Do you deliver balloons to hotels and offices in Paphos?",
            a: "Yes — we deliver balloons to hotels, offices, homes and event venues anywhere in Paphos. Enter the full address at checkout.",
          },
          {
            q: "Do you deliver balloons outside Paphos, anywhere in Cyprus?",
            a: "Yes — we deliver balloons everywhere in Cyprus, including Nicosia, Limassol and Larnaca. Select your delivery city at checkout.",
          },
          {
            q: "Can I order balloons from abroad for delivery in Paphos?",
            a: "Yes — you can order from anywhere in the world and we'll deliver to the recipient in Paphos. Presentail accepts international credit and debit cards at checkout.",
          },
          {
            q: "What types of balloons do you offer in Paphos?",
            a: "Presentail offers helium balloons, foil and mylar balloons in shapes and characters, curated balloon bouquets, and number and letter balloons for milestone celebrations. Browse this page for the current Paphos range.",
          },
        ],
      },
    },
  },

  ar: {
    "lb/beirut": {
      chocolate: {
        title: "توصيل الشوكولاتة في بيروت، لبنان | توصيل في نفس اليوم | Presentail",
        metaDescription:
          "اطلب هدايا الشوكولاتة للتوصيل في نفس اليوم في بيروت — أو أرسل إلى أي مكان في لبنان. علب الشوكولاتة وأطقم الهدايا والمزيد، يُوصَّل اليوم.",
        h1: "توصيل الشوكولاتة في بيروت، لبنان",
        intro:
          "اطلب توصيل الشوكولاتة في نفس اليوم في بيروت — الحمرا والأشرفية والجميزة وفردان وما سواها — أو أرسل علبة شوكولاتة إلى أي مكان في لبنان، سواء كنت تطلب من مدينة أخرى أو من الخارج.",
        sections: [
          {
            heading: "تسوق الشوكولاتة حسب المناسبة",
            body: "الشوكولاتة هدية مثالية لكل مناسبة تقريبًا — من أعياد الميلاد وذكريات الزواج إلى مجرد شكر بسيط. زوّد علبة الشوكولاتة بالزهور أو بطقم هدايا لهدية أكثر اكتمالًا.",
            links: [
              { label: "شوكولاتة عيد الميلاد", href: "/occasion/birthday" },
              { label: "شوكولاتة الذكرى السنوية", href: "/occasion/anniversary" },
              { label: "شوكولاتة للشكر", href: "/occasion/thank-you" },
              { label: "أفكّر بك", href: "/occasion/thinking-of-you" },
            ],
          },
          {
            heading: "توصيل الشوكولاتة في جميع أنحاء لبنان",
            body: "تُوصّل Presentail هدايا الشوكولاتة إلى كل منطقة في لبنان. اطلب من بيروت للتوصيل في العاصمة، أو أرسل الشوكولاتة إلى الأصدقاء والعائلة في أي مكان آخر في البلاد.",
            links: [
              { label: "توصيل الشوكولاتة في طرابلس", href: "/ar-lb/tripoli/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في صيدا", href: "/ar-lb/saida/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في زحلة", href: "/ar-lb/zahle/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في جبيل", href: "/ar-lb/jbeil/category/chocolate", absolute: true },
              // Batroun omitted — /ar-lb/batroun/category/chocolate is noindex (too few products)
              { label: "توصيل الشوكولاتة في صور", href: "/ar-lb/tyre/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في المتن", href: "/ar-lb/metn/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في كسروان", href: "/ar-lb/kesserwan/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في بعبدا", href: "/ar-lb/baabda/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في عاليه", href: "/ar-lb/aley/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في الشوف", href: "/ar-lb/chouf/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في النبطية", href: "/ar-lb/nabatieh/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في الكورة", href: "/ar-lb/koura/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في بشري", href: "/ar-lb/bcharee/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في زغرتا", href: "/ar-lb/zghorta/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في عكار", href: "/ar-lb/akkar/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في الهرمل", href: "/ar-lb/hermel/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في بعلبك", href: "/ar-lb/baalbeck/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في غرب البقاع", href: "/ar-lb/west-bekaa/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في راشيا", href: "/ar-lb/rechaya/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في حاصبيا", href: "/ar-lb/hasbaya/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في مرجعيون", href: "/ar-lb/marjayoun/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في بنت جبيل", href: "/ar-lb/bent-jbeil/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في جزين", href: "/ar-lb/jezzine/category/chocolate", absolute: true },
              { label: "توصيل الشوكولاتة في المنية-الضنية", href: "/ar-lb/minnieh-dennaya/category/chocolate", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "هل يمكنني الحصول على توصيل الشوكولاتة في نفس اليوم في بيروت؟",
            a: "نعم — اطلب قبل الظهر للحصول على توصيل الشوكولاتة في نفس اليوم في بيروت. الطلبات التي تُقدَّم بعد الظهر تُجدوَل لوقت التوصيل التالي المتاح.",
          },
          {
            q: "هل توصلون هدايا الشوكولاتة خارج بيروت، في أي مكان في لبنان؟",
            a: "نعم، تُوصّل Presentail هدايا الشوكولاتة في جميع أنحاء لبنان — طرابلس وصيدا وزحلة وجبيل وكل مدينة ومنطقة. اختر عنوان التوصيل عند الدفع للتأكد من التوفر.",
          },
          {
            q: "هل يمكنني طلب الشوكولاتة من الخارج للتوصيل في لبنان؟",
            a: "نعم — يمكنك الطلب من أي مكان في العالم وسنوصّل إلى المستلم في لبنان. تقبل Presentail بطاقات الائتمان والخصم الدولية عند الدفع.",
          },
          {
            q: "ما هي هدايا الشوكولاتة المتاحة؟",
            a: "تشمل مجموعة الشوكولاتة لدى Presentail علب الشوكولاتة وأطقم الهدايا وصناديق التشكيلة. تصفح هذه الصفحة للاطلاع على المجموعة الحالية — تُضاف منتجات جديدة بانتظام.",
          },
          {
            q: "هل يمكنني إضافة رسالة شخصية مع الشوكولاتة؟",
            a: "نعم — أضف رسالتك في حقل ملاحظة الهدية عند الدفع وستُرفق مع التوصيل.",
          },
          {
            q: "هل توصلون هدايا الشوكولاتة إلى الفنادق أو المكاتب في بيروت؟",
            a: "نعم — فقط أدخل عنوان الفندق أو المكتب عند الدفع وسنوصّل إليه.",
          },
        ],
      },
      cakes: {
        title: "توصيل الكيك في بيروت، لبنان | توصيل في نفس اليوم | Presentail",
        metaDescription:
          "اطلب كيكًا طازجًا للتوصيل في نفس اليوم في بيروت وفي جميع أنحاء لبنان. كيك عيد الميلاد والأعراس والمناسبات، يُوصَّل اليوم.",
        h1: "توصيل الكيك في بيروت، لبنان",
        intro:
          "اطلب توصيل الكيك في نفس اليوم في بيروت — الحمرا والأشرفية والجميزة وفردان وما سواها — أو أرسل كيكًا إلى أي مكان في لبنان، سواء كنت تطلب من مدينة أخرى أو من الخارج.",
        sections: [
          {
            heading: "تسوق الكيك حسب المناسبة",
            body: "اعثر على الكيك المناسب لكل احتفال — من كيك عيد الميلاد والذكرى السنوية إلى كيك حفلات الأعراس الأنيقة. كل كيك يُحضَّر طازجًا ويُوصَّل في نفس اليوم.",
            links: [
              { label: "كيك عيد الميلاد", href: "/occasion/birthday" },
              { label: "كيك الذكرى السنوية", href: "/occasion/anniversary" },
              { label: "كيك الأعراس", href: "/occasion/wedding" },
            ],
          },
          {
            heading: "توصيل الكيك في جميع أنحاء لبنان",
            body: "تُوصّل Presentail الكيك إلى كل منطقة في لبنان. اطلب من بيروت للتوصيل في العاصمة، أو أرسل كيكًا للأصدقاء والعائلة في أي مكان في البلاد.",
            links: [
              { label: "توصيل الكيك في طرابلس", href: "/ar-lb/tripoli/category/cakes", absolute: true },
              { label: "توصيل الكيك في صيدا", href: "/ar-lb/saida/category/cakes", absolute: true },
              { label: "توصيل الكيك في زحلة", href: "/ar-lb/zahle/category/cakes", absolute: true },
              { label: "توصيل الكيك في جبيل", href: "/ar-lb/jbeil/category/cakes", absolute: true },
              // Batroun omitted — /ar-lb/batroun/category/cakes is noindex (too few products)
              { label: "توصيل الكيك في صور", href: "/ar-lb/tyre/category/cakes", absolute: true },
              { label: "توصيل الكيك في المتن", href: "/ar-lb/metn/category/cakes", absolute: true },
              { label: "توصيل الكيك في كسروان", href: "/ar-lb/kesserwan/category/cakes", absolute: true },
              { label: "توصيل الكيك في بعبدا", href: "/ar-lb/baabda/category/cakes", absolute: true },
              { label: "توصيل الكيك في عاليه", href: "/ar-lb/aley/category/cakes", absolute: true },
              { label: "توصيل الكيك في الشوف", href: "/ar-lb/chouf/category/cakes", absolute: true },
              { label: "توصيل الكيك في النبطية", href: "/ar-lb/nabatieh/category/cakes", absolute: true },
              { label: "توصيل الكيك في الكورة", href: "/ar-lb/koura/category/cakes", absolute: true },
              { label: "توصيل الكيك في بشري", href: "/ar-lb/bcharee/category/cakes", absolute: true },
              { label: "توصيل الكيك في زغرتا", href: "/ar-lb/zghorta/category/cakes", absolute: true },
              { label: "توصيل الكيك في عكار", href: "/ar-lb/akkar/category/cakes", absolute: true },
              { label: "توصيل الكيك في الهرمل", href: "/ar-lb/hermel/category/cakes", absolute: true },
              { label: "توصيل الكيك في بعلبك", href: "/ar-lb/baalbeck/category/cakes", absolute: true },
              { label: "توصيل الكيك في غرب البقاع", href: "/ar-lb/west-bekaa/category/cakes", absolute: true },
              { label: "توصيل الكيك في راشيا", href: "/ar-lb/rechaya/category/cakes", absolute: true },
              { label: "توصيل الكيك في حاصبيا", href: "/ar-lb/hasbaya/category/cakes", absolute: true },
              { label: "توصيل الكيك في مرجعيون", href: "/ar-lb/marjayoun/category/cakes", absolute: true },
              { label: "توصيل الكيك في بنت جبيل", href: "/ar-lb/bent-jbeil/category/cakes", absolute: true },
              { label: "توصيل الكيك في جزين", href: "/ar-lb/jezzine/category/cakes", absolute: true },
              { label: "توصيل الكيك في المنية-الضنية", href: "/ar-lb/minnieh-dennaya/category/cakes", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "هل يمكنني الحصول على توصيل كيك في نفس اليوم في بيروت؟",
            a: "نعم — اطلب قبل الظهر للحصول على توصيل الكيك في نفس اليوم في بيروت. الطلبات التي تُقدَّم بعد الظهر تُجدوَل لوقت التوصيل التالي المتاح.",
          },
          {
            q: "هل توصلون الكيك خارج بيروت، في أي مكان في لبنان؟",
            a: "نعم، تُوصّل Presentail الكيك في جميع أنحاء لبنان — طرابلس وصيدا وزحلة وجبيل وكل مدينة ومنطقة. اختر عنوان التوصيل عند الدفع للتأكد من التوفر.",
          },
          {
            q: "هل يمكنني طلب كيك من الخارج للتوصيل في لبنان؟",
            a: "نعم — يمكنك تقديم الطلب من أي مكان في العالم وإرسال كيك لشخص في لبنان. تقبل Presentail بطاقات الائتمان والخصم الدولية عند الدفع.",
          },
          {
            q: "ما هي نكهات الكيك والمقاسات المتاحة؟",
            a: "يشمل اختيار الكيك خيارات طازجة مثل تشيزكيك الفراولة وكيك الشوكولاتة روشيه، يُحدَّث بانتظام. تصفح المجموعة الكاملة في هذه الصفحة للاطلاع على التوفر الحالي.",
          },
          {
            q: "هل يمكنني إضافة رسالة شخصية أو بطاقة مع الكيك؟",
            a: "نعم — أضف رسالتك في حقل ملاحظة الهدية عند الدفع وستُرفق مع التوصيل.",
          },
        ],
      },
    },
  },

  fr: {
    "lb/beirut": {
      chocolate: {
        title: "Livraison de Chocolat à Beyrouth, Liban | Livraison le Jour Même | Presentail",
        metaDescription:
          "Commandez des cadeaux chocolat pour une livraison le jour même à Beyrouth — ou envoyez-en partout au Liban. Boîtes de chocolats, coffrets cadeaux et plus, livrés aujourd'hui.",
        h1: "Livraison de Chocolat à Beyrouth, Liban",
        intro:
          "Commandez une livraison de chocolat le jour même à Beyrouth — Hamra, Achrafieh, Gemmayzeh, Verdun et au-delà — ou envoyez une boîte de chocolats n'importe où au Liban, que vous commandiez depuis une autre ville ou depuis l'étranger.",
        sections: [
          {
            heading: "Acheter du Chocolat par Occasion",
            body: "Le chocolat est le cadeau idéal pour presque toutes les occasions — des anniversaires aux simples remerciements. Associez une boîte de chocolats à des fleurs ou à un coffret pour un cadeau plus complet.",
            links: [
              { label: "Chocolats d'anniversaire", href: "/occasion/birthday" },
              { label: "Chocolats pour un anniversaire de mariage", href: "/occasion/anniversary" },
              { label: "Chocolats pour remercier", href: "/occasion/thank-you" },
              { label: "Je pense à toi", href: "/occasion/thinking-of-you" },
            ],
          },
          {
            heading: "Livraison de Chocolat dans Tout le Liban",
            body: "Presentail livre des cadeaux chocolat dans toutes les régions du Liban. Commandez depuis Beyrouth pour une livraison dans la capitale, ou envoyez des chocolats à vos amis et à votre famille n'importe où ailleurs dans le pays.",
            links: [
              { label: "Livraison de chocolat à Tripoli", href: "/fr-lb/tripoli/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Saida", href: "/fr-lb/saida/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Zahle", href: "/fr-lb/zahle/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Jbeil", href: "/fr-lb/jbeil/category/chocolate", absolute: true },
              // Batroun omitted — /fr-lb/batroun/category/chocolate is noindex (too few products)
              { label: "Livraison de chocolat à Tyr", href: "/fr-lb/tyre/category/chocolate", absolute: true },
              { label: "Livraison de chocolat au Metn", href: "/fr-lb/metn/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Kesserwan", href: "/fr-lb/kesserwan/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Baabda", href: "/fr-lb/baabda/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Aley", href: "/fr-lb/aley/category/chocolate", absolute: true },
              { label: "Livraison de chocolat au Chouf", href: "/fr-lb/chouf/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Nabatieh", href: "/fr-lb/nabatieh/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Koura", href: "/fr-lb/koura/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Bcharre", href: "/fr-lb/bcharee/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Zgharta", href: "/fr-lb/zghorta/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Akkar", href: "/fr-lb/akkar/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Hermel", href: "/fr-lb/hermel/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Baalbeck", href: "/fr-lb/baalbeck/category/chocolate", absolute: true },
              { label: "Livraison de chocolat en Bekaa Ouest", href: "/fr-lb/west-bekaa/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Rachaya", href: "/fr-lb/rechaya/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Hasbaya", href: "/fr-lb/hasbaya/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Marjayoun", href: "/fr-lb/marjayoun/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Bint Jbeil", href: "/fr-lb/bent-jbeil/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Jezzine", href: "/fr-lb/jezzine/category/chocolate", absolute: true },
              { label: "Livraison de chocolat à Minnieh-Denniyeh", href: "/fr-lb/minnieh-dennaya/category/chocolate", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Puis-je bénéficier d'une livraison de chocolat le jour même à Beyrouth ?",
            a: "Oui — commandez avant midi pour une livraison de chocolat le jour même à Beyrouth. Les commandes passées après midi sont planifiées pour la prochaine fenêtre de livraison disponible.",
          },
          {
            q: "Livrez-vous des cadeaux chocolat en dehors de Beyrouth, partout au Liban ?",
            a: "Oui, Presentail livre des cadeaux chocolat dans tout le Liban — Tripoli, Saida, Zahle, Jbeil et toutes les autres villes et régions. Sélectionnez votre adresse de livraison à la caisse pour confirmer la disponibilité.",
          },
          {
            q: "Puis-je commander du chocolat depuis l'étranger pour une livraison au Liban ?",
            a: "Oui — vous pouvez commander de n'importe où dans le monde et nous livrerons au destinataire au Liban. Presentail accepte les cartes de crédit et de débit internationales à la caisse.",
          },
          {
            q: "Quels cadeaux chocolat sont disponibles ?",
            a: "La sélection de chocolats de Presentail comprend des boîtes de chocolats, des coffrets cadeaux et des assortiments. Parcourez cette page pour voir la gamme actuelle — de nouveaux produits sont ajoutés régulièrement.",
          },
          {
            q: "Puis-je ajouter un message personnalisé avec le chocolat ?",
            a: "Oui — ajoutez votre message dans le champ note cadeau à la caisse et il sera inclus avec la livraison.",
          },
          {
            q: "Livrez-vous des cadeaux chocolat dans les hôtels ou les bureaux à Beyrouth ?",
            a: "Oui — entrez simplement l'adresse de l'hôtel ou du bureau à la caisse et nous y livrerons.",
          },
        ],
      },
      cakes: {
        title: "Livraison de Gâteaux à Beyrouth, Liban | Livraison le Jour Même | Presentail",
        metaDescription:
          "Commandez des gâteaux frais pour une livraison le jour même à Beyrouth et dans tout le Liban. Gâteaux d'anniversaire, de mariage et de célébration, livrés aujourd'hui.",
        h1: "Livraison de Gâteaux à Beyrouth, Liban",
        intro:
          "Commandez une livraison de gâteau le jour même à Beyrouth — Hamra, Achrafieh, Gemmayzeh, Verdun et au-delà — ou envoyez un gâteau n'importe où au Liban, que vous commandiez depuis une autre ville ou depuis l'étranger.",
        sections: [
          {
            heading: "Acheter des Gâteaux par Occasion",
            body: "Trouvez le gâteau parfait pour chaque célébration — des gâteaux d'anniversaire et d'anniversaire de mariage aux élégants gâteaux de mariage. Chaque gâteau est préparé frais et livré le jour même.",
            links: [
              { label: "Gâteaux d'anniversaire", href: "/occasion/birthday" },
              { label: "Gâteaux pour un anniversaire de mariage", href: "/occasion/anniversary" },
              { label: "Gâteaux de mariage", href: "/occasion/wedding" },
            ],
          },
          {
            heading: "Livraison de Gâteaux dans Tout le Liban",
            body: "Presentail livre des gâteaux dans toutes les régions du Liban. Commandez depuis Beyrouth pour une livraison dans la capitale, ou envoyez un gâteau à des amis et à la famille n'importe où dans le pays.",
            links: [
              { label: "Livraison de gâteaux à Tripoli", href: "/fr-lb/tripoli/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Saida", href: "/fr-lb/saida/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Zahle", href: "/fr-lb/zahle/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Jbeil", href: "/fr-lb/jbeil/category/cakes", absolute: true },
              // Batroun omitted — /fr-lb/batroun/category/cakes is noindex (too few products)
              { label: "Livraison de gâteaux à Tyr", href: "/fr-lb/tyre/category/cakes", absolute: true },
              { label: "Livraison de gâteaux au Metn", href: "/fr-lb/metn/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Kesserwan", href: "/fr-lb/kesserwan/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Baabda", href: "/fr-lb/baabda/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Aley", href: "/fr-lb/aley/category/cakes", absolute: true },
              { label: "Livraison de gâteaux au Chouf", href: "/fr-lb/chouf/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Nabatieh", href: "/fr-lb/nabatieh/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Koura", href: "/fr-lb/koura/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Bcharre", href: "/fr-lb/bcharee/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Zgharta", href: "/fr-lb/zghorta/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Akkar", href: "/fr-lb/akkar/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Hermel", href: "/fr-lb/hermel/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Baalbeck", href: "/fr-lb/baalbeck/category/cakes", absolute: true },
              { label: "Livraison de gâteaux en Bekaa Ouest", href: "/fr-lb/west-bekaa/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Rachaya", href: "/fr-lb/rechaya/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Hasbaya", href: "/fr-lb/hasbaya/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Marjayoun", href: "/fr-lb/marjayoun/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Bint Jbeil", href: "/fr-lb/bent-jbeil/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Jezzine", href: "/fr-lb/jezzine/category/cakes", absolute: true },
              { label: "Livraison de gâteaux à Minnieh-Denniyeh", href: "/fr-lb/minnieh-dennaya/category/cakes", absolute: true },
            ],
          },
        ],
        faqs: [
          {
            q: "Puis-je bénéficier d'une livraison de gâteau le jour même à Beyrouth ?",
            a: "Oui — commandez avant midi pour une livraison de gâteau le jour même à Beyrouth. Les commandes passées après midi sont planifiées pour la prochaine fenêtre de livraison disponible.",
          },
          {
            q: "Livrez-vous des gâteaux en dehors de Beyrouth, partout au Liban ?",
            a: "Oui, Presentail livre des gâteaux dans tout le Liban — Tripoli, Saida, Zahle, Jbeil, et toutes les autres villes et régions. Sélectionnez votre adresse de livraison à la caisse pour confirmer la disponibilité.",
          },
          {
            q: "Puis-je commander un gâteau depuis l'étranger pour une livraison au Liban ?",
            a: "Oui — vous pouvez passer une commande de n'importe où dans le monde et envoyer un gâteau à quelqu'un au Liban. Presentail accepte les cartes de crédit et de débit internationales à la caisse.",
          },
          {
            q: "Quels arômes et tailles de gâteaux sont disponibles ?",
            a: "La sélection de gâteaux comprend des options fraîches telles que le Cheesecake aux Fraises et le Gâteau au Chocolat Rocher, mis à jour régulièrement. Parcourez la gamme complète sur cette page pour connaître la disponibilité actuelle.",
          },
          {
            q: "Puis-je ajouter un message personnalisé ou une carte avec le gâteau ?",
            a: "Oui — ajoutez votre message dans le champ note cadeau à la caisse et il sera inclus avec la livraison.",
          },
        ],
      },
    },
  },
};

/**
 * Look up curated SEO content for a specific category page.
 * Supports en, ar and fr locales — returns the best-match entry for the
 * requested language, falling back to English when no curated ar/fr copy
 * exists for that slot. Returns null when the slot is absent in all locales.
 *
 * @param {{ country?: string|null, city?: string|null, slug?: string|null, lang?: string|null }} opts
 * @returns {CategorySeoEntry|null}
 */
export function getCategorySeoContent({ country, city, slug, lang } = {}) {
  if (!country || !city || !slug) return null;
  const SUPPORTED = ["en", "ar", "fr", "el"];
  const langKey = (lang && SUPPORTED.includes(lang)) ? lang : "en";
  const cityKey = `${country}/${city}`;
  // Curated copy is language-specific editorial content. Reusing the English
  // entry on another locale route overrides that locale's translated title,
  // H1 and description and creates a half-translated indexable page.
  return CATEGORY_SEO_CONTENT[langKey]?.[cityKey]?.[slug] ?? null;
}

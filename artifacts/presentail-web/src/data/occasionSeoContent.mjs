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

// ── Dynamic helpers ──────────────────────────────────────────────────────────
// Computed once at module load time. The module is fresh per deploy, so these
// values stay accurate across the year with no manual maintenance.

/**
 * Returns the upcoming Lebanese Father's Day (always 21 June).
 * If today is past June 21, returns next year's date.
 * @param {Date} [now]
 * @returns {{ year: number, weekday: string, formatted: string }}
 */
function upcomingFathersDay(now = new Date()) {
  const y = now.getFullYear();
  const isAfterFathersDay =
    now.getMonth() > 5 || (now.getMonth() === 5 && now.getDate() > 21);
  const year = isAfterFathersDay ? y + 1 : y;
  const date = new Date(year, 5, 21); // June 21 (month is 0-indexed)
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return { year, weekday, formatted: `${weekday}, 21 June ${year}` };
}

const _fd = upcomingFathersDay();

// ── Type definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {{ h3: string, body: string, links?: Array<{ label: string, href: string, absolute?: boolean }> }} OccasionSeoSubsection
 * @typedef {{ heading: string, body?: string, subsections?: OccasionSeoSubsection[], links?: Array<{ label: string, href: string, absolute?: boolean }> }} OccasionSeoSection
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
  "lb/beirut": {
    "fathers-day": {
      title: "Father's Day Gifts Lebanon | Same-Day Delivery | Presentail",
      metaDescription:
        "Send Father's Day gifts in Lebanon — flowers, cakes, chocolates and gift sets for Dad. Same-day delivery in Beirut when you order before midday, plus nationwide delivery.",
      h1: "Father's Day Gifts in Lebanon",
      intro:
        "Looking for Father's Day gifts in Lebanon? Presentail delivers handpicked flowers, cakes, chocolates, plants and curated gift sets straight to Dad's door. Order before midday for same-day delivery in Beirut, or schedule your gift up to 30 days ahead. Whether he's in Achrafieh, Jounieh, Tripoli or Zahle, we'll get it there — with a personalised card, on the day that matters.",
      sections: [
        {
          heading: "When Is Father's Day in Lebanon?",
          body: `Father's Day in Lebanon falls on 21 June every year — the date used across the Arab world, unlike the US and UK third-Sunday-of-June. This year it falls on ${_fd.formatted}. Father's Day is one of our busiest delivery days: popular bouquets and curated gift sets sell out early, so ordering a day or two ahead is always the safer call. If you need same-day delivery in Beirut on the day itself, order before midday.`,
        },
        {
          heading: "Father's Day Gift Ideas for Every Kind of Dad",
          body: "Not sure what to send? Here are the most-loved Father's Day gifts in Lebanon, from standout florals to same-day-friendly last-minute picks.",
          subsections: [
            {
              h3: "Flowers for Dad",
              body: "A curated bouquet is the classic Father's Day gift — and Presentail's florists put together arrangements specifically for him. Look for Dad's Signature Bouquet, Dad's Timeless Blooms and Florals For My Hero in the Father's Day collection.",
              links: [
                { label: "Father's Day flowers", href: "/category/hand-bouquets" },
              ],
            },
            {
              h3: "Cakes & Chocolates",
              body: "From celebration cakes with a personalised message to Lebanese chocolate assortments, sweets are always the right call. Order a cake or a box of chocolates alongside a bouquet for a complete Father's Day surprise.",
              links: [
                { label: "cakes", href: "/category/cakes" },
                { label: "chocolates", href: "/category/chocolate" },
              ],
            },
            {
              h3: "Plants & Bonsai",
              body: "For Baba who has everything, a living gift lasts long after the day is over. Baba's Bonsai and Dad's Garden are two of our most-gifted Father's Day picks for dads who appreciate something that grows.",
              links: [
                { label: "plants", href: "/category/plants" },
              ],
            },
            {
              h3: "Balloons & Décor",
              body: "A Father's Day balloon turns any delivery into a visible celebration. The Happy Father's Day and Great Dad bundles pair well with a bouquet or a box of chocolates for a bigger impact.",
              links: [
                { label: "Happy Father's Day Balloon", href: "/en-lb/beirut/product/happy-fathers-day-balloon", absolute: true },
                { label: "all balloons", href: "/category/balloons" },
              ],
            },
            {
              h3: "Gift Sets & Hampers",
              body: "If you want to send something curated and ready to give, a gift hamper takes the guesswork out of it. Cheers to Dad and similar Father's Day sets combine flowers, chocolates or treats into one gift-ready box.",
              links: [
                { label: "Father's Day gift sets", href: "/category/gift-baskets" },
              ],
            },
            {
              h3: "Last-Minute Father's Day Gifts",
              body: "Left it late? Order before midday for same-day delivery in Beirut — most gifts in the Father's Day collection qualify. A Father's Day balloon, a box of chocolates or a ready-to-deliver gift set can all be with Dad the same afternoon.",
            },
          ],
        },
        {
          heading: "Father's Day Delivery Across Lebanon",
          body: "Presentail delivers Father's Day gifts throughout Lebanon, led by same-day delivery in Beirut for orders placed before midday. Outside Beirut, we offer next-day and scheduled delivery — pick your delivery date and a two-hour window at checkout. Neighbourhoods we cover in Beirut include Achrafieh, Hamra, Gemmayzeh, Verdun and Badaro. Further afield, we deliver to Jounieh, Zalka, Antelias, Dbayeh, Hazmieh, Baabda, Aley, Broummana, Bikfaya, Jbeil, Tripoli, Batroun, Saida, Tyre and Zahle.",
          links: [
            { label: "Father's Day gifts in Tripoli", href: "/en-lb/tripoli/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Saida", href: "/en-lb/saida/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Zahle", href: "/en-lb/zahle/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Jbeil", href: "/en-lb/jbeil/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Tyre", href: "/en-lb/tyre/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Metn", href: "/en-lb/metn/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Kesserwan", href: "/en-lb/kesserwan/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Baabda", href: "/en-lb/baabda/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Aley", href: "/en-lb/aley/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Chouf", href: "/en-lb/chouf/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Nabatieh", href: "/en-lb/nabatieh/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Batroun", href: "/en-lb/batroun/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Koura", href: "/en-lb/koura/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in Baalbeck", href: "/en-lb/baalbeck/occasion/fathers-day", absolute: true },
            { label: "Father's Day gifts in West Bekaa", href: "/en-lb/west-bekaa/occasion/fathers-day", absolute: true },
          ],
        },
        {
          heading: "Sending Father's Day Gifts to Lebanon from Abroad",
          body: "A large share of Lebanon's Father's Day gifting happens across borders — sons and daughters in the Gulf, Europe and North America sending gifts home to Baba. Presentail makes it simple: order in USD from anywhere in the world using an international credit or debit card, and we deliver locally. Your recipient needs only a name, a delivery address and a phone number. Add a personalised card message in English or Arabic at checkout, and we'll send confirmation when the gift arrives.",
        },
        {
          heading: "How to Order Father's Day Gifts in 3 Steps",
          body: "Pick the gift — browse flowers, cakes, balloons, plants and gift sets, or filter by the Father's Day collection. Add a personalised card message and your chosen delivery date. Pay securely online by credit card, Apple Pay or Google Pay. Your order is confirmed immediately.",
        },
      ],
      faqs: [
        {
          q: "When is Father's Day in Lebanon?",
          a: `Father's Day in Lebanon falls on 21 June every year — the same date used across most Arab countries. This year it falls on ${_fd.formatted}.`,
        },
        {
          q: "What are the best Father's Day gifts in Lebanon?",
          a: "Popular Father's Day gifts in Lebanon include fresh flower bouquets, celebration cakes, chocolates, plants and bonsai, Father's Day balloons and curated gift hampers. Browse the Father's Day collection to filter by price and see what's available for same-day delivery.",
        },
        {
          q: "Can I get same-day Father's Day delivery in Lebanon?",
          a: "Yes — same-day Father's Day gift delivery is available in Beirut for orders placed before midday. Outside Beirut, next-day and scheduled delivery is available across Lebanon.",
        },
        {
          q: "Do you deliver Father's Day gifts outside Beirut?",
          a: "Yes. Presentail delivers Father's Day gifts to Tripoli, Jounieh, Metn (Zalka, Antelias, Dbayeh, Broummana), Kesserwan, Jbeil, Batroun, Saida, Tyre, Zahle, Baabda, Aley and more. Enter your delivery address at checkout to confirm availability in your area.",
        },
        {
          q: "Can I send a Father's Day gift to Lebanon from abroad?",
          a: "Yes — you can order from anywhere in the world using an international credit or debit card. Presentail delivers locally; your recipient needs only a name, address and phone number. Add a personalised card message in English or Arabic at checkout.",
        },
        {
          q: "How much do Father's Day gifts cost in Lebanon?",
          a: "Gift prices start from $13 for single items such as a Father's Day balloon, with flower bouquets, cakes and curated gift sets typically ranging from $35 upward. The exact price is shown on each product page before you add to cart.",
        },
        {
          q: "Can I add a personalised card message to a Father's Day gift?",
          a: "Yes — add your message in the gift note field at checkout. It is included with every delivery at no extra charge, in English or Arabic.",
        },
        {
          q: "Can the Father's Day gift be delivered to Dad's office?",
          a: "Yes, we deliver to offices, homes and any other address in our delivery area. Add the office address and any access notes — floor number, company name — at checkout.",
        },
        {
          q: "Do you deliver Father's Day gifts on weekends and public holidays?",
          a: "Yes — Presentail delivers seven days a week, including weekends and public holidays. The same-day midday cutoff and scheduled delivery windows apply on all days.",
        },
        {
          q: "How late can I order for Father's Day same-day delivery?",
          a: `For same-day delivery in Beirut, orders must be placed before midday on 21 June. After midday, your gift will be scheduled for the next available delivery window. Father's Day is one of our busiest delivery days — ordering a day or two ahead is strongly recommended to guarantee your preferred products and delivery slot.`,
        },
      ],
    },
    "mothers-day": {
      title: "Mother's Day Gifts in Beirut, Lebanon | Same-Day | Presentail",
      metaDescription:
        "Send Mother's Day flowers, cakes and gift hampers in Beirut with same-day delivery — or send one anywhere else in Lebanon. Order online today.",
      h1: "Mother's Day Gifts in Beirut, Lebanon",
      intro:
        "Send Mother's Day gifts anywhere in Beirut — Hamra, Achrafieh, Gemmayzeh, Verdun, Jdeideh and beyond — with same-day delivery, or order from anywhere in the world to surprise your mum anywhere else in Lebanon.",
      sections: [
        {
          heading: "Shop Mother's Day Gifts",
          body: "From fresh flower bouquets and cakes to chocolate hampers and personalised gifts — every order is prepared on the day of delivery and sent with a message from you.",
          links: [
            { label: "Mother's Day flowers", href: "/category/hand-bouquets" },
            { label: "cakes", href: "/category/cakes" },
            { label: "chocolate & sweets", href: "/category/chocolate" },
            { label: "gift hampers", href: "/category/gift-baskets" },
          ],
        },
        {
          heading: "Delivering Mother's Day Gifts Across Lebanon",
          body: "Presentail delivers Mother's Day gifts to every region of Lebanon. Order from Beirut for delivery in the capital, or send a gift to your mum anywhere else in the country.",
          links: [
            { label: "Mother's Day gifts in Tripoli", href: "/en-lb/tripoli/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Saida", href: "/en-lb/saida/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Zahle", href: "/en-lb/zahle/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Jbeil", href: "/en-lb/jbeil/occasion/mothers-day", absolute: true },
            // Batroun omitted — /en-lb/batroun/occasion/mothers-day is noindex (too few products)
            { label: "Mother's Day gifts in Tyre", href: "/en-lb/tyre/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Metn", href: "/en-lb/metn/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Kesserwan", href: "/en-lb/kesserwan/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Baabda", href: "/en-lb/baabda/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Aley", href: "/en-lb/aley/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Chouf", href: "/en-lb/chouf/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Nabatieh", href: "/en-lb/nabatieh/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Koura", href: "/en-lb/koura/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Bcharre", href: "/en-lb/bcharee/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Zgharta", href: "/en-lb/zghorta/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Akkar", href: "/en-lb/akkar/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Hermel", href: "/en-lb/hermel/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Baalbeck", href: "/en-lb/baalbeck/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in West Bekaa", href: "/en-lb/west-bekaa/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Rachaya", href: "/en-lb/rechaya/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Hasbaya", href: "/en-lb/hasbaya/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Marjayoun", href: "/en-lb/marjayoun/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Bint Jbeil", href: "/en-lb/bent-jbeil/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Jezzine", href: "/en-lb/jezzine/occasion/mothers-day", absolute: true },
            { label: "Mother's Day gifts in Minnieh-Denniyeh", href: "/en-lb/minnieh-dennaya/occasion/mothers-day", absolute: true },
          ],
        },
      ],
      faqs: [
        {
          q: "Can I get same-day Mother's Day gift delivery in Beirut?",
          a: "Yes — order before midday for same-day Mother's Day delivery in Beirut. Orders placed after midday are scheduled for the next available delivery window.",
        },
        {
          q: "Do you deliver Mother's Day gifts outside Beirut, anywhere in Lebanon?",
          a: "Yes, Presentail delivers Mother's Day gifts across Lebanon — Tripoli, Saida, Zahle, Jbeil and every other city and region. Select your delivery address at checkout to confirm availability.",
        },
        {
          q: "Can I order a Mother's Day gift from abroad for my mother in Lebanon?",
          a: "Yes — you can order from anywhere in the world and we'll deliver to your mother in Lebanon. Presentail accepts international credit and debit cards at checkout.",
        },
        {
          q: "What Mother's Day gifts are available?",
          a: "Fresh flower bouquets, cakes, chocolates and curated gift hampers — all prepared on the day of delivery.",
        },
        {
          q: "Can I add a personalised message with the gift?",
          a: "Yes — add your message in the gift note field at checkout and it will be included with the delivery.",
        },
      ],
    },
  },
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
            { label: "gift hampers", href: "/category/gift-baskets" },
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
            { label: "gift hampers", href: "/category/gift-baskets" },
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
            { label: "gift hampers", href: "/category/gift-baskets" },
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
            { label: "gift hampers", href: "/category/gift-baskets" },
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
      title: "Funeral Flowers & Sympathy Gifts in Dubai | Presentail",
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
            { label: "gift baskets", href: "/category/gift-baskets" },
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
            { label: "romantic hampers", href: "/category/gift-baskets" },
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

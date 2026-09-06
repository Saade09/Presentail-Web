/**
 * Shared blog article copy — the single source of truth for blog post content
 * AND its SEO metadata (slug, title, description, datePublished, dateModified).
 * Lives in the
 * `@workspace/blog-content` lib so it can be imported by BOTH the web app
 * (the BlogPost page, the Blog index, and the server-side SEO injector
 * `seo-inject.mjs`) AND the mobile app, keeping the two from drifting apart.
 *
 * Keep this file as plain ES module JS (no TypeScript) so the Node.js SEO
 * injector can import it at runtime without a compilation step. Types for TS
 * consumers live in the sibling `blogPostsCopy.d.ts`.
 *
 * Structure: { [slug]: { [lang]: { slug, eyebrow, title, description, datePublished, dateModified?, author?, sections: [{ heading?, body }] } } }
 *
 * Adding a new article? Add it here once — every web page, the index card, the
 * shared-link preview / Google Article rich result, and any mobile journal
 * screen all read from this single object.
 */

const BOUQUET_DELIVERY_DUBAI_FAQS = [
  {
    q: "Can I get same-day bouquet delivery in Dubai?",
    a: "Yes. Orders placed before midday are delivered the same day across Dubai, including Downtown, Dubai Marina, Jumeirah, Palm Jumeirah, Business Bay, Deira, Bur Dubai, Arabian Ranches and Mirdif. Orders placed after midday go to the next available day.",
  },
  {
    q: "Can I choose a specific delivery time?",
    a: "You can. Bouquets can be scheduled up to 30 days in advance with a two-hour delivery window, so the flowers arrive at the moment you want rather than at some point during the day.",
  },
  {
    q: "Which areas of Dubai do you deliver bouquets to?",
    a: "Delivery covers Downtown Dubai, Dubai Marina, Jumeirah, Palm Jumeirah, Business Bay, Deira, Bur Dubai, and the residential communities of Arabian Ranches and Mirdif, including towers, villa compounds and hotel lobbies.",
  },
  {
    q: "Should I send a hand bouquet or a flower box?",
    a: "Send a hand bouquet to a home, where someone can arrange it in a vase. Send a flower box to an office, hotel or hospital — it arrives already arranged with its own water source and needs nothing from the recipient.",
  },
  {
    q: "How long will a bouquet last in Dubai's climate?",
    a: "Around five to nine days for roses and similarly hardy flowers, if you keep them out of direct sun and away from AC airflow, recut the stems at an angle and change the water every two days. Delicate blooms like hydrangeas and peonies have a shorter life in summer heat.",
  },
  {
    q: "Can I add chocolates, a cake or balloons to a bouquet?",
    a: "Yes. Personalised cards, chocolates, balloons and scented candles can all be added at checkout. Cakes and other gifts can be ordered alongside the bouquet for the same delivery.",
  },
  {
    q: "Can I send a bouquet anonymously or as a surprise?",
    a: "Yes. Leave the card message unsigned and add a note asking the florist not to call the recipient in advance — the driver will coordinate with a concierge, colleague or family member instead.",
  },
];

const FATHERS_DAY_GIFTS_LEBANON_FAQS = [
  {
    q: "When is Father's Day in Lebanon?",
    a: "21 June, every year. It is a fixed date and does not move to a Sunday, so it frequently falls on a working day.",
  },
  {
    q: "Why is Father's Day in Lebanon on a different date from the US and UK?",
    a: "The US and UK both use the third Sunday of June, which changes date each year. Lebanon — along with Egypt, Jordan, Syria and the Gulf — uses the fixed date of 21 June. In 2027 the two fall on consecutive days; in other years they are several days apart.",
  },
  {
    q: "Is Father's Day a public holiday in Lebanon?",
    a: "No. It is widely observed but it is a normal working day, which is why gifts are often sent to an office or scheduled for the evening.",
  },
  {
    q: "Are flowers an appropriate Father's Day gift?",
    a: "Yes, and they are underused. A bouquet in a deeper, less pastel palette reads as considered rather than default, and tends to land harder with someone who has never been sent flowers.",
  },
  {
    q: "What should I write in a Father's Day card?",
    a: 'Something specific rather than general — one thing he did, or one thing he taught you. Specific beats affectionate: "thank you for the summers in the village" says more than "best dad ever".',
  },
];

const buildFaqPageJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: {
      "@type": "Answer",
      text: a,
    },
  })),
});

const TEDDY_BEAR_GIFTS_LEBANON_FAQS = [
  {
    q: "Can I get a teddy bear delivered in Lebanon the same day?",
    a: "Yes. Order before midday and your teddy bear is delivered the same day across Lebanon. Orders placed after midday go to the next available day, and you can also schedule up to 30 days ahead with a two-hour delivery window.",
  },
  {
    q: "How much does a teddy bear cost in Lebanon?",
    a: "Small and medium classic bears start at around $32, larger and more designed bears run roughly $70 to $150, and life-size bears — including rose bears — start around $300.",
  },
  {
    q: "What size teddy bear should I send?",
    a: "Small bears (25–40 cm) suit babies, children and hospital visits. Medium bears (40–80 cm) are the standard birthday gift. Large bears (80–120 cm) suit anniversaries and graduations, and life-size bears around 200 cm are for proposals and milestone birthdays — check the recipient has space first.",
  },
  {
    q: "Can I send a teddy bear to Lebanon from abroad?",
    a: "Yes. Order online from anywhere, enter the recipient's address in Lebanon, and pay by credit card, Apple Pay or Google Pay. The recipient pays nothing on delivery. Include a local phone number for them so the driver can call on arrival.",
  },
  {
    q: "Can I add flowers, balloons or chocolates to a teddy bear?",
    a: "Yes. Balloons, chocolates, scented candles and a personalised card can all be added at checkout, and flowers or a cake can be ordered alongside the bear for the same delivery.",
  },
  {
    q: "Which teddy bear is best for a newborn?",
    a: "A small soft toy with embroidered features rather than plastic eyes, sized to sit in a cot or car seat. Non-bear options like the hippo, monkey or raccoon are often a better choice, since new parents typically receive several bears.",
  },
  {
    q: "Do you deliver teddy bears outside Beirut?",
    a: "Yes, delivery covers Lebanon nationwide, not only Beirut, with the same before-midday cutoff for same-day service.",
  },
];

const CAKE_FOR_PROPOSAL_FAQS = [
  {
    q: "What should I write on a proposal cake?",
    a: 'Keep it under five words so it reads in a photograph. "Marry me", "Will you marry me?", "Forever?" or the Arabic "Btetzawajini?" all work. A meaningful date with no words at all is a quieter alternative.',
  },
  {
    q: "Can I order a custom proposal cake?",
    a: "Yes. Custom messages, ring-box designs and toppers can be made on request. Tell us the wording and design you want and allow a few days' lead time. Cakes from our standard range can be ordered same-day with a personalised gift note when you order before midday.",
  },
  {
    q: "What size cake should I get for a proposal?",
    a: "A six-inch cake serving four to six is right for a private proposal, since the audience is usually two people. Order eight to ten servings if you are proposing at a family dinner, or order two cakes — a small one for the moment and a larger one for the celebration after.",
  },
  {
    q: "What flavour works best for a proposal cake?",
    a: "Choose the flavour they like, and favour something that holds up if the cake has to wait out of the fridge. Chocolate is the safest choice; cream-heavy and fresh-fruit cakes are less forgiving in a warm room.",
  },
  {
    q: "When should the cake come out during a proposal?",
    a: "After the moment has started, not before, since once the cake is on the table the surprise is over. If you are in a restaurant, agree a signal with the staff rather than a fixed time. If it is being delivered, schedule it to arrive before you do.",
  },
  {
    q: "Can I have a proposal cake delivered with flowers?",
    a: "Yes. Cakes can be ordered alongside flowers, balloons and chocolates for a single delivery, with a two-hour delivery window so everything arrives together at the right moment.",
  },
  {
    q: "How far in advance should I order?",
    a: "For a custom cake, allow a few days. For a cake from our existing range, order before midday for same-day delivery, or schedule up to 30 days ahead and pick your two-hour window.",
  },
];

const BALLOON_ARRANGEMENT_IDEAS_FAQS = [
  {
    q: "What is the easiest balloon arrangement to make look good?",
    a: "A weighted bouquet of five to seven balloons in three colours, tied at varying string lengths. Mixing finishes — chrome, matte latex and one printed foil — does most of the visual work, and the varying heights stop it looking like a bunch.",
  },
  {
    q: "How many balloons do I need for an arrangement?",
    a: "Three to seven for a bouquet or centrepiece, and odd numbers look better than even. A balloon column takes two to four large balloons per metre, and an organic garland needs 50 to 100 balloons of mixed sizes depending on length.",
  },
  {
    q: "How long do balloon arrangements last?",
    a: "Helium-filled latex floats for roughly 8 to 12 hours, foil and mylar hold helium for several days to a week, and air-filled arrangements like garlands and columns last for days. Build with air anything that does not need to float.",
  },
  {
    q: "What colours work best for a balloon arrangement?",
    a: "Two base colours plus one metallic. Blush, white and gold, or navy, silver and white, are reliable combinations. More than three colours usually reads as unplanned.",
  },
  {
    q: "Can I send a balloon arrangement to a hospital?",
    a: "Yes, but choose foil rather than latex, since many hospitals restrict latex because of allergy risk and foil holds helium far longer. Keep it to a small three-balloon cluster so it fits in the room.",
  },
  {
    q: "Should I use helium or air?",
    a: "Helium if the balloons need to float, such as bouquets, ceiling clouds and centrepieces. Air for anything structural, such as garlands, arches and columns, which last far longer and cost less to fill.",
  },
  {
    q: "Can balloons be delivered with flowers or a cake?",
    a: "Yes. Balloons can be ordered alongside flowers, cakes, chocolates and a personalised card for a single same-day delivery when you order before midday.",
  },
];

/**
 * Shared accountable author for articles that do not have a separately named
 * writer. Keep this as an organization rather than inventing a person's name
 * or credentials.
 */
export const BLOG_EDITORIAL_TEAM = {
  type: "Organization",
  name: "Presentail Editorial Team",
};

const BLOG_POSTS_COPY = {
  "gift-baskets-dubai": {
    en: {
      slug: "gift-baskets-dubai",
      eyebrow: "Dubai",
      title: "Gift Baskets in Dubai: Same-Day Delivery | Presentail",
      h1: "Gift Baskets in Dubai: Same-Day Delivery",
      description:
        "A practical guide to gift baskets in Dubai — what to order for get-well, housewarming, birthday, and professional occasions, with same-day delivery across the city.",
      dek:
        "A practical guide to choosing the right basket for every Dubai occasion, with same-day delivery across the city.",
      geographyLabel: "Dubai",
      categoryLabel: "Gifting Guides",
      datePublished: "2026-08-19",
      ogImage: { url: "/blog/mothers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt: "A warm arranged gift basket with flowers",
      heroFocal: "50% 45%",
      cta: { label: "Shop Gift Baskets", path: "/category/flower-baskets", country: "ae" },
      recommendation: {
        title: "Browse the full basket collection",
        body: "Explore everyday baskets, bundles, and statement arrangements for delivery in Dubai.",
        label: "View Flower Baskets",
        path: "/category/flower-baskets",
        country: "ae",
      },
      relatedSlugs: [
        "mothers-day-gifts-lebanon",
        "fathers-day-gifts-lebanon",
        "gift-shop-in-lebanon",
      ],
      sections: [
        {
          body: "Dubai has no shortage of gifting occasions — a colleague's promotion, a friend recovering from surgery, a new neighbor settling into the building next door. A gift basket tends to be the right call more often than people expect: it's less personal than a single stem of flowers (good when you don't know someone well) but more thoughtful than a gift card. Here's what's actually worth ordering, and what to check before you do.",
        },
        {
          heading: "What Makes a Good Gift Basket",
          body: 'Not every basket is built the same. The good ones tend to combine two or three elements — flowers, a small treat, sometimes a soft touch like a balloon — rather than just piling in random items. A few categories that consistently work well in Dubai:\n\n<strong>For a get-well delivery</strong>, the <a href="/en-ae/dubai/product/get-well-soon-gift-set">Get Well Soon Gift Set</a> (130 AED) is built specifically for that moment — cheerful without being over the top, which matters when someone isn\'t feeling their best.\n\n<strong>For an apology or a "thinking of you" gesture</strong>, <a href="/en-ae/dubai/product/tender-hug-basket">Tender Hug Basket</a> (95 AED) covers a wider emotional range — it works for a sincere sorry, a congratulations, or a new-baby delivery equally well.\n\n<strong>For a housewarming or a new-neighbor gift</strong>, something like <a href="/en-ae/dubai/product/summer-daisy-garden">Summer Daisy Garden</a> (65 AED) hits the right note — bright, low-pressure, and appropriately priced for a gesture rather than a statement.',
        },
        {
          heading: "When You Want to Go Bigger",
          body: 'Some occasions call for more presence. <a href="/en-ae/dubai/product/autumn-luxe-basket">Autumn Luxe Basket</a> (250 AED) and <a href="/en-ae/dubai/product/sunflower-bloom-basket">Sunflower Bloom Basket</a> (240 AED) sit in that upper tier — full, photograph-well arrangements that suit a milestone congratulations or an anniversary gift for someone you know well.\n\nFor the rare occasion that calls for an actual showstopper, <a href="/en-ae/dubai/product/1000-red-roses-basket">1000 Red Roses Basket</a> (2,300 AED) is exactly that — also available in pink, white, and yellow, for the gift that\'s meant to be remembered rather than just appreciated.',
        },
        {
          heading: "For Birthdays and Everyday Celebrations",
          body: '<a href="/en-ae/dubai/product/colorful-joy-basket">Colorful Joy Basket</a> (100 AED) and <a href="/en-ae/dubai/product/blush-balloon-basket">Blush Balloon Basket</a> (65 AED) both lean playful rather than formal — a balloon element added to the flowers makes them read as celebratory the moment they arrive, which is exactly what a birthday or "congratulations" delivery needs.',
        },
        {
          heading: "A Note on Workplace and Professional Gifting",
          body: 'Dubai\'s professional culture leans toward marking milestones — a promotion, a new job, a colleague\'s send-off. A basket is often the safer choice here over a single bouquet: it reads as a genuine gesture without edging into anything overly personal. If you\'re shopping for a colleague, our <a href="/en-ae/dubai/occasion/promotion">Job Promotion</a> and <a href="/en-ae/dubai/occasion/new-job">New Job</a> collections are built around exactly this kind of professional-but-warm gifting.',
        },
        {
          heading: "Browse the Full Basket Collection",
          body: 'For the complete range of basket-style arrangements — from the everyday to the statement pieces — the full collection is here: <a href="/en-ae/dubai/category/flower-baskets">Flower Baskets</a>. If you\'re after something that pairs flowers with chocolate, balloons, or a keepsake extra, our <a href="/en-ae/dubai/category/bundles">Gift Bundles</a> collection covers that combination format specifically.',
        },
        {
          heading: "Same-Day Delivery Across Dubai",
          body: "Presentail delivers gift baskets same-day across Dubai — order before midday for same-afternoon delivery, or schedule ahead for an exact time if the gift is tied to a specific moment (a hospital visit, an office celebration, a specific arrival time).",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-ae/dubai/category/flower-baskets">Shop Gift Baskets →</a>\n\nPresentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your gift arrives exactly when it should.',
        },
      ],
    },
    fr: {
      slug: "gift-baskets-dubai",
      eyebrow: "Dubaï",
      title: "Paniers cadeaux à Dubaï : les meilleurs à commander avec livraison le jour même | Presentail",
      seoTitle: "Paniers cadeaux à Dubaï | Livraison le jour même | Presentail",
      h1: "Paniers cadeaux à Dubaï : les meilleurs à commander avec livraison le jour même",
      description:
        "Guide pratique des paniers cadeaux à Dubaï : que commander pour un rétablissement, une pendaison de crémaillère, un anniversaire ou une occasion professionnelle, avec livraison le jour même dans toute la ville.",
      dek:
        "Un guide pratique pour choisir le bon panier pour chaque occasion à Dubaï, avec livraison le jour même dans toute la ville.",
      geographyLabel: "Dubaï",
      categoryLabel: "Guides cadeaux",
      datePublished: "2026-08-19",
      ogImage: { url: "/blog/mothers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt: "Un panier cadeau chaleureux composé de fleurs",
      heroFocal: "50% 45%",
      cta: { label: "Acheter des paniers cadeaux", path: "/category/flower-baskets", country: "ae" },
      recommendation: {
        title: "Parcourez toute la collection de paniers",
        body: "Découvrez des paniers du quotidien, des coffrets et des compositions remarquables à livrer à Dubaï.",
        label: "Voir les paniers de fleurs",
        path: "/category/flower-baskets",
        country: "ae",
      },
      relatedSlugs: [
        "mothers-day-gifts-lebanon",
        "fathers-day-gifts-lebanon",
        "gift-shop-in-lebanon",
      ],
      sections: [
        {
          body: "Dubaï ne manque pas d'occasions d'offrir : la promotion d'un collègue, un ami qui se remet d'une opération, ou un nouveau voisin qui s'installe dans l'immeuble d'à côté. Un panier cadeau est souvent le bon choix : moins personnel qu'une simple fleur (pratique quand on connaît peu la personne), mais plus attentionné qu'une carte cadeau. Voici ce qui vaut vraiment la peine d'être commandé et les points à vérifier avant de passer commande.",
        },
        {
          heading: "Qu'est-ce qui fait un bon panier cadeau ?",
          body: 'Tous les paniers ne se valent pas. Les meilleurs associent généralement deux ou trois éléments — des fleurs, une petite gourmandise, parfois une touche douce comme un ballon — plutôt que d\'empiler des articles au hasard. Voici quelques catégories qui fonctionnent particulièrement bien à Dubaï :\n\n<strong>Pour un cadeau de rétablissement</strong>, le <a href="/en-ae/dubai/product/get-well-soon-gift-set">Get Well Soon Gift Set</a> (130 AED) est conçu pour ce moment précis : joyeux sans être excessif, ce qui compte quand on ne se sent pas bien.\n\n<strong>Pour des excuses ou un geste « je pense à toi »</strong>, le <a href="/en-ae/dubai/product/tender-hug-basket">Tender Hug Basket</a> (95 AED) convient à de nombreuses situations : excuses sincères, félicitations ou cadeau de naissance.\n\n<strong>Pour une pendaison de crémaillère ou un cadeau de bienvenue à un voisin</strong>, le <a href="/en-ae/dubai/product/summer-daisy-garden">Summer Daisy Garden</a> (65 AED) est un choix lumineux, simple et au prix adapté à un geste attentionné plutôt qu\'à une déclaration.',
        },
        {
          heading: "Quand vous voulez marquer le coup",
          body: 'Certaines occasions méritent davantage de présence. L\'<a href="/en-ae/dubai/product/autumn-luxe-basket">Autumn Luxe Basket</a> (250 AED) et la <a href="/en-ae/dubai/product/sunflower-bloom-basket">Sunflower Bloom Basket</a> (240 AED) se situent dans la gamme supérieure : des compositions généreuses et très photogéniques, parfaites pour une réussite importante ou l\'anniversaire de mariage d\'une personne proche.\n\nPour une occasion rare qui mérite un véritable effet spectaculaire, le <a href="/en-ae/dubai/product/1000-red-roses-basket">1000 Red Roses Basket</a> (2 300 AED) porte bien son nom. Il existe aussi en rose, blanc et jaune, pour un cadeau destiné à rester dans les mémoires.',
        },
        {
          heading: "Pour les anniversaires et les célébrations du quotidien",
          body: 'Le <a href="/en-ae/dubai/product/colorful-joy-basket">Colorful Joy Basket</a> (100 AED) et le <a href="/en-ae/dubai/product/blush-balloon-basket">Blush Balloon Basket</a> (65 AED) sont plus ludiques que formels. La présence d\'un ballon parmi les fleurs donne immédiatement une tonalité festive, exactement ce qu\'il faut pour un anniversaire ou des félicitations.',
        },
        {
          heading: "Un mot sur les cadeaux professionnels",
          body: 'La culture professionnelle de Dubaï aime marquer les étapes importantes : promotion, nouvel emploi ou départ d\'un collègue. Un panier est souvent plus sûr qu\'un bouquet seul : il exprime une attention sincère sans devenir trop personnel. Pour un collègue, nos collections <a href="/en-ae/dubai/occasion/promotion">Promotion</a> et <a href="/en-ae/dubai/occasion/new-job">Nouvel emploi</a> sont pensées exactement pour ce type de cadeau chaleureux et professionnel.',
        },
        {
          heading: "Parcourez toute la collection de paniers",
          body: 'Pour découvrir tous nos arrangements en forme de panier, du plus simple au plus spectaculaire, consultez la collection <a href="/en-ae/dubai/category/flower-baskets">Paniers de fleurs</a>. Si vous cherchez une association de fleurs avec du chocolat, des ballons ou un petit souvenir, la collection <a href="/en-ae/dubai/category/bundles">Coffrets cadeaux</a> est faite pour vous.',
        },
        {
          heading: "Livraison le jour même dans tout Dubaï",
          body: "Presentail livre les paniers cadeaux le jour même partout à Dubaï : commandez avant midi pour une livraison dans l'après-midi, ou planifiez votre commande à l'avance pour une heure précise si le cadeau accompagne une visite à l'hôpital, une fête au bureau ou une arrivée.",
        },
        {
          heading: "Prêt à commander ?",
          body: '<a href="/en-ae/dubai/category/flower-baskets">Acheter des paniers cadeaux →</a>\n\nPresentail livre au Liban, aux Émirats arabes unis et à Chypre, avec des options de livraison le jour même ou planifiée pour que votre cadeau arrive exactement au bon moment.',
        },
      ],
    },
  },
  "bouquet-delivery-dubai": {
    en: {
      slug: "bouquet-delivery-dubai",
      eyebrow: "Dubai",
      title: "Bouquet Delivery in Dubai: Same-Day Guide | Presentail",
      h1: "Bouquet Delivery in Dubai: A Practical Guide to Getting It Right",
      description:
        "A practical guide to bouquet delivery in Dubai — same-day cutoffs, two-hour delivery windows, which bouquet suits which occasion, and how to get it to the door.",
      dek:
        "Same-day cutoffs, two-hour windows, tower and villa access, and how to pick a bouquet that actually suits the occasion.",
      geographyLabel: "Dubai",
      categoryLabel: "Flowers",
      datePublished: "2026-08-24",
      ogImage: {
        url: "/catalog/products/pastel-bliss-bouquet.avif",
        width: 3000,
        height: 3000,
      },
      ogImageAlt: "A hand-tied bouquet being delivered in Dubai",
      heroFocal: "50% 35%",
      toc: true,
      cta: {
        label: "Shop bouquets in Dubai",
        path: "/category/hand-bouquets",
        country: "ae",
      },
      recommendation: {
        title: "Browse hand bouquets in Dubai",
        body:
          "74 arrangements, from single-stem simplicity to 100-rose statements — all with same-day delivery across the city.",
        label: "View hand bouquets",
        path: "/category/hand-bouquets",
        country: "ae",
      },
      relatedSlugs: [
        "gift-baskets-dubai",
        "flower-shops-in-lebanon",
        "what-to-send-when-there-are-no-words",
      ],
      sections: [
        {
          body: `Most people searching for bouquet delivery in Dubai are not browsing. They have a date, a name, and an address, and they need flowers at that address today. The city makes that either very easy or unexpectedly complicated, depending on how much you know before you check out — a tower with a concierge behaves nothing like a villa compound in Arabian Ranches, and a bouquet that looks perfect in the photo can arrive looking tired if it sat in a car at 2pm in July.

This is the practical version of the guide: how the timing works, what to send for which occasion, and the small details that decide whether the delivery lands well.`,
        },
        {
          heading: "How bouquet delivery in Dubai actually works",
          body:
            "The timing rule that matters most is the cutoff. Order before midday and same-day delivery across Dubai is available; after that, the next available slot is the following day. That single line resolves most of the anxiety around last-minute gifting — you have a morning, not a whole day.\n\nIf you are planning ahead, you can schedule a bouquet up to 30 days in advance and pick a two-hour delivery window. This is worth using even when you are not in a rush. A two-hour window is the difference between flowers meeting someone at their desk before a meeting and flowers sitting at a reception desk until 6pm.",
          callout: {
            variant: "service",
            title: "Same-day in Dubai",
            body:
              "Order before midday for same-day bouquet delivery. Need a specific moment? Schedule up to 30 days ahead and choose a two-hour window.",
          },
        },
        {
          heading: "Where we deliver across Dubai",
          body:
            "Coverage runs across the city rather than a handful of central districts: Downtown Dubai, Dubai Marina, Jumeirah, Palm Jumeirah, Business Bay, Deira and Bur Dubai, plus the residential communities of Arabian Ranches and Mirdif. Our florists deal with towers, villa compounds and hotel lobbies daily, which is the part that actually determines on-time delivery in this city.\n\nIf the recipient is in an office, a tower with a strict concierge, or a gated community with visitor registration, say so in the order notes. It costs you ten seconds and removes the most common cause of a delayed handover.",
        },
        {
          heading: "Choosing the right bouquet for the occasion",
          subheading: true,
          body:
            "Roses still carry the clearest message, and the choice is really about scale. A 15 Red Roses Arrangement reads as considered and personal; a 25 Rose Elegance Bouquet is a statement. Larger counts — 50 or 100 stems — are for milestone anniversaries and proposals, where the size is the gesture. If you want something softer than classic red, the Blush Romance Bouquet or Rosé Whisper land in the same emotional register without the cliché.",
        },
        {
          heading: "Birthdays and celebrations",
          subheading: true,
          body:
            "Birthdays want colour and energy rather than symbolism. The Bright Bouquet, Ray of Joy and the Sunflower Bliss Bouquet all photograph well and read as celebratory the moment they come through the door — which matters, because birthday flowers are usually opened in front of other people. Pair one with a cake or a balloon and you have a complete birthday moment rather than a single item.",
        },
        {
          heading: "Sympathy and condolences",
          subheading: true,
          body:
            'Restraint is the whole point here. White and pale arrangements — White Nights, or a simple white rose arrangement — say what needs saying without decoration. Keep the card message short. Read <a href="/en/blog/what-to-send-when-there-are-no-words">what to send when there are no words</a> for more guidance on choosing a thoughtful gesture.',
        },
        {
          heading: "Corporate and client gifting",
          subheading: true,
          body:
            'For a client, a new office, or a colleague\'s promotion, choose something structured over something romantic. <a href="/en-ae/dubai/category/flower-boxes">Flower boxes</a> hold their shape on a desk for days and do not require anyone to find a vase — which is the practical failure point of office flowers. The Pastel Bliss Bouquet and Peponi Roses also work well when the relationship is warm but professional.',
        },
        {
          heading: "Hand bouquets or flower boxes?",
          body: "The difference is not decorative, it is logistical.",
          items: [
            "Hand bouquets are wrapped and tied, meant to be handed over and then arranged in a vase. They are the right choice for a home, and the more emotionally traditional of the two.",
            "Flower boxes arrive already arranged in their own container with a water source. They need nothing from the recipient, which makes them the safer choice for an office, a hotel room, a hospital, or anyone you suspect does not own a vase.",
          ],
        },
        {
          body: "If you genuinely do not know where the flowers will end up, send the box.",
          pullQuote: "The best bouquet is the one the recipient does not have to do anything with.",
        },
        {
          heading: "What to add — and what not to",
          body:
            'Add-ons are available at checkout: a personalised card, chocolates, balloons and scented candles. Two rules keep this from going wrong.\n\nFirst, always add the card. A bouquet with no message is a delivery; a bouquet with three honest sentences is a gift. It is the cheapest upgrade available and the one people remember.\n\nSecond, add one thing, not four. A bouquet with chocolates is elegant. A bouquet with chocolates, a candle, a bear and a balloon bundle is a gift basket — and if that is what you want, order <a href="/en/blog/gift-baskets-dubai">a proper gift basket</a> instead, where the components are chosen to work together.',
        },
        {
          heading: "Dubai's climate is part of the decision",
          body:
            "From roughly May through September, heat is a real variable. It does not stop flowers from arriving in good condition, but it changes what happens after they arrive.",
          items: [
            "Choose an early or evening delivery window in summer where you can.",
            "Tell the recipient the flowers are coming if they will be out all day — flowers left with a concierge in August do not improve while they wait.",
            "Once they are inside, keep them away from direct sun and out of the airflow from an AC vent, which dries petals faster than heat does.",
            "Recut the stems at an angle and change the water every couple of days. In Dubai's conditions this is the difference between four days and nine.",
          ],
        },
        {
          body: "Roses, chrysanthemums and orchids handle the climate noticeably better than hydrangeas or peonies, which is worth knowing if you want the arrangement to last past the weekend.",
        },
        {
          heading: "Getting the delivery details right",
          body: "Three fields cause almost every failed delivery in this city, and all three are on the checkout page.",
          ordered: true,
          items: [
            'A complete address. Building or villa name, not just the community. "Marina Diamond 4, Tower B" is deliverable; "Dubai Marina" is a suggestion.',
            "A working recipient phone number. Our florist calls on arrival. If the number is wrong, the flowers wait.",
            'The access note. Concierge, gate registration, reception hours, or "please don\'t call — it\'s a surprise." Say it in the notes and it gets respected.',
          ],
        },
        {
          body: "For surprise deliveries, use the notes field to ask the driver to coordinate with a colleague or family member rather than the recipient. It works far more often than people expect.",
        },
        {
          heading: "Ordering bouquet delivery in Dubai",
          body:
            "Everything above assumes the ordering part is straightforward, and it is: choose the bouquet, enter the recipient's address in Dubai at checkout, write the card message, pick your delivery window, and pay by credit card, Apple Pay or Google Pay. Same-day if you have caught the midday cutoff, scheduled if you are planning around a specific moment.",
        },
        {
          heading: "Frequently asked questions",
          faqItems: BOUQUET_DELIVERY_DUBAI_FAQS,
        },
      ],
      extraJsonLd: [buildFaqPageJsonLd(BOUQUET_DELIVERY_DUBAI_FAQS)],
    },
  },
  "send-gifts-to-lebanon-from-gulf": {
    ar: {
      slug: "send-gifts-to-lebanon-from-gulf",
      eyebrow: "لبنان",
      title: "توصيل هدايا لبنان | أرسل هدية من السعودية والخليج",
      h1: "توصيل هدايا لبنان: كيف ترسل هدية إلى أهلك من السعودية والخليج",
      description:
        "دليل توصيل هدايا لبنان من الخارج: كيف تطلب من السعودية والخليج، طرق الدفع المقبولة، مواعيد التوصيل في نفس اليوم، والمناطق المغطاة في بيروت وكل لبنان.",
      dek:
        "كيف تطلب من الخليج، تدفع ببطاقتك، وتوصل هدية إلى أهلك في لبنان في الوقت المناسب.",
      geographyLabel: "لبنان",
      categoryLabel: "أدلة الإهداء",
      datePublished: "2026-08-19",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt: "باقة ورود وهدايا جاهزة للتوصيل إلى لبنان",
      heroFocal: "50% 40%",
      cta: { label: "ابدأ من هنا: توصيل الهدايا في بيروت وكل لبنان", path: "" , country: "lb" },
      relatedSlugs: [
        "send-roses-to-lebanon",
        "flower-shop-in-achrafieh",
        "what-to-send-when-there-are-no-words",
        "baby-boy-balloons",
        "gift-baskets-dubai",
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "هل أستطيع الطلب من السعودية والدفع ببطاقتي؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "نعم. تدفع ببطاقة فيزا أو ماستركارد أو عبر Apple Pay أو Google Pay مباشرة على الموقع، ولا تحتاج إلى حساب لبناني ولا إلى تحويل مالي.",
              },
            },
            {
              "@type": "Question",
              name: "كم يستغرق توصيل الهدية إلى لبنان؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "التوصيل في نفس اليوم متاح في بيروت للطلبات قبل الظهر بتوقيت بيروت، وفي اليوم التالي لبقية المناطق. المناسبات المعروفة سلفاً يُفضّل حجزها بتاريخ محدد قبل يومين.",
              },
            },
            {
              "@type": "Question",
              name: "هل يمكن إرفاق بطاقة بالعربية؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "نعم، تُكتب رسالتك بالعربية وتُطبع وتُرفق مع الهدية.",
              },
            },
            {
              "@type": "Question",
              name: "هل يعرف المُستلِم أنني أنا من أرسل؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "يعرف ما تكتبه أنت في البطاقة فقط. إن أردت إبقاء الهدية مجهولة المصدر، اترك البطاقة دون توقيع.",
              },
            },
            {
              "@type": "Question",
              name: "ماذا لو لم يكن المُستلِم في المنزل؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "لهذا السبب رقم الهاتف المحلي مهم — يتم التواصل مع المُستلِم لتحديد وقت أو مكان بديل بدل إعادة الطلب.",
              },
            },
            {
              "@type": "Question",
              name: "هل التوصيل متاح خارج بيروت؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "نعم، التغطية تشمل معظم المناطق اللبنانية. اختر صفحة مدينة المُستلِم قبل التصفح لترى ما هو متاح فعلاً هناك.",
              },
            },
            {
              "@type": "Question",
              name: "هل أستطيع إرسال هدية إلى لبنان وأنا خارج العالم العربي؟",
              acceptedAnswer: {
                "@type": "Answer",
                text: "نعم. الطلب يتم من أي دولة، والفارق الوحيد هو الانتباه إلى توقيت بيروت عند اختيار موعد التسليم.",
              },
            },
          ],
        },
      ],
      sections: [
        {
          body: 'المسافة بين الرياض وبيروت ساعتان بالطائرة، لكنها تصبح طويلة جداً يوم عيد ميلاد أمك، أو حين يولد ابن أخيك، أو حين تريد ببساطة أن تقول "أنا أفكر فيكم". آلاف اللبنانيين في السعودية والإمارات والكويت وقطر يعيشون هذا الشعور كل شهر، والسؤال نفسه يتكرر: كيف أرسل هدية إلى لبنان من هنا، وأضمن أنها وصلت فعلاً؟',
        },
        {
          body: "هذا الدليل يجيب على السؤال بالتفصيل: كيف يعمل توصيل هدايا لبنان من الخارج، ما هي طرق الدفع التي تنجح من الخليج، متى تصل الهدية، وما الذي يستحق أن تُرسله في كل مناسبة.",
        },
        {
          heading: "لماذا كان إرسال الهدايا إلى لبنان صعباً — وما الذي تغيّر",
          body: "قبل سنوات، كانت الخيارات محدودة ومربكة. إما أن تعتمد على قريب في بيروت يشتري نيابةً عنك ويرسل لك صورة، أو أن تتعامل مع حساب على إنستغرام يطلب تحويلاً مالياً مسبقاً بلا أي ضمان، أو أن تجرّب موقعاً عالمياً يعرض أسعاراً بالدولار ثم يعتذر عن التوصيل خارج بيروت.\n\nالمشكلة لم تكن في الهدية، بل في ثلاثة أمور: الدفع من بطاقة خليجية، والتغطية خارج العاصمة، والإثبات أن الهدية سُلّمت فعلاً.\n\nالخدمة الحديثة لتوصيل الهدايا في لبنان تعالج الثلاثة معاً: تدفع ببطاقتك من مكانك، تختار المدينة والمنطقة من قائمة واضحة، وتصلك تأكيد التسليم. أنت تطلب من الدمام، والهدية تُجهَّز في بيروت وتُسلَّم في نفس اليوم.",
        },
        {
          heading: "كيف تطلب من خارج لبنان: الخطوات",
          body: "الطلب لا يحتاج إلى حساب مصرفي لبناني ولا إلى وسيط.",
          ordered: true,
          items: [
            'اختر المدينة أولاً. ابدأ من صفحة المدينة التي يسكنها المُستلِم — <a href="/ar-lb/beirut">بيروت</a> هي الأكثر طلباً، وهناك صفحات مخصصة لـ<a href="/ar-lb/aley">عاليه</a> و<a href="/ar-lb/baabda">بعبدا</a> و<a href="/ar-lb/akkar">عكار</a> و<a href="/ar-lb/baalbeck">بعلبك</a> وغيرها. اختيار المدينة أولاً يضمن أن كل ما تراه بعدها قابل للتوصيل فعلاً إلى هناك.',
            'اختر الهدية حسب المناسبة. التصفح عبر <a href="/ar-lb/beirut/occasions">المناسبات</a> أسرع من التصفح العشوائي: <a href="/ar-lb/beirut/occasion/birthday">عيد ميلاد</a>، <a href="/ar-lb/beirut/occasion/anniversary">ذكرى زواج</a>، <a href="/ar-lb/beirut/occasion/new-born">مولود جديد</a>، <a href="/ar-lb/beirut/occasion/wedding">زفاف</a>، أو <a href="/ar-lb/beirut/occasion/funeral">تعزية</a>.',
            'اكتب بطاقة تهنئة بالعربية. البطاقة تُطبع وتُرفق مع الهدية. هذه التفصيلة الصغيرة هي ما يجعل الهدية "منك" وليست طرداً مجهولاً.',
            "أدخل عنوان المُستلِم ورقم هاتفه المحلي. رقم لبناني فعّال يختصر الكثير — السائق يتصل قبل الوصول.",
            "ادفع ببطاقتك. لا حاجة لتحويل بنكي ولا لواسطة.",
          ],
        },
        {
          heading: "طرق الدفع من الخليج: ما الذي ينجح فعلاً",
          body: 'هذه هي النقطة التي يتعثر عندها معظم الناس، فلنكن واضحين فيها.\n\n- بطاقات الائتمان والخصم (فيزا وماستركارد): تعمل من السعودية والإمارات والكويت وقطر والبحرين وعُمان ومن أي دولة أخرى. الدفع يتم على الموقع مباشرة، والمبلغ يُخصم من بطاقتك بعملتك.\n- Apple Pay: الخيار الأسرع من الآيفون — بصمة أو Face ID، بلا إدخال أرقام بطاقة.\n- Google Pay: متاح كذلك لمستخدمي أندرويد.\n- الدفع عند الاستلام: مفيد في حالة واحدة تحديداً — حين يكون المُستلِم أو أحد أفراد العائلة في لبنان هو من سيدفع، مثلاً حين تنسّق مجموعة أصدقاء هدية مشتركة. لكن إن كنت أنت من يرسل من الخارج، فالدفع الإلكتروني المسبق هو الأنسب دائماً: الهدية تُسلَّم دون أن يُطلب من أحد في لبنان أي شيء.\n\nنصيحة عملية: بعض البنوك الخليجية تحجب المعاملات الدولية غير المعتادة تلقائياً. إن رُفضت العملية من المرة الأولى، فالسبب غالباً بنكك لا الموقع — فعّل "الشراء عبر الإنترنت الدولي" من تطبيق بنكك وأعد المحاولة، أو استخدم Apple Pay الذي يمر عبر مسار مختلف.',
        },
        {
          heading: "مواعيد التوصيل: متى تصل الهدية",
          items: [
            "التوصيل في نفس اليوم متاح في بيروت عند الطلب قبل الظهر بتوقيت بيروت. انتبه إلى فارق التوقيت: بيروت متأخرة ساعة عن السعودية وساعتين عن الإمارات. أي أن «قبل الظهر في بيروت» تعني قبل الواحدة ظهراً في الرياض وقبل الثانية في دبي.",
            "التوصيل في اليوم التالي هو الخيار الآمن لبقية المناطق، وللطلبات المسائية.",
            "الطلب المسبق بتاريخ محدد هو الأفضل للمناسبات المعروفة سلفاً. اطلب قبل يومين على الأقل في مواسم الذروة — عيد الأم، عيد الحب، رأس السنة — لأن الطلب فيها يرتفع بشكل حاد.",
          ],
        },
        {
          heading: "ماذا ترسل: أفكار تنجح فعلاً",
          body: 'الورود تبقى الخيار الأول لأنها لا تُخطئ أبداً: عيد ميلاد، اعتذار، ذكرى، أو "بلا سبب". إن كنت متردداً، فباقة ورد جوري كلاسيكية هي أضمن هدية يمكن إرسالها إلى لبنان — تفاصيل أكثر في مقالنا عن <a href="/ar/blog/send-roses-to-lebanon">إرسال الورود إلى لبنان</a>.\n\nالكيك والحلويات هي الهدية الأنسب حين يكون هناك تجمّع عائلي. كيكة تصل إلى الطاولة في الوقت المناسب تفعل ما لا تفعله رسالة "كل عام وأنت بخير".\n\nعلب الشوكولاتة خيار محايد وأنيق يصلح للأهل والأصدقاء وزملاء العمل على حد سواء، ويحتمل التأخير أكثر من الورد.\n\nالبالونات تصنع الفارق في أعياد ميلاد الأطفال وفي استقبال المواليد الجدد — راجع دليلنا عن <a href="/ar/blog/baby-boy-balloons">بالونات المولود</a>.\n\nالنباتات هدية لمن يفضّل ما يبقى: نبتة تعيش أشهراً وتُذكّر صاحبها بمن أرسلها في كل مرة يسقيها.\n\nهدايا التعزية فئة قائمة بذاتها ولها ذوقها الخاص. حين تعجز الكلمات، تكون باقة بيضاء بسيطة أبلغ من أي رسالة — تحدّثنا عن هذا في <a href="/ar/blog/what-to-send-when-there-are-no-words">ماذا ترسل حين تعجز الكلمات</a>.',
        },
        {
          heading: "التغطية: أبعد من بيروت",
          body: "بيروت هي الأسرع، لكن التوصيل لا يتوقف عندها. تبدأ التغطية من قلب العاصمة — الأشرفية والحمرا والجميزة وبدارو — ثم تمتد إلى بعبدا وعاليه والمتن، ووصولاً إلى طرابلس وصيدا وزحلة وبعلبك وعكار. إن كان أهلك في قرية صغيرة، اختر صفحة المحافظة أو القضاء الأقرب وتأكد من العنوان مع المُستلِم مسبقاً — عنوان دقيق مع نقطة دلالة («قرب صيدلية…») يختصر ساعة كاملة على السائق في المناطق الجبلية.",
        },
        {
          heading: "أسئلة شائعة عن توصيل هدايا لبنان",
          faqItems: [
            { q: "هل أستطيع الطلب من السعودية والدفع ببطاقتي؟", a: "نعم. تدفع ببطاقة فيزا أو ماستركارد أو عبر Apple Pay أو Google Pay مباشرة على الموقع، ولا تحتاج إلى حساب لبناني ولا إلى تحويل مالي." },
            { q: "كم يستغرق توصيل الهدية إلى لبنان؟", a: "التوصيل في نفس اليوم متاح في بيروت للطلبات قبل الظهر بتوقيت بيروت، وفي اليوم التالي لبقية المناطق. المناسبات المعروفة سلفاً يُفضّل حجزها بتاريخ محدد قبل يومين." },
            { q: "هل يمكن إرفاق بطاقة بالعربية؟", a: "نعم، تُكتب رسالتك بالعربية وتُطبع وتُرفق مع الهدية." },
            { q: "هل يعرف المُستلِم أنني أنا من أرسل؟", a: "يعرف ما تكتبه أنت في البطاقة فقط. إن أردت إبقاء الهدية مجهولة المصدر، اترك البطاقة دون توقيع." },
            { q: "ماذا لو لم يكن المُستلِم في المنزل؟", a: "لهذا السبب رقم الهاتف المحلي مهم — يتم التواصل مع المُستلِم لتحديد وقت أو مكان بديل بدل إعادة الطلب." },
            { q: "هل التوصيل متاح خارج بيروت؟", a: "نعم، التغطية تشمل معظم المناطق اللبنانية. اختر صفحة مدينة المُستلِم قبل التصفح لترى ما هو متاح فعلاً هناك." },
            { q: "هل أستطيع إرسال هدية إلى لبنان وأنا خارج العالم العربي؟", a: "نعم. الطلب يتم من أي دولة، والفارق الوحيد هو الانتباه إلى توقيت بيروت عند اختيار موعد التسليم." },
          ],
        },
        {
          heading: "الخلاصة",
          body: 'إرسال هدية إلى لبنان من الخارج لم يعد يحتاج إلى وسيط ولا إلى تحويل مالي ولا إلى ثقة عمياء. اختر المدينة، اختر الهدية، اكتب البطاقة، ادفع ببطاقتك — والباقي يحدث في بيروت.\n\n<a href="/ar-lb/beirut">ابدأ من هنا: توصيل الهدايا في بيروت وكل لبنان</a>',
        },
      ],
    },
  },
  "flower-shops-in-lebanon": {
    en: {
      slug: "flower-shops-in-lebanon",
      eyebrow: "Lebanon",
      title: "Flower Shops in Lebanon: A Complete Guide to Ordering Online",
      h1: "Flower Shops in Lebanon: A Complete Guide",
      description:
        "A practical guide to choosing a flower shop in Lebanon and ordering online — what to look for, what's worth ordering, and same-day delivery across Beirut and beyond.",
      dek:
        "How to choose a flower shop in Lebanon, what to order, and what to check before arranging same-day delivery.",
      geographyLabel: "Lebanon",
      categoryLabel: "Flower Guides",
      datePublished: "2026-08-19",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ogImageAlt: "Fresh flowers arranged in a Beirut flower shop",
      heroFocal: "50% 45%",
      cta: { label: "Shop Flowers →", path: "/category/hand-bouquets", country: "lb" },
      relatedSlugs: [
        "flower-shop-in-achrafieh",
        "send-roses-to-lebanon",
        "send-gifts-to-lebanon-from-gulf",
        "corporate-gifting-lebanon",
      ],
      sections: [
        {
          body: `Lebanon has always had strong flower culture — Beirut in particular has no shortage of florists, from small neighborhood shops to larger studios. What's changed in recent years is how people actually order: fewer walk-ins, far more same-day online delivery, often booked from a phone in the middle of a workday. If you're trying to figure out where to order flowers in Lebanon and what actually matters when choosing, here's a practical guide.`,
        },
        {
          heading: "What to Actually Look For in a Flower Shop",
          body: `Not all "flower delivery" claims hold up. A few things worth checking before you commit to an order:\n\n<strong>Same-day delivery, genuinely.</strong> Plenty of shops advertise same-day delivery but only within a narrow window or a single neighborhood. Worth confirming coverage for the specific area you're sending to before assuming it'll arrive on time.\n\n<strong>Photos that match what shows up.</strong> This is the most common complaint with online flower orders anywhere — the arrangement in the photo isn't what arrives. Shops that show real product photography (not stock images) tend to be more reliable here.\n\n<strong>Clear pricing before checkout.</strong> Delivery fees, especially to areas outside the main city, should be visible upfront rather than added as a surprise at the last step.\n\n<strong>Coverage beyond Beirut.</strong> A lot of florists only really serve Beirut proper. If you're sending flowers to Metn, the Chouf, the Bekaa, or further out, it's worth confirming delivery actually reaches there before ordering.`,
        },
        {
          heading: "What's Worth Ordering, by Type",
          body: `<strong>Classic hand-tied bouquets.</strong> The <a href="/en-lb/beirut/product/red-ribbon-bouquet">Red Ribbon Bouquet</a> ($180) is a good example of what a well-made bouquet should look like — full, properly wrapped, no filler stems padding out the arrangement.\n\n<strong>Boxed arrangements.</strong> For something a little more contemporary than a traditional bouquet, <a href="/en-lb/beirut/product/plum-florals">Plum Florals</a> ($75) is arranged directly in a box rather than tied — no vase required, and it tends to photograph better for the recipient to share.\n\n<strong>Vase arrangements.</strong> If you'd rather the recipient not have to deal with finding a vase, <a href="/en-lb/beirut/product/crimson-rose-vase">Crimson Rose Vase</a> ($50) arrives ready to place on a table or counter as-is.\n\n<strong>Statement luxury pieces.</strong> For the rare occasion that calls for something genuinely impressive, <a href="/en-lb/beirut/product/100-orange-roses-arrangement">100 Orange Roses Arrangement</a> ($307) is the kind of piece that doesn't need explaining when it arrives.\n\n<strong>Flowers that last beyond a week.</strong> If longevity matters more than the traditional fresh-cut look, <a href="/en-lb/beirut/product/red-eternal-rose">Red Eternal Rose</a> ($51) is preserved to hold its form for months rather than days.`,
        },
        {
          heading: "Browse by Category",
          body: `Rather than scrolling one long catalogue, it's usually faster to start from the format you want:\n\n- <strong><a href="/en-lb/beirut/category/hand-bouquets">Hand Bouquets</a></strong> — the classic, hand-tied format\n- <strong><a href="/en-lb/beirut/category/flower-boxes">Flower Boxes</a></strong> — arranged in a box, no vase needed\n- <strong><a href="/en-lb/beirut/category/flower-vases">Flower Vases</a></strong> — arrives ready to display\n- <strong><a href="/en-lb/beirut/category/preserved-flowers">Preserved Flowers</a></strong> — lasts months, not days`,
        },
        {
          heading: "Delivery Across Lebanon",
          body: `Presentail delivers same-day across Beirut and the wider Metn area, with coverage extending to cities across Lebanon. Order before midday for same-afternoon delivery, or schedule ahead for an exact time — useful for birthdays, anniversaries, or any delivery tied to a specific moment in someone's day.`,
        },
        {
          heading: "Ready to Order?",
          body: `<strong><a href="/en-lb/beirut/category/hand-bouquets">Shop Flowers →</a></strong>\n\nPresentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your flowers arrive exactly when they should.`,
        },
      ],
    },
    fr: {
      slug: "flower-shops-in-lebanon",
      eyebrow: "Liban",
      title: "Fleuristes au Liban : guide complet pour commander en ligne",
      seoTitle: "Fleuristes au Liban et livraison en ligne | Presentail",
      h1: "Fleuristes au Liban : guide complet pour commander en ligne",
      description:
        "Guide pratique pour choisir un fleuriste au Liban et commander en ligne : les critères à vérifier, les compositions qui valent le détour et la livraison le jour même à Beyrouth et au-delà.",
      dek:
        "Comment choisir un fleuriste au Liban, quoi commander et quels points vérifier avant une livraison le jour même.",
      geographyLabel: "Liban",
      categoryLabel: "Guides fleurs",
      datePublished: "2026-08-19",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ogImageAlt: "Fleurs fraîches arrangées dans une boutique de Beyrouth",
      heroFocal: "50% 45%",
      cta: { label: "Acheter des fleurs →", path: "/category/hand-bouquets", country: "lb" },
      relatedSlugs: [
        "flower-shop-in-achrafieh",
        "send-roses-to-lebanon",
        "send-gifts-to-lebanon-from-gulf",
        "corporate-gifting-lebanon",
      ],
      sections: [
        {
          body: `Le Liban a toujours eu une vraie culture des fleurs — Beyrouth en particulier ne manque pas de fleuristes, des petites boutiques de quartier aux studios plus importants. Ce qui a changé ces dernières années, c'est la manière de commander : moins de visites en boutique et beaucoup plus de livraisons le jour même, souvent réservées depuis un téléphone au milieu d'une journée de travail. Si vous cherchez où commander des fleurs au Liban et ce qui compte vraiment dans le choix d'un fleuriste, voici un guide pratique.`,
        },
        {
          heading: "Ce qu'il faut vraiment rechercher chez un fleuriste",
          body: `Toutes les promesses de « livraison de fleurs » ne se valent pas. Voici quelques points à vérifier avant de commander :\n\n<strong>Une vraie livraison le jour même.</strong> De nombreuses boutiques annoncent une livraison le jour même, mais uniquement sur un créneau très limité ou dans un seul quartier. Vérifiez la couverture de la zone précise où vous envoyez les fleurs avant de supposer qu'elles arriveront à temps.\n\n<strong>Des photos fidèles à ce qui est livré.</strong> C'est la plainte la plus fréquente concernant les commandes de fleurs en ligne : la composition photographiée ne ressemble pas à celle qui arrive. Les fleuristes qui montrent de vraies photos de leurs produits, plutôt que des images de stock, sont généralement plus fiables.\n\n<strong>Des prix clairs avant le paiement.</strong> Les frais de livraison, surtout vers les zones éloignées du centre, doivent être affichés à l'avance et non ajoutés comme une surprise à la dernière étape.\n\n<strong>Une couverture au-delà de Beyrouth.</strong> Beaucoup de fleuristes desservent réellement Beyrouth uniquement. Si vous envoyez des fleurs au Metn, au Chouf, dans la Bekaa ou plus loin, vérifiez que la livraison atteint bien cette zone avant de commander.`,
        },
        {
          heading: "Que commander, selon le type de composition",
          body: `<strong>Bouquets classiques noués à la main.</strong> Le <a href="/en-lb/beirut/product/red-ribbon-bouquet">Red Ribbon Bouquet</a> (180 $) montre à quoi ressemble un bouquet bien réalisé : généreux, soigneusement emballé et sans tiges de remplissage pour donner artificiellement du volume.\n\n<strong>Compositions en boîte.</strong> Pour une option plus contemporaine qu'un bouquet traditionnel, le <a href="/en-lb/beirut/product/plum-florals">Plum Florals</a> (75 $) est arrangé directement dans une boîte plutôt que noué : aucun vase n'est nécessaire et la composition se photographie très bien.\n\n<strong>Compositions en vase.</strong> Si vous préférez éviter au destinataire de chercher un vase, le <a href="/en-lb/beirut/product/crimson-rose-vase">Crimson Rose Vase</a> (50 $) arrive prêt à poser sur une table ou un comptoir.\n\n<strong>Pièces luxueuses remarquables.</strong> Pour une occasion qui mérite un effet spectaculaire, le <a href="/en-lb/beirut/product/100-orange-roses-arrangement">100 Orange Roses Arrangement</a> (307 $) est le genre de composition qui se suffit à elle-même.\n\n<strong>Des fleurs qui durent plus d'une semaine.</strong> Si la longévité compte plus que l'aspect des fleurs fraîchement coupées, la <a href="/en-lb/beirut/product/red-eternal-rose">Red Eternal Rose</a> (51 $) est préservée pour garder sa forme pendant des mois plutôt que quelques jours.`,
        },
        {
          heading: "Parcourir par catégorie",
          body: `Au lieu de parcourir un long catalogue, il est souvent plus rapide de commencer par le format souhaité :\n\n- <strong><a href="/en-lb/beirut/category/hand-bouquets">Bouquets noués à la main</a></strong> — le format classique\n- <strong><a href="/en-lb/beirut/category/flower-boxes">Boîtes de fleurs</a></strong> — arrangées dans une boîte, sans vase\n- <strong><a href="/en-lb/beirut/category/flower-vases">Fleurs en vase</a></strong> — prêtes à être exposées\n- <strong><a href="/en-lb/beirut/category/preserved-flowers">Fleurs préservées</a></strong> — durent des mois, pas des jours`,
        },
        {
          heading: "Livraison partout au Liban",
          body: `Presentail livre le jour même à Beyrouth et dans une grande partie du Metn, avec une couverture qui s'étend aux villes de tout le Liban. Commandez avant midi pour une livraison le même après-midi, ou programmez votre commande à l'avance pour une heure précise — pratique pour les anniversaires, les anniversaires de mariage ou toute livraison liée à un moment particulier de la journée.`,
        },
        {
          heading: "Prêt à commander ?",
          body: `<strong><a href="/en-lb/beirut/category/hand-bouquets">Acheter des fleurs →</a></strong>\n\nPresentail livre au Liban, aux Émirats arabes unis et à Chypre, avec des options de livraison le jour même ou planifiée pour que vos fleurs arrivent exactement au bon moment.`,
        },
      ],
    },
  },
  "inside-spring-sourcing-trip": {
    en: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "Seasonal sourcing",
      title: "Inside our spring sourcing trip",
      description:
        "How our florists pick the season's best peonies, ranunculi, and garden roses — and what to look for when a bloom is at its peak.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      relatedSlugs: ["chocolatiers-behind-our-gift-boxes", "flower-shop-in-achrafieh", "send-roses-to-lebanon"],
      sections: [
        {
          body: "Every spring, our lead florists travel to wholesale markets and grower farms across Lebanon, the Netherlands, and Turkey to select the stems that will fill our arrangements through April and May. It is not simply a buying trip — it is a long negotiation with the season itself.",
        },
        {
          heading: "What we look for first",
          body: "The first thing we check is the bud stage. A peony should arrive tightly closed, almost cabbage-like, so it has room to open in the studio or in the recipient's home. Buy a fully open peony at market, and it will be spent within two days of delivery. We want petals still cupped around the centre, sepals still green and protective.",
        },
        {
          heading: "Ranunculi and their many layers",
          body: "Ranunculi are our second benchmark flower of the season. They are deceptively fragile — the stems bruise easily and the blooms sulk if their water is changed carelessly — but when they are right, there is nothing more layered or painterly in an arrangement. We look for tight, multi-petalled buds in soft cream, coral, and dusty rose, avoiding anything with translucent petals that signals over-development.",
        },
        {
          heading: "Garden roses, and why they are worth the premium",
          body: "Garden roses differ from standard hybrid tea roses in their petal count and fragrance. A good David Austin variety might have sixty or eighty petals where a standard rose has thirty. That density holds longer under Lebanon's spring heat, and the scent carries into a room in a way that spray roses never do. We source primarily from Dutch growers whose stems are flown in on the same day they are cut — freshness over local proximity, always.",
        },
        {
          heading: "Getting the stems home",
          body: "The cold chain from grower to studio is where most flower quality is lost. We work with a temperature-controlled logistics partner and condition stems immediately on arrival — removing foliage below the water line, making a fresh diagonal cut, and hydrating for a minimum of four hours before any arrangement begins. By the time a bouquet leaves our studio, the flowers have been rested, not rushed.",
        },
      ],
    },
    ar: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "مصادر موسمية",
      title: "داخل رحلة مصادر الربيع",
      description:
        "كيف يختار منسّقو الأزهار لدينا أفضل أزهار الفاوانيا والحوذان وورود الحدائق — وما الذي يدلّ على ذروة جمال الزهرة.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      relatedSlugs: ["chocolatiers-behind-our-gift-boxes", "flower-shop-in-achrafieh", "send-roses-to-lebanon"],
      sections: [
        {
          body: "كلّ ربيع، يتنقّل منسّقو الأزهار الرئيسيون لدينا بين أسواق الجملة ومزارع المنتجين في لبنان وهولندا وتركيا، لاختيار الأزهار التي ستملأ تشكيلاتنا طوال أبريل ومايو. إنها ليست رحلة شراء بالمعنى المعتاد، بل هي تفاوض طويل مع الموسم نفسه.",
        },
        {
          heading: "ما الذي نبحث عنه أوّلاً",
          body: "أوّل ما نتحقّق منه هو مرحلة البرعم. يجب أن تصلنا الفاوانيا مغلقةً بشكل محكم، تقريباً كرأس الملفوف، حتى يكون لها متّسع للتفتّح في الاستوديو أو في منزل المستلم. إن اشتريتَ فاوانيا مفتوحة تماماً من السوق، فستنتهي في غضون يومين من التوصيل.",
        },
        {
          heading: "الحوذان وطبقاته المتعدّدة",
          body: "الحوذان هو زهرتنا المعيارية الثانية لهذا الموسم. إنه هشّ بشكل مخادع — تتكدّم سيقانه بسهولة وتمتنع عن التفتّح إذا غُيّر ماؤه باستهتار — لكن حين يكون في أحسن حالاته، لا شيء يضاهيه من حيث التطبيق والجمال التشكيلي في الباقة. نبحث عن براعم مكتنزة متعدّدة البتلات بألوان كريم ناعمة ومرجانية ووردي مترّب.",
        },
        {
          heading: "ورود الحدائق، ولماذا تستحق السعر المرتفع",
          body: "تختلف ورود الحدائق عن الورود الهجينة الاعتيادية في عدد بتلاتها وعبيرها. قد يحتوي صنف David Austin الجيّد على ستين أو ثمانين بتلة، حيث لا تتجاوز الوردة الاعتيادية ثلاثين. هذه الكثافة تتحمّل حرارة لبنان الربيعية لفترة أطول، والعطر يملأ الغرفة بطريقة لا تستطيعها الورود البخاخة أبداً.",
        },
        {
          heading: "إيصال الأزهار بأمان",
          body: "سلسلة التبريد من المزرعة إلى الاستوديو هي المكان الذي تضيع فيه معظم جودة الأزهار. نعمل مع شريك لوجستي مع تحكّم في درجة الحرارة، ونعالج الأزهار فور وصولها — نزع الأوراق تحت خطّ الماء، وإجراء قطع قطري طازج، ثم الترطيب لمدّة أربع ساعات على الأقل قبل الشروع في أي تنسيق.",
        },
      ],
    },
    fr: {
      slug: "inside-spring-sourcing-trip",
      eyebrow: "Sourcing de saison",
      title: "Dans les coulisses de notre sourcing de printemps",
      description:
        "Comment nos fleuristes choisissent les plus belles pivoines, renoncules et roses de jardin — et comment reconnaître une fleur à son apogée.",
      datePublished: "2025-03-15",
      ogImage: { url: "/blog/inside-spring-sourcing-trip.webp", width: 1408, height: 768 },
      relatedSlugs: ["chocolatiers-behind-our-gift-boxes", "flower-shop-in-achrafieh", "send-roses-to-lebanon"],
      sections: [
        {
          body: "Chaque printemps, nos fleuristes principaux se rendent dans des marchés de gros et des fermes de producteurs au Liban, aux Pays-Bas et en Turquie pour sélectionner les tiges qui garniront nos compositions d'avril à mai. Ce n'est pas simplement un voyage d'achat — c'est une longue négociation avec la saison elle-même.",
        },
        {
          heading: "Ce que nous cherchons en premier",
          body: "La première chose que nous vérifions, c'est le stade du bouton. Une pivoine doit arriver bien fermée, presque comme un chou, pour pouvoir s'ouvrir en atelier ou chez le destinataire. Une pivoine achetée déjà épanouie sera fanée en deux jours. Nous cherchons des pétales encore enroulés autour du cœur, des sépales encore verts et protecteurs.",
        },
        {
          heading: "Les renoncules et leurs multiples couches",
          body: "Les renoncules sont notre deuxième fleur de référence de la saison. Elles sont trompeusement fragiles — leurs tiges se froissent facilement et les fleurs boudent si on change leur eau sans précaution — mais quand elles sont à leur meilleur, rien n'est plus feuilleté ni pictural dans une composition. Nous privilégions des boutons serrés, aux pétales multiples, en crème douce, corail et rose poudré.",
        },
        {
          heading: "Les roses de jardin, et pourquoi elles valent le prix",
          body: "Les roses de jardin diffèrent des roses hybrides standard par leur nombre de pétales et leur parfum. Une bonne variété David Austin peut avoir soixante ou quatre-vingts pétales là où une rose standard en compte trente. Cette densité résiste mieux à la chaleur printanière du Liban, et le parfum emplit une pièce d'une façon que les roses spray ne feront jamais.",
        },
        {
          heading: "Acheminer les tiges jusqu'au studio",
          body: "La chaîne du froid du producteur au studio est l'endroit où la plupart de la qualité des fleurs est perdue. Nous travaillons avec un partenaire logistique à température contrôlée et conditionnons les tiges dès leur arrivée — retrait du feuillage sous la ligne d'eau, coupe diagonale fraîche, et hydratation pendant au moins quatre heures avant tout arrangement.",
        },
      ],
    },
  },

  "chocolatiers-behind-our-gift-boxes": {
    en: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "Maker spotlight",
      title: "The chocolatiers behind our gift boxes",
      description:
        "We sit down with the family-run ateliers we partner with across Beirut, Dubai, and Limassol to talk craft, cocoa, and patience.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      relatedSlugs: ["inside-spring-sourcing-trip", "best-cakes-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "Every Presentail gift box that includes chocolate has a story behind the chocolate itself. We don't buy from wholesale confectionery distributors. We source from small-batch ateliers — most of them family businesses in their second or third generation — who still temper by hand and source their cocoa with care.",
        },
        {
          heading: "Why small-batch matters",
          body: "Industrial chocolate is calibrated for shelf life and cost, not flavour. A family atelier working in small batches can afford to use single-origin beans, to roast lightly and preserve floral and fruity top notes that mass production burns away. The texture is also different — properly tempered chocolate has a clean snap and a gloss that doesn't come from machinery alone.",
        },
        {
          heading: "Our Beirut partner",
          body: "Our Beirut partner has been making pralines and enrobed chocolates on the same street in Gemmayzeh since the early 1980s. The current owner, the founder's daughter, still uses her mother's ganache ratios and sources her hazelnuts from the same Bekaa Valley farmers her family has worked with for two decades. We asked her once what the hardest part of the work was. She said: waiting. 'Chocolate teaches patience,' she told us. 'You can't rush the crystallisation.'",
        },
        {
          heading: "Dubai and Abu Dhabi",
          body: "In the UAE, we work with an atelier founded by a Lebanese expat couple who moved to Dubai in the early 2000s and found there was no local equivalent of the chocolate they grew up eating. Their speciality is orange blossom and cardamom ganaches — distinctly Levantine flavours in an extremely precise French confectionery form. Their boxes are among the most requested additions to our UAE gift sets.",
        },
        {
          heading: "Limassol, and what Cyprus adds",
          body: "Our Cyprus partner is the youngest of the three, founded less than a decade ago by a pastry chef who trained in Lyon and returned home to Limassol. She focuses on seasonal fillings — carob in winter, pistachios in spring, local citrus through the summer — and her packaging has a spare, architectural quality that works beautifully alongside our floral arrangements. She is also our most experimental partner, willing to create bespoke flavours for large wedding or corporate orders.",
        },
        {
          heading: "How we select",
          body: "Every new partner goes through a tasting panel with our operations team before we commit to an order. We look at flavour first, then consistency across a full box, then packaging robustness (a chocolate that crumbles in transit is useless regardless of how it tastes), and finally lead times. All three of our current partners can fulfil same-day for most of our standard box sizes.",
        },
      ],
    },
    ar: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "تعريف بصانع",
      title: "صنّاع الشوكولاتة وراء علب هدايانا",
      description:
        "نجلس مع الأتيليهات العائلية التي نتعاون معها في بيروت ودبي وليماسول للحديث عن الحرفة والكاكاو والصبر.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      relatedSlugs: ["inside-spring-sourcing-trip", "best-cakes-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "كلّ علبة هدايا من Presentail تحتوي على شوكولاتة، تحمل قصةً خلف تلك الشوكولاتة بالذات. نحن لا نشتري من موزّعي الحلويات بالجملة. نحن نصادر من أتيليهات الإنتاج الصغير — معظمها مشاريع عائلية في الجيل الثاني أو الثالث — لا تزال تُعدّل الشوكولاتة يدويًا وتختار حبوب الكاكاو بعناية.",
        },
        {
          heading: "لماذا يهمّ الإنتاج الصغير",
          body: "الشوكولاتة الصناعية مُعايَرة لصالح مدة الصلاحية والتكلفة، لا للنكهة. يستطيع الأتيليه العائلي العامل بكميات صغيرة تحمّل استخدام حبوب أحادية المصدر، وتحميص خفيف يحافظ على النغمات الزهرية والفواكه التي يحترقها الإنتاج الضخم. الملمس أيضًا مختلف — الشوكولاتة المعدَّلة بشكل صحيح لها طقطقة نظيفة ولمعان لا تمنحه الآلات وحدها.",
        },
        {
          heading: "شريكنا في بيروت",
          body: "يصنع شريكنا في بيروت البراليين والشوكولاتة المغطّاة في الشارع ذاته في الجميزة منذ مطلع الثمانينيات. المالكة الحالية، ابنة المؤسّس، لا تزال تستخدم نسب غاناش والدتها وتستورد البندق من مزارعي سهل البقاع أنفسهم الذين تعاملت معهم عائلتها لعقدين. سألناها ذات مرّة: ما أصعب جانب في العمل؟ قالت: الانتظار. 'الشوكولاتة تعلّمك الصبر'، قالت لنا. 'لا يمكنك التعجّل في عملية التبلور.'",
        },
        {
          heading: "دبي وأبوظبي",
          body: "في الإمارات، نعمل مع أتيليه أسّسه زوجان لبنانيان من المغتربين انتقلا إلى دبي في مطلع الألفين ووجدا أنه لا يوجد مكافئ محلي للشوكولاتة التي نشآ على تناولها. تخصّصهما هو غاناش زهر البرتقال والهيل — نكهات شامية بامتياز في شكل حلويات فرنسية دقيق للغاية.",
        },
        {
          heading: "ليماسول، وما تضيفه قبرص",
          body: "شريكنا القبرصي هو الأصغر بين الثلاثة، تأسّس منذ أقل من عقد على يد طاهية معجنات تدرّبت في ليون وعادت إلى بلدها ليماسول. تركّز على حشوات موسمية — الخروب في الشتاء، والفستق في الربيع، والحمضيات المحلية طوال الصيف.",
        },
        {
          heading: "كيف نختار شركاءنا",
          body: "يمرّ كل شريك جديد بلجنة تذوّق مع فريق العمليات لدينا قبل الالتزام بأي طلب. ننظر أوّلاً إلى النكهة، ثم الاتساق عبر علبة كاملة، ثم متانة التغليف، وأخيراً مهل التسليم. يستطيع الشركاء الثلاثة الحاليون تلبية طلبات في نفس اليوم لمعظم أحجام العلب القياسية.",
        },
      ],
    },
    fr: {
      slug: "chocolatiers-behind-our-gift-boxes",
      eyebrow: "Portrait d'artisan",
      title: "Les chocolatiers derrière nos coffrets cadeaux",
      description:
        "Nous rencontrons les ateliers familiaux de Beyrouth, Dubaï et Limassol avec qui nous travaillons pour parler savoir-faire, cacao et patience.",
      datePublished: "2025-04-02",
      ogImage: { url: "/blog/chocolatiers-behind-our-gift-boxes.webp", width: 1408, height: 768 },
      relatedSlugs: ["inside-spring-sourcing-trip", "best-cakes-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "Chaque coffret cadeau Presentail qui contient du chocolat a une histoire derrière ce chocolat. Nous n'achetons pas auprès de distributeurs de confiserie en gros. Nous nous approvisionnons auprès d'ateliers artisanaux — la plupart des entreprises familiales à leur deuxième ou troisième génération — qui tempèrent encore à la main et sourcent leur cacao avec soin.",
        },
        {
          heading: "Pourquoi la petite production compte",
          body: "Le chocolat industriel est calibré pour la durée de conservation et le coût, pas pour la saveur. Un atelier familial travaillant en petites quantités peut se permettre d'utiliser des fèves d'origine unique, de torréfier légèrement pour préserver les notes florales et fruitées que la production de masse brûle. La texture est aussi différente — un chocolat correctement tempéré a un craquant net et un brillant qui ne viennent pas uniquement des machines.",
        },
        {
          heading: "Notre partenaire à Beyrouth",
          body: "Notre partenaire beyrouthin fabrique des pralines et des chocolats enrobés dans la même rue de Gemmayzeh depuis le début des années 1980. La propriétaire actuelle, la fille du fondateur, utilise toujours les ratios de ganache de sa mère et s'approvisionne en noisettes auprès des mêmes agriculteurs de la Bekaa avec lesquels sa famille travaille depuis deux décennies. Nous lui avons demandé une fois quelle était la partie la plus difficile du travail. Elle a dit : attendre. « Le chocolat enseigne la patience », nous a-t-elle confié.",
        },
        {
          heading: "Dubaï et Abu Dhabi",
          body: "Aux Émirats, nous travaillons avec un atelier fondé par un couple d'expatriés libanais qui se sont installés à Dubaï au début des années 2000 et ont constaté l'absence d'équivalent local du chocolat avec lequel ils avaient grandi. Leur spécialité est le ganache à la fleur d'oranger et à la cardamome — des saveurs résolument levantines dans une forme de confiserie française extrêmement précise.",
        },
        {
          heading: "Limassol, et ce que Chypre apporte",
          body: "Notre partenaire chypriote est le plus jeune des trois, fondé il y a moins d'une décennie par une pâtissière formée à Lyon et rentrée chez elle à Limassol. Elle se concentre sur des garnitures saisonnières — caroube en hiver, pistaches au printemps, agrumes locaux tout l'été — et son emballage a une qualité architecturale épurée.",
        },
        {
          heading: "Comment nous sélectionnons",
          body: "Chaque nouveau partenaire passe par un panel de dégustation avec notre équipe opérationnelle avant que nous nous engagions dans une commande. Nous examinons d'abord la saveur, puis la cohérence sur une boîte entière, puis la robustesse de l'emballage, et enfin les délais. Nos trois partenaires actuels peuvent livrer le jour même pour la plupart de nos tailles de boîtes standard.",
        },
      ],
    },
  },

  "what-to-send-when-there-are-no-words": {
    en: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "Gifting guide",
      title: "What to send when there are no words",
      description:
        "A short guide to thoughtful sympathy gifts — and how to write a card that actually helps.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "gift-shop-in-lebanon", "send-roses-to-lebanon"],
      sections: [
        {
          body: "Grief is one of the few occasions where most gifting rules dissolve. The instinct to send something — flowers, food, a small gesture of presence — is right, but the execution can feel impossible. What follows is a short, practical guide we have assembled from conversations with our florists and many years of watching what people choose to send, and why.",
        },
        {
          heading: "Flowers are almost always right",
          body: "Across most cultures we serve — Lebanon, the UAE, and Cyprus — flowers at a time of loss are understood without explanation. They signal presence without demand. They do not require a response. They arrive, they are beautiful for a few days, and they leave. That temporal quality is part of their power: a sympathy flower arrangement is not meant to be a permanent installation. Choose stems that are graceful rather than exuberant — whites and creams, soft lilacs, garden roses rather than tropical specimens. Avoid anything too festive in colour.",
        },
        {
          heading: "What to include alongside flowers",
          body: "A candle, a simple preserved fruit or sweet, or a box of high-quality chocolate works well beside flowers. The logic is the same: something that offers a small sensory comfort without requiring effort or decision from the recipient. Avoid anything that requires immediate attention — cut flowers in a foam arrangement that needs water every day, for example, or food that must be refrigerated promptly. Grief is already cognitively demanding.",
        },
        {
          heading: "How to write the card",
          body: "The card is where most people lose confidence, and where a few principles help. First: write in the first person, not the third. 'I am thinking of you' lands differently than 'Everyone is thinking of you.' Second: name the person who was lost, if you knew them. 'I will always remember how warmly Mariam welcomed us at your table' is more comforting than a general acknowledgement of loss. Third: resist the impulse to explain or find meaning. 'Everything happens for a reason' is rarely comforting; 'I love you and I am here' almost always is.",
        },
        {
          heading: "Timing",
          body: "In the acute days immediately after a death, people are often surrounded by family and focused on logistics. A delivery in the first day or two is appropriate and will be noticed, but a second delivery a week or two later — when the immediate crowd has dispersed and grief has settled into its quieter, lonelier second phase — can be more meaningful than the first. We offer the option to schedule deliveries in advance for exactly this reason.",
        },
        {
          heading: "When you are far away",
          body: "One of the most common reasons people contact us is distance. You have heard difficult news about someone you love who is in Beirut, Dubai, or Limassol, and you are in London or Paris or Lagos. Sending flowers across that distance is not a lesser gesture than being there in person — it is the version of being there that geography allows. We handle the local sourcing, arrangement, and delivery; you provide the intention behind it.",
        },
      ],
    },
    ar: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "دليل الإهداء",
      title: "ماذا ترسل حين تعجز الكلمات",
      description:
        "دليل قصير لهدايا التعازي المدروسة — وكيف تكتب بطاقة تُواسي فعلاً.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "gift-shop-in-lebanon", "send-roses-to-lebanon"],
      sections: [
        {
          body: "الحزن هو من المناسبات القليلة التي تتلاشى فيها معظم قواعد الإهداء. الدافع لإرسال شيء ما — أزهار، طعام، لفتة بسيطة تدلّ على الحضور — هو دافع صحيح، لكن التنفيذ قد يبدو مستحيلاً. ما يلي هو دليل موجز وعملي جمعناه من محادثات مع منسّقي الأزهار لدينا وسنوات طويلة من مراقبة ما يختار الناس إرساله، ولماذا.",
        },
        {
          heading: "الأزهار صحيحة دائماً تقريباً",
          body: "في معظم الثقافات التي نخدمها — لبنان والإمارات وقبرص — الأزهار في وقت الحزن مفهومة دون شرح. تُشير إلى الحضور دون أن تفرض شيئاً. لا تستوجب ردّاً. تصل، تبقى جميلة بضعة أيام، ثم تمضي. تلك الصفة الزمنية جزء من قوّتها. اختر أزهاراً رشيقة لا مبهجة — ألوان بيضاء وكريمية، وليلك ناعم، وورود حدائق بدلاً من النباتات الاستوائية.",
        },
        {
          heading: "ما تضيفه إلى جانب الأزهار",
          body: "شمعة، أو فاكهة محفوظة بسيطة، أو علبة شوكولاتة عالية الجودة تعمل جيداً إلى جانب الأزهار. المنطق واحد: شيء يقدّم راحةً حسّية صغيرة دون أن يتطلّب جهداً أو قراراً من المستلم. تجنّب أي شيء يستوجب اهتماماً فورياً — طعام يجب تبريده فوراً، على سبيل المثال. الحزن مُرهق ذهنياً بما يكفي.",
        },
        {
          heading: "كيف تكتب البطاقة",
          body: "البطاقة هي المكان الذي يفقد فيه معظم الناس ثقتهم. أوّلاً: اكتب بضمير المتكلّم. 'أنا أفكّر فيك' تصل بشكل مختلف عن 'الجميع يفكّر فيك'. ثانياً: سمّ الشخص الذي فُقد إذا كنت تعرفه. 'لن أنسى أبداً كيف استقبلتنا مريم بدفء على مائدتكم' أكثر إيناساً من اعتراف عام بالخسارة. ثالثاً: قاوِم الرغبة في التفسير أو إيجاد المعنى. 'أنا أحبّك وأنا هنا' مُواسٍ دائماً تقريباً.",
        },
        {
          heading: "التوقيت",
          body: "في الأيام الحادة التي تعقب الوفاة مباشرةً، يكون الناس محاطين في الغالب بالعائلة ومنشغلين بالإجراءات. التوصيل في اليوم الأوّل أو الثاني مناسب وسيُلاحَظ، لكن إرسالاً ثانياً بعد أسبوع أو أسبوعين — حين يتفرّق الحشد ويستقرّ الحزن في مرحلته الأكثر هدوءاً ووحدةً — قد يكون أعمق أثراً من الأوّل.",
        },
        {
          heading: "حين تكون بعيداً",
          body: "أحد أكثر الأسباب شيوعاً التي يتواصل بها الناس معنا هو المسافة. سمعتَ أخباراً صعبة عن شخص تحبّه في بيروت أو دبي أو ليماسول، وأنت في لندن أو باريس أو لاغوس. إرسال الأزهار عبر تلك المسافة ليس إيماءة أقل من الحضور الجسدي — إنها نسخة الحضور التي تسمح بها الجغرافيا. نحن نتولّى المصادر المحلية والترتيب والتوصيل؛ أنتَ توفّر النية الكامنة وراءها.",
        },
      ],
    },
    fr: {
      slug: "what-to-send-when-there-are-no-words",
      eyebrow: "Guide cadeau",
      title: "Quoi envoyer quand les mots manquent",
      description:
        "Un court guide des cadeaux de condoléances réfléchis — et comment écrire une carte qui réconforte vraiment.",
      datePublished: "2025-04-18",
      ogImage: { url: "/blog/what-to-send-when-there-are-no-words.webp", width: 1408, height: 768 },
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "gift-shop-in-lebanon", "send-roses-to-lebanon"],
      sections: [
        {
          body: "Le deuil est l'une des rares occasions où la plupart des règles d'offrir des cadeaux s'effacent. L'instinct d'envoyer quelque chose — des fleurs, de la nourriture, un petit geste de présence — est juste, mais l'exécution peut sembler impossible. Ce qui suit est un guide court et pratique que nous avons rassemblé à partir de conversations avec nos fleuristes et de nombreuses années à observer ce que les gens choisissent d'envoyer, et pourquoi.",
        },
        {
          heading: "Les fleurs sont presque toujours appropriées",
          body: "Dans la plupart des cultures que nous servons — Liban, Émirats et Chypre — les fleurs lors d'un deuil sont comprises sans explication. Elles signalent une présence sans exiger quoi que ce soit. Elles n'appellent pas de réponse. Elles arrivent, sont belles quelques jours, puis s'en vont. Choisissez des tiges gracieuses plutôt qu'exubérantes — blanc et crème, lilas doux, roses de jardin plutôt que spécimens tropicaux.",
        },
        {
          heading: "Ce qu'on peut ajouter à côté des fleurs",
          body: "Une bougie, un simple fruit confit ou une confiserie, ou une boîte de chocolat de qualité fonctionne bien aux côtés de fleurs. La logique est la même : quelque chose qui offre un petit réconfort sensoriel sans demander d'effort ou de décision au destinataire. Évitez tout ce qui nécessite une attention immédiate — de la nourriture à réfrigérer rapidement, par exemple. Le deuil est déjà suffisamment exigeant sur le plan cognitif.",
        },
        {
          heading: "Comment écrire la carte",
          body: "La carte est l'endroit où la plupart des gens perdent confiance. Premièrement : écrivez à la première personne. « Je pense à toi » a un impact différent de « Tout le monde pense à toi ». Deuxièmement : nommez la personne disparue si vous la connaissiez. « Je n'oublierai jamais la chaleur avec laquelle Mariam nous accueillait à votre table » est plus réconfortant qu'une reconnaissance générale du deuil. Troisièmement : résistez à l'envie d'expliquer. « Je t'aime et je suis là » est presque toujours réconfortant.",
        },
        {
          heading: "Le moment opportun",
          body: "Dans les jours aigus qui suivent immédiatement un décès, les gens sont souvent entourés de leur famille et focalisés sur la logistique. Une livraison le premier ou le deuxième jour est appropriée et sera remarquée, mais un second envoi une semaine ou deux plus tard — quand la foule immédiate s'est dispersée et que le deuil s'est installé dans sa phase plus calme et plus solitaire — peut être plus significatif que le premier.",
        },
        {
          heading: "Quand vous êtes loin",
          body: "L'une des raisons les plus courantes pour lesquelles les gens nous contactent est la distance. Vous avez appris de mauvaises nouvelles sur quelqu'un que vous aimez qui se trouve à Beyrouth, Dubaï ou Limassol, et vous êtes à Londres, Paris ou Lagos. Envoyer des fleurs à travers cette distance n'est pas un geste moindre qu'être présent en personne — c'est la version de la présence que la géographie permet. Nous gérons l'approvisionnement local, la composition et la livraison ; vous fournissez l'intention derrière tout cela.",
        },
      ],
    },
  },

  "flower-shop-in-achrafieh": {
    en: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "Beirut",
      title: "Flower Shop in Achrafieh | Presentail's Beirut Boutique",
      description:
        "Presentail's flower shop in Achrafieh sits steps from Hotel-Dieu de France on Abdel Wahab El Inglizi Street, with same-day and 90-minute delivery across Beirut.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/flowers",
      ctaLabel: "Shop flowers now →",
      h1: "The Best Flower Shop in Achrafieh, Beirut",
      ogImageAlt: "flower shop in Achrafieh Beirut — Presentail boutique",
      relatedSlugs: ["send-roses-to-lebanon", "inside-spring-sourcing-trip", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "If you're searching for a flower shop in Achrafieh, Presentail's boutique on Abdel Wahab El Inglizi Street — just steps from Hotel-Dieu de France — is where Beirut comes to pick up fresh flowers in person or order them online for same-day delivery anywhere in the city.\n\nAchrafieh has always been one of Beirut's most flower-loving neighborhoods, from the gift shops around Sassine Square to the boutiques lining Monot and the streets near Saint Nicolas Stairs. Presentail has been part of that tradition, serving the district with fresh, professionally arranged bouquets for birthdays, anniversaries, weddings, condolences, and everyday \"just because\" moments.",
        },
        {
          heading: "Our Achrafieh Flower Boutique",
          body: "Our physical flower shop is located on Abdel Wahab El Inglizi Street, Achrafieh, Beirut, near Hotel-Dieu de France hospital — an easy stop whether you're coming from Sassine, Sodeco, or Mar Mitr. Walk in to browse our fresh stock in person, get help building a bouquet on the spot, or pick up an online order.\n\nOpen daily from 7 AM to 1 AM — early enough for a morning pickup, late enough for a last-minute night delivery. Call ahead at 03 136 532 to check stock or place a phone order.",
        },
        {
          heading: "Why Achrafieh Residents Choose Presentail",
          items: [
            "Same-day delivery on orders placed before midday",
            "Express 90-minute delivery in select Beirut zones, including Achrafieh",
            "Scheduled delivery up to 30 days ahead — perfect for planning birthdays or anniversaries early",
            "A wide range beyond flowers: plants, cakes, chocolates, balloons, candles, and curated gift bundles",
            "A free personalized card with every order, so the message lands exactly as intended",
            "Years of experience helping Lebanese expats send flowers home, alongside walk-in customers from the neighborhood",
          ],
        },
        {
          heading: "Flowers for Every Occasion in Achrafieh",
          body: "Whatever the reason, our Achrafieh flower shop has an arrangement for it:",
          items: [
            "Birthdays and anniversaries — hand-tied bouquets and flower boxes",
            "Mother's Day, Father's Day, Valentine's Day, Christmas — seasonal collections, updated year-round",
            "Weddings and engagements — larger arrangements and centerpieces, made to order",
            "Sympathy and condolences — tasteful, respectful arrangements delivered with care",
            "Corporate gifting — flowers and gift bundles for clients, partners, or teams based in or around Achrafieh",
          ],
        },
        {
          heading: "Same-Day Flower Delivery in Achrafieh and Beyond",
          body: "Order from our Achrafieh boutique and we'll deliver the same day across Beirut, including Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut. Need it faster? Express delivery gets flowers to your recipient in as little as 90 minutes in select zones — ideal for last-minute Achrafieh deliveries.",
        },
        {
          heading: "Visit Us or Order Online",
          body: "Stop by the boutique on Abdel Wahab El Inglizi Street to pick out your bouquet in person, call 03 136 532 to order by phone, or browse and order online for same-day delivery anywhere in Beirut.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "Where is Presentail's flower shop in Achrafieh located?",
              a: "Our boutique is on Abdel Wahab El Inglizi Street in Achrafieh, Beirut, near Hotel-Dieu de France hospital.",
            },
            {
              q: "Do you offer same-day flower delivery in Achrafieh?",
              a: "Yes. Orders placed before midday are delivered the same day, and express 90-minute delivery is available in select zones including Achrafieh.",
            },
            {
              q: "Can I walk into the Achrafieh shop to buy flowers in person?",
              a: "Yes, the boutique is open for walk-in customers who want to browse fresh stock or pick up an online order in person.",
            },
            {
              q: "Do you deliver outside Achrafieh?",
              a: "Yes — from our Achrafieh boutique we deliver same-day across Beirut, including Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut, as well as further afield in Lebanon.",
            },
            {
              q: "Can I schedule a flower delivery in advance?",
              a: "Yes, you can schedule delivery up to 30 days ahead, which is useful for planning birthdays, anniversaries, or holidays.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "url": "https://presentail.com/en-lb/beirut",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Abdel Wahab El Inglizi Street",
            "addressLocality": "Achrafieh",
            "addressRegion": "Beirut",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          // The shop opens at 07:00 and closes at 01:00 the next morning (crosses
          // midnight). Google's Rich Results validator requires midnight-crossing
          // hours to be split into two separate OpeningHoursSpecification entries:
          // one that closes at midnight ("00:00") and one that covers the early
          // morning slot from "00:00" to the actual closing time.
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "00:00",
            },
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "00:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Where is Presentail's flower shop in Achrafieh located?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Our boutique is on Abdel Wahab El Inglizi Street in Achrafieh, Beirut, near Hotel-Dieu de France hospital.",
              },
            },
            {
              "@type": "Question",
              "name": "Do you offer same-day flower delivery in Achrafieh?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Orders placed before midday are delivered the same day, and express 90-minute delivery is available in select zones including Achrafieh.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I walk into the Achrafieh shop to buy flowers in person?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, the boutique is open for walk-in customers who want to browse fresh stock or pick up an online order in person.",
              },
            },
            {
              "@type": "Question",
              "name": "Do you deliver outside Achrafieh?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes — from our Achrafieh boutique we deliver same-day across Beirut, including Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra, and Ras Beirut, as well as further afield in Lebanon.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I schedule a flower delivery in advance?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes, you can schedule delivery up to 30 days ahead, which is useful for planning birthdays, anniversaries, or holidays.",
              },
            },
          ],
        },
      ],
    },
    ar: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "بيروت",
      title: "محل زهور في الأشرفية | بوتيك Presentail في بيروت",
      description:
        "محل زهور Presentail في الأشرفية يقع على بُعد خطوات من مستشفى أوتيل ديو في شارع عبد الوهاب الإنكليزي، مع توصيل في نفس اليوم وتوصيل سريع خلال 90 دقيقة إلى جميع أنحاء بيروت.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/ar-lb/beirut/category/flowers",
      ctaLabel: "تسوّق الزهور الآن ←",
      h1: "أفضل محل زهور في الأشرفية، بيروت",
      ogImageAlt: "محل زهور في الأشرفية بيروت — بوتيك Presentail",
      relatedSlugs: ["send-roses-to-lebanon", "inside-spring-sourcing-trip", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "إذا كنت تبحث عن محل زهور في الأشرفية، فإن بوتيك Presentail في شارع عبد الوهاب الإنكليزي — على بُعد خطوات من مستشفى أوتيل ديو — هو الوجهة التي يقصدها أهل بيروت لاقتناء الزهور الطازجة شخصياً أو طلبها أونلاين مع توصيل في نفس اليوم إلى أي مكان في المدينة.\n\nالأشرفية دائماً كانت من أكثر أحياء بيروت المحبّة للزهور، من محلات الهدايا حول ساحة سعسين إلى البوتيكات المصطفّة على مونو والشوارع المحيطة بدرج سان نيكولاس. Presentail جزء من هذا التقليد، يخدم الحي بباقات طازجة ومنسّقة باحترافية للأعياد والذكرى السنوية والأفراح والتعازي ولحظات \"ببساطة لأنك تستحق\".",
        },
        {
          heading: "بوتيك الزهور في الأشرفية",
          body: "يقع محلّنا المادي في شارع عبد الوهاب الإنكليزي، الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو — محطة سهلة سواء قادماً من سعسين أو صيدكو أو مار مترا. ادخل لتتصفّح مخزوننا الطازج شخصياً، أو احصل على مساعدة في تصميم باقة على الفور، أو التقط طلبك الأونلاين.\n\nمفتوح يومياً من 7 صباحاً حتى 1 ليلاً — مبكّر بما يكفي لاستلام صباحي، ومتأخّر بما يكفي لتوصيل ليلي في اللحظة الأخيرة. اتصل مسبقاً على 03 136 532 للتحقق من المخزون أو تقديم طلب هاتفي.",
        },
        {
          heading: "لماذا يختار سكان الأشرفية Presentail",
          items: [
            "توصيل في نفس اليوم للطلبات المقدَّمة قبل الظهر",
            "توصيل سريع خلال 90 دقيقة في مناطق محددة من بيروت، بما فيها الأشرفية",
            "توصيل مجدوَل حتى 30 يوماً مسبقاً — مثالي للتخطيط المبكر للأعياد والذكريات السنوية",
            "تشكيلة واسعة تتجاوز الزهور: نباتات وكعكات وشوكولاتة وبالونات وشموع وهدايا متكاملة",
            "بطاقة شخصية مجانية مع كل طلب، لتصل الرسالة كما أردتَ تماماً",
            "سنوات من الخبرة في مساعدة اللبنانيين المغتربين على إرسال الزهور إلى الوطن، إلى جانب الزبائن من الحي",
          ],
        },
        {
          heading: "زهور لكل مناسبة في الأشرفية",
          body: "مهما كانت المناسبة، لدى محل زهورنا في الأشرفية تنسيق يناسبها:",
          items: [
            "أعياد الميلاد والذكريات السنوية — باقات مربوطة يدوياً وصناديق ورود",
            "عيد الأم، عيد الأب، عيد الحبّ، الكريسماس — كولكشنات موسمية، تتجدد على مدار السنة",
            "الأعراس والخطوبات — تنسيقات كبيرة وقطع وسط الطاولات، تُصنع بالطلب",
            "التعازي — تنسيقات راقية ومحترمة تُوصَّل بكل اهتمام",
            "الهدايا المؤسسية — زهور وهدايا متكاملة للعملاء والشركاء أو الفرق في الأشرفية وحولها",
          ],
        },
        {
          heading: "توصيل زهور في نفس اليوم في الأشرفية وما بعدها",
          body: "اطلب من بوتيكنا في الأشرفية وسنوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الأشرفية والجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت. تحتاج أسرع؟ التوصيل السريع يوصل الزهور إلى مستلمك في أقل من 90 دقيقة في مناطق محددة — مثالي للتوصيل العاجل في الأشرفية.",
        },
        {
          heading: "زورونا أو اطلب أونلاين",
          body: "تفضّل بزيارة البوتيك في شارع عبد الوهاب الإنكليزي لاختيار باقتك شخصياً، أو اتصل بنا على 03 136 532 للطلب هاتفياً، أو تصفّح واطلب أونلاين مع توصيل في نفس اليوم إلى أي مكان في بيروت.",
        },
        {
          heading: "أسئلة شائعة",
          faqItems: [
            {
              q: "أين يقع محل زهور Presentail في الأشرفية؟",
              a: "يقع بوتيكنا في شارع عبد الوهاب الإنكليزي في الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو.",
            },
            {
              q: "هل تقدّمون توصيل زهور في نفس اليوم في الأشرفية؟",
              a: "نعم. الطلبات المقدَّمة قبل الظهر تُوصَّل في نفس اليوم، والتوصيل السريع خلال 90 دقيقة متاح في مناطق محددة بما فيها الأشرفية.",
            },
            {
              q: "هل يمكنني الدخول إلى محل الأشرفية لشراء الزهور شخصياً؟",
              a: "نعم، البوتيك مفتوح للزبائن الذين يرغبون في تصفّح المخزون الطازج أو استلام طلبهم الأونلاين شخصياً.",
            },
            {
              q: "هل تقومون بالتوصيل خارج الأشرفية؟",
              a: "نعم — من بوتيكنا في الأشرفية نوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت، وأيضاً إلى مناطق أبعد في لبنان.",
            },
            {
              q: "هل يمكنني جدولة توصيل الزهور مسبقاً؟",
              a: "نعم، يمكنك جدولة التوصيل حتى 30 يوماً مسبقاً، وهو أمر مفيد للتخطيط للأعياد والذكريات السنوية والمناسبات.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "شارع عبد الوهاب الإنكليزي",
            "addressLocality": "الأشرفية",
            "addressRegion": "بيروت",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "أين يقع محل زهور Presentail في الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "يقع بوتيكنا في شارع عبد الوهاب الإنكليزي في الأشرفية، بيروت، بالقرب من مستشفى أوتيل ديو.",
              },
            },
            {
              "@type": "Question",
              "name": "هل تقدّمون توصيل زهور في نفس اليوم في الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم. الطلبات المقدَّمة قبل الظهر تُوصَّل في نفس اليوم، والتوصيل السريع خلال 90 دقيقة متاح في مناطق محددة بما فيها الأشرفية.",
              },
            },
            {
              "@type": "Question",
              "name": "هل يمكنني الدخول إلى محل الأشرفية لشراء الزهور شخصياً؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم، البوتيك مفتوح للزبائن الذين يرغبون في تصفّح المخزون الطازج أو استلام طلبهم الأونلاين شخصياً.",
              },
            },
            {
              "@type": "Question",
              "name": "هل تقومون بالتوصيل خارج الأشرفية؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "من بوتيكنا في الأشرفية نوصّل في نفس اليوم إلى جميع أنحاء بيروت، بما فيها الجميزة ومار مخايل وبدارو وفردان وحمرا ورأس بيروت، وأيضاً إلى مناطق أبعد في لبنان.",
              },
            },
            {
              "@type": "Question",
              "name": "هل يمكنني جدولة توصيل الزهور مسبقاً؟",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "نعم، يمكنك جدولة التوصيل حتى 30 يوماً مسبقاً، وهو أمر مفيد للتخطيط للأعياد والذكريات السنوية والمناسبات.",
              },
            },
          ],
        },
      ],
    },
    fr: {
      slug: "flower-shop-in-achrafieh",
      eyebrow: "Beyrouth",
      title: "Fleuriste à Achrafieh | Boutique Presentail à Beyrouth",
      description:
        "La boutique de fleurs Presentail à Achrafieh se trouve à deux pas de l'Hôtel-Dieu de France, rue Abdel Wahab El Inglizi, avec livraison le jour même et livraison express en 90 minutes dans tout Beyrouth.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/flower-shop-in-achrafieh.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/fr-lb/beirut/category/flowers",
      ctaLabel: "Commander des fleurs →",
      h1: "Le meilleur fleuriste à Achrafieh, Beyrouth",
      ogImageAlt: "fleuriste à Achrafieh Beyrouth — boutique Presentail",
      relatedSlugs: ["send-roses-to-lebanon", "inside-spring-sourcing-trip", "gift-shop-in-lebanon"],
      sections: [
        {
          body: "Vous cherchez un fleuriste à Achrafieh ? La boutique Presentail, rue Abdel Wahab El Inglizi — à deux pas de l'Hôtel-Dieu de France — est l'endroit où Beyrouth vient acheter des fleurs fraîches en personne ou les commander en ligne pour une livraison le jour même partout dans la ville.\n\nAchrafieh a toujours été l'un des quartiers de Beyrouth les plus attachés aux fleurs, des boutiques de cadeaux autour de la place Sassine aux boutiques le long de Monot et des rues proches de l'escalier Saint-Nicolas. Presentail fait partie de cette tradition, servant le quartier avec des bouquets frais et arrangés professionnellement pour les anniversaires, les mariages, les condoléances et les occasions du quotidien.",
        },
        {
          heading: "Notre boutique de fleurs à Achrafieh",
          body: "Notre boutique est située rue Abdel Wahab El Inglizi, Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France — un arrêt pratique que vous veniez de Sassine, Sodeco ou Mar Mitr. Entrez pour parcourir notre stock frais en personne, obtenir de l'aide pour composer un bouquet sur place, ou récupérer une commande en ligne.\n\nOuverte tous les jours de 7h à 1h du matin — assez tôt pour un retrait matinal, assez tard pour une livraison de dernière minute en soirée. Appelez au préalable le 03 136 532 pour vérifier les disponibilités ou passer une commande par téléphone.",
        },
        {
          heading: "Pourquoi les habitants d'Achrafieh choisissent Presentail",
          items: [
            "Livraison le jour même pour les commandes passées avant midi",
            "Livraison express en 90 minutes dans certaines zones de Beyrouth, dont Achrafieh",
            "Livraison programmée jusqu'à 30 jours à l'avance — idéale pour planifier anniversaires et fêtes",
            "Un large choix au-delà des fleurs : plantes, gâteaux, chocolats, ballons, bougies et coffrets cadeaux",
            "Une carte personnalisée offerte avec chaque commande, pour que le message arrive exactement comme vous le souhaitez",
            "Des années d'expérience à aider les Libanais expatriés à envoyer des fleurs au pays, aux côtés des clients du quartier",
          ],
        },
        {
          heading: "Des fleurs pour chaque occasion à Achrafieh",
          body: "Quelle que soit la raison, notre fleuriste à Achrafieh a une composition pour chaque occasion :",
          items: [
            "Anniversaires — bouquets noués à la main et boîtes à fleurs",
            "Fête des mères, fête des pères, Saint-Valentin, Noël — collections saisonnières, renouvelées tout au long de l'année",
            "Mariages et fiançailles — grandes compositions et centres de table, faits sur commande",
            "Condoléances — compositions sobres et respectueuses, livrées avec soin",
            "Cadeaux d'entreprise — fleurs et coffrets pour clients, partenaires ou équipes à Achrafieh et alentours",
          ],
        },
        {
          heading: "Livraison de fleurs le jour même à Achrafieh et au-delà",
          body: "Commandez depuis notre boutique d'Achrafieh et nous livrons le jour même dans tout Beyrouth, dont Achrafieh, Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth. Besoin d'aller plus vite ? La livraison express achemine vos fleurs chez le destinataire en moins de 90 minutes dans certaines zones — idéale pour les livraisons urgentes à Achrafieh.",
        },
        {
          heading: "Rendez-nous visite ou commandez en ligne",
          body: "Passez à la boutique rue Abdel Wahab El Inglizi pour choisir votre bouquet en personne, appelez le 03 136 532 pour commander par téléphone, ou parcourez notre catalogue en ligne pour une livraison le jour même partout à Beyrouth.",
        },
        {
          heading: "Questions fréquentes",
          faqItems: [
            {
              q: "Où se trouve la boutique de fleurs Presentail à Achrafieh ?",
              a: "Notre boutique est rue Abdel Wahab El Inglizi à Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France.",
            },
            {
              q: "Proposez-vous la livraison de fleurs le jour même à Achrafieh ?",
              a: "Oui. Les commandes passées avant midi sont livrées le jour même, et la livraison express en 90 minutes est disponible dans certaines zones dont Achrafieh.",
            },
            {
              q: "Puis-je entrer dans la boutique d'Achrafieh pour acheter des fleurs en personne ?",
              a: "Oui, la boutique est ouverte aux clients qui souhaitent parcourir le stock frais ou récupérer une commande en ligne en personne.",
            },
            {
              q: "Livrez-vous en dehors d'Achrafieh ?",
              a: "Oui — depuis notre boutique d'Achrafieh, nous livrons le jour même dans tout Beyrouth, dont Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth, ainsi que plus loin au Liban.",
            },
            {
              q: "Puis-je programmer une livraison de fleurs à l'avance ?",
              a: "Oui, vous pouvez programmer une livraison jusqu'à 30 jours à l'avance, ce qui est pratique pour planifier des anniversaires, des fêtes ou des événements.",
            },
          ],
        },
      ],
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Presentail",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Rue Abdel Wahab El Inglizi",
            "addressLocality": "Achrafieh",
            "addressRegion": "Beyrouth",
            "addressCountry": "LB",
            "postalCode": "1100",
          },
          "telephone": "+9613136532",
          "openingHoursSpecification": [
            {
              "@type": "OpeningHoursSpecification",
              "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
              "opens": "07:00",
              "closes": "01:00",
            },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Où se trouve la boutique de fleurs Presentail à Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Notre boutique est rue Abdel Wahab El Inglizi à Achrafieh, Beyrouth, près de l'hôpital Hôtel-Dieu de France.",
              },
            },
            {
              "@type": "Question",
              "name": "Proposez-vous la livraison de fleurs le jour même à Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui. Les commandes passées avant midi sont livrées le jour même, et la livraison express en 90 minutes est disponible dans certaines zones dont Achrafieh.",
              },
            },
            {
              "@type": "Question",
              "name": "Puis-je entrer dans la boutique d'Achrafieh pour acheter des fleurs en personne ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui, la boutique est ouverte aux clients qui souhaitent parcourir le stock frais ou récupérer une commande en ligne en personne.",
              },
            },
            {
              "@type": "Question",
              "name": "Livrez-vous en dehors d'Achrafieh ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Depuis notre boutique d'Achrafieh, nous livrons le jour même dans tout Beyrouth, dont Gemmayzeh, Mar Mikhael, Badaro, Verdun, Hamra et Ras Beyrouth, ainsi que plus loin au Liban.",
              },
            },
            {
              "@type": "Question",
              "name": "Puis-je programmer une livraison de fleurs à l'avance ?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Oui, vous pouvez programmer une livraison jusqu'à 30 jours à l'avance, ce qui est pratique pour planifier des anniversaires, des fêtes ou des événements.",
              },
            },
          ],
        },
      ],
    },
  },

  "send-roses-to-lebanon": {
    en: {
      slug: "send-roses-to-lebanon",
      eyebrow: "Lebanon",
      title: "How to Send Roses to Lebanon | Same-Day, Nationwide Delivery",
      h1: "How to Send Roses to Lebanon",
      description:
        "Sending roses to Lebanon? Presentail delivers fresh red, pastel, and preserved roses same-day to any city or district in Lebanon, with free delivery over $75.",
      dek: "Same-day delivery, nationwide availability, and how to choose an arrangement they'll love.",
      geographyLabel: "Lebanon",
      categoryLabel: "Gifting Guide",
      datePublished: "2026-08-09",
      dateModified: "2026-08-14",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt:
        "Florist arranging a lush box of red and pink roses on a workbench",
      heroFocal: "50% 40%",
      cta: { label: "Shop roses in Lebanon", path: "/category/flowers", country: "lb" },
      recommendation: {
        title: "Browse our rose arrangements",
        body: "Find the perfect arrangement for any occasion.",
        label: "View rose arrangements",
        path: "/category/flowers",
        country: "lb",
      },
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What's the best way to send roses to Lebanon from abroad?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Order online through Presentail — choose the arrangement, add a personalized card message, and Presentail's local fleet handles delivery in Lebanon, so you don't need a local contact to receive or forward the order.",
              },
            },
            {
              "@type": "Question",
              name: "Do you deliver roses same-day anywhere in Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Orders placed before 10 PM are delivered the same day nationwide, with 90-minute express delivery available in select Beirut zones.",
              },
            },
            {
              "@type": "Question",
              name: "Can I customize the rose box color?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes — the Colossal Rose Box and other boxed arrangements let you match the box color to the roses inside.",
              },
            },
            {
              "@type": "Question",
              name: "Do preserved roses really last forever?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Eternal roses are real roses treated through a preservation process, so with basic care (avoiding direct light and humidity) they hold their appearance indefinitely, unlike fresh-cut roses.",
              },
            },
            {
              "@type": "Question",
              name: "Is delivery free?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Delivery is free on orders above $75; smaller orders carry a standard delivery fee shown at checkout.",
              },
            },
          ],
        },
      ],
      relatedSlugs: [
        "what-to-send-when-there-are-no-words",
        "balloon-delivery-beirut-lebanon",
        "mothers-day-gifts-lebanon",
        "send-gifts-to-lebanon-from-gulf",
      ],
      sections: [
        {
          body: "Roses remain the most requested flower for roses Lebanon deliveries, and for good reason — they say more in one bouquet than almost any other gift. Whether you're a Lebanese expat sending roses home for the first time or ordering locally for tonight, here's what to know before you order.",
        },
        {
          heading: "Our Rose Collection",
          items: [
            "Classic red roses — the traditional choice for romance and anniversaries, sold as bouquets or boxed arrangements",
            "Pastel and mixed roses — softer tones for birthdays, congratulations, or \"thinking of you\" moments",
            "Colossal Rose Box — a statement-sized arrangement of 170–180 roses, with the box color customizable to match",
            "Eternal (preserved) roses — real roses treated to last indefinitely, a popular pick for milestones like anniversaries or \"forever\" messages",
          ],
        },
        {
          heading: "Why Send Roses Through Presentail",
          items: [
            "Nationwide coverage — Presentail runs its own fleet of drivers and delivers to every city and district in Lebanon, not just Beirut",
            "Same-day delivery on orders placed before 10 PM, plus express 90-minute delivery in select Beirut zones",
            "Free delivery on orders above $75",
            "Satisfaction guarantee — if an order arrives damaged or doesn't arrive, Presentail refunds or replaces it",
            "Built specifically for the expat use case: order from abroad in a few clicks, and the recipient in Lebanon gets fresh, freshly arranged roses at their door",
          ],
        },
        {
          heading: "Roses for Every Occasion",
          items: [
            "Red roses — romantic love, anniversaries, Valentine's Day",
            "White roses — purity, sympathy, and condolence arrangements",
            "Pink roses — admiration, gratitude, and friendship",
            "Pastel and mixed roses — birthdays, get-well wishes, and everyday \"just because\" gestures",
            "Preserved/eternal roses — weddings, milestone anniversaries, or any moment meant to last",
          ],
        },
        {
          heading: "How to Keep Your Roses Fresh Longer",
          body: "A few simple habits stretch a fresh rose arrangement out to about a week:",
          items: [
            "Change the vase water completely every 2–3 days",
            "Trim about half an inch off each stem whenever you change the water",
            "Keep roses away from direct sunlight and heat",
            "Don't place roses near ripening fruit, especially bananas and apples — the ethylene gas speeds up wilting",
          ],
        },
        {
          body: "With this care, a fresh rose bouquet from Presentail typically lasts up to 7 days.",
        },
        {
          heading: "Delivering Roses Across Lebanon",
          body: "Because Presentail delivers with its own fleet rather than relying on regional florist partners, roses ordered for Beirut, Mount Lebanon, the South, the North, or the Bekaa all go through the same same-day process. Order before 10 PM for same-day delivery anywhere in the country, or use express delivery for a 90-minute window in select Beirut zones.",
          callout: {
            variant: "service",
            title: "Same-day delivery",
            body: "Place your order by 10:00 PM for same-day delivery across Lebanon.",
          },
          pullQuote:
            "From Beirut to the Bekaa and the South, our local florists handcraft each arrangement with the freshest blooms.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What's the best way to send roses to Lebanon from abroad?",
              a: "Order online through Presentail — choose the arrangement, add a personalized card message, and Presentail's local fleet handles delivery in Lebanon, so you don't need a local contact to receive or forward the order.",
            },
            {
              q: "Do you deliver roses same-day anywhere in Lebanon?",
              a: "Yes. Orders placed before 10 PM are delivered the same day nationwide, with 90-minute express delivery available in select Beirut zones.",
            },
            {
              q: "Can I customize the rose box color?",
              a: "Yes — the Colossal Rose Box and other boxed arrangements let you match the box color to the roses inside.",
            },
            {
              q: "Do preserved roses really last forever?",
              a: "Eternal roses are real roses treated through a preservation process, so with basic care (avoiding direct light and humidity) they hold their appearance indefinitely, unlike fresh-cut roses.",
            },
            {
              q: "Is delivery free?",
              a: "Delivery is free on orders above $75; smaller orders carry a standard delivery fee shown at checkout.",
            },
          ],
        },
      ],
    },
    ar: {
      slug: "send-roses-to-lebanon",
      eyebrow: "لبنان",
      title: "أرسل الورود إلى لبنان | توصيل في نفس اليوم لجميع المناطق",
      h1: "أرسل الورود إلى لبنان: توصيل في نفس اليوم لجميع المناطق",
      description:
        "تريد إرسال ورود إلى لبنان؟ Presentail يوصّل ورود طازجة حمراء وبألوان باستيل ومحفوظة في نفس اليوم إلى أي مدينة أو منطقة في لبنان، مع توصيل مجاني للطلبات التي تتجاوز 75 دولاراً.",
      dek: "توصيل في نفس اليوم، وتغطية لجميع المناطق، وكيف تختار التنسيقة التي سيحبّونها.",
      geographyLabel: "لبنان",
      categoryLabel: "دليل الإهداء",
      datePublished: "2026-08-09",
      dateModified: "2026-08-14",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt: "منسّقة زهور ترتّب صندوقاً فاخراً من الورود الحمراء والوردية",
      heroFocal: "50% 40%",
      cta: { label: "تسوّق الورود في لبنان", path: "/category/flowers", country: "lb" },
      recommendation: {
        title: "تصفّح تنسيقات الورود لدينا",
        body: "اعثر على التنسيقة المثالية لأي مناسبة.",
        label: "شاهد تنسيقات الورود",
        path: "/category/flowers",
        country: "lb",
      },
      relatedSlugs: ["what-to-send-when-there-are-no-words", "balloon-delivery-beirut-lebanon", "mothers-day-gifts-lebanon"],
      sections: [
        {
          body: "تبقى الورود الزهرة الأكثر طلباً في توصيلات لبنان، وذلك لسبب وجيه — فلا شيء يعبّر أكثر في باقة واحدة تقريباً من أي هدية أخرى. سواء كنت مغترباً لبنانياً ترسل ورود إلى وطنك للمرة الأولى، أو تطلب محلياً لهذه الليلة، إليك ما يجدر معرفته قبل أن تطلب.",
        },
        {
          heading: "مجموعة الورود لدينا",
          items: [
            "الورود الحمراء الكلاسيكية — الخيار التقليدي للرومانسية وأعياد الزواج، تُباع باقاتٍ أو تشكيلاتٍ في صناديق",
            "الورود الباستيل والمتنوّعة — ألوان ناعمة لأعياد الميلاد والتهاني أو لحظات «أنا أفكّر فيك»",
            "صندوق الورود العملاق (Colossal Rose Box) — تشكيلة استثنائية تضمّ 170–180 وردة، مع إمكانية تخصيص لون الصندوق ليناسب الورود",
            "الورود الأبدية (المحفوظة) — ورود حقيقية خضعت لمعالجة تجعلها تدوم إلى الأبد، خيار شائع للمناسبات الكبرى كأعياد الزواج أو رسائل «إلى الأبد»",
          ],
        },
        {
          heading: "لماذا ترسل الورود عبر Presentail",
          items: [
            "تغطية على مستوى البلاد — تمتلك Presentail أسطولها الخاص من السائقين وتوصّل إلى كل مدينة ومنطقة في لبنان، ليس إلى بيروت فحسب",
            "توصيل في نفس اليوم للطلبات المقدَّمة قبل الساعة 10 مساءً، مع خيار التوصيل السريع خلال 90 دقيقة في مناطق محددة من بيروت",
            "توصيل مجاني للطلبات التي تتجاوز 75 دولاراً",
            "ضمان الرضا — إذا وصل الطلب تالفاً أو لم يصل، تقوم Presentail بالاسترداد أو الاستبدال",
            "مُصمَّم خصيصاً لحالة المغتربين: اطلب من الخارج بضغطات بسيطة، وسيصل المستلم في لبنان ورود طازجة ومرتّبة حديثاً إلى بابه",
          ],
        },
        {
          heading: "ورود لكل مناسبة",
          items: [
            "الورود الحمراء — الحب الرومانسي، أعياد الزواج، عيد الحبّ",
            "الورود البيضاء — النقاء، وباقات التعزية والمواساة",
            "الورود الوردية — الإعجاب، الامتنان، والصداقة",
            "الورود الباستيل والمتنوّعة — أعياد الميلاد، تمنيات الشفاء، ولفتات «بلا مناسبة» اليومية",
            "الورود المحفوظة/الأبدية — حفلات الزفاف، الذكريات السنوية الكبرى، أو أي لحظة تستحق أن تدوم",
          ],
        },
        {
          heading: "كيف تحافظ على ورودك طازجة لفترة أطول",
          body: "بضع عادات بسيطة تمدّ عمر باقة الورود الطازجة إلى قرابة أسبوع:",
          items: [
            "غيّر ماء المزهرية كاملاً كل يومين إلى ثلاثة أيام",
            "قصّ نحو سنتيمتر من كل ساق في كل مرة تغيّر فيها الماء",
            "أبعد الورود عن أشعة الشمس المباشرة والحرارة",
            "لا تضع الورود بجانب الفواكه الناضجة، خاصةً الموز والتفاح — فغاز الإيثيلين يُسرّع الذبول",
          ],
        },
        {
          body: "مع هذه العناية، تدوم باقة الورود الطازجة من Presentail عادةً حتى 7 أيام.",
        },
        {
          heading: "توصيل الورود في جميع أنحاء لبنان",
          body: "لأن Presentail تعتمد على أسطولها الخاص بدلاً من الاعتماد على شركاء محليين من محلات الزهور، فإن الورود المطلوبة لبيروت أو جبل لبنان أو الجنوب أو الشمال أو البقاع تمرّ جميعها بنفس عملية التوصيل في اليوم ذاته. اطلب قبل الساعة 10 مساءً للتوصيل في اليوم نفسه في أي مكان في البلاد، أو استخدم خدمة التوصيل السريع للحصول على نافذة 90 دقيقة في مناطق مختارة من بيروت.",
          callout: {
            variant: "service",
            title: "توصيل في نفس اليوم",
            body: "اطلب قبل الساعة 10:00 مساءً ليصل طلبك في اليوم نفسه إلى أي مكان في لبنان.",
          },
          pullQuote:
            "من بيروت إلى البقاع والجنوب، يصنع منسّقو الزهور المحليون لدينا كل تنسيقة يدوياً بأزهار طازجة.",
        },
        {
          heading: "أسئلة شائعة",
          faqItems: [
            {
              q: "ما أفضل طريقة لإرسال الورود إلى لبنان من الخارج؟",
              a: "اطلب عبر الإنترنت من خلال Presentail — اختر التشكيلة، أضف رسالة بطاقة شخصية، وسيتولّى أسطول Presentail المحلي التوصيل في لبنان، دون الحاجة إلى جهة تواصل محلية لاستلام الطلب أو تمريره.",
            },
            {
              q: "هل تُوصّلون الورود في نفس اليوم إلى أي مكان في لبنان؟",
              a: "نعم. الطلبات المقدَّمة قبل الساعة 10 مساءً تُوصَّل في اليوم ذاته في جميع أنحاء البلاد، مع خيار التوصيل السريع خلال 90 دقيقة في مناطق محددة من بيروت.",
            },
            {
              q: "هل يمكنني تخصيص لون صندوق الورود؟",
              a: "نعم — صندوق الورود العملاق (Colossal Rose Box) والتشكيلات الأخرى في صناديق تتيح لك مطابقة لون الصندوق مع الورود بداخله.",
            },
            {
              q: "هل تدوم الورود المحفوظة حقاً إلى الأبد؟",
              a: "الورود الأبدية هي ورود حقيقية خضعت لعملية حفظ، لذا مع العناية الأساسية (تجنّب الضوء المباشر والرطوبة) تحتفظ بمظهرها إلى أجل غير مسمى، على خلاف الورود الطازجة المقطوعة.",
            },
            {
              q: "هل التوصيل مجاني؟",
              a: "التوصيل مجاني للطلبات التي تتجاوز 75 دولاراً؛ الطلبات الأصغر تخضع لرسوم توصيل قياسية تظهر عند الدفع.",
            },
          ],
        },
      ],
    },
    fr: {
      slug: "send-roses-to-lebanon",
      eyebrow: "Liban",
      title: "Envoyer des roses au Liban | Livraison le jour même, dans tout le pays",
      seoTitle: "Envoyer des roses au Liban | Livraison le jour même",
      h1: "Envoyer des roses au Liban : livraison le jour même, partout au Liban",
      description:
        "Vous souhaitez envoyer des roses au Liban ? Presentail livre des roses fraîches rouges, pastel et éternelles le jour même dans toutes les villes et régions du Liban, avec livraison gratuite dès 75 $.",
      dek: "Livraison le jour même, disponibilité dans tout le pays, et comment choisir une composition qui leur plaira.",
      geographyLabel: "Liban",
      categoryLabel: "Guide cadeaux",
      datePublished: "2026-08-09",
      dateModified: "2026-08-14",
      ogImage: { url: "/blog/send-roses-to-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt:
        "Fleuriste composant une boîte luxuriante de roses rouges et roses",
      heroFocal: "50% 40%",
      cta: { label: "Acheter des roses au Liban", path: "/category/flowers", country: "lb" },
      recommendation: {
        title: "Parcourez nos compositions de roses",
        body: "Trouvez la composition parfaite pour chaque occasion.",
        label: "Voir les compositions de roses",
        path: "/category/flowers",
        country: "lb",
      },
      relatedSlugs: ["what-to-send-when-there-are-no-words", "balloon-delivery-beirut-lebanon", "mothers-day-gifts-lebanon"],
      sections: [
        {
          body: "Les roses restent la fleur la plus demandée pour les livraisons au Liban, et pour une bonne raison — elles en disent plus en un seul bouquet que presque n'importe quel autre cadeau. Que vous soyez un expatrié libanais qui envoie des roses chez lui pour la première fois, ou que vous commandiez localement pour ce soir, voici ce qu'il faut savoir avant de passer commande.",
        },
        {
          heading: "Notre collection de roses",
          items: [
            "Roses rouges classiques — le choix traditionnel pour la romance et les anniversaires, vendues en bouquets ou en compositions en boîte",
            "Roses pastel et mixtes — des teintes douces pour les anniversaires, les félicitations ou les gestes « je pense à toi »",
            "Colossal Rose Box — une composition spectaculaire de 170 à 180 roses, avec la couleur de la boîte personnalisable à volonté",
            "Roses éternelles (préservées) — de vraies roses traitées pour durer indéfiniment, un choix prisé pour les grandes étapes comme les anniversaires de mariage ou les messages « pour toujours »",
          ],
        },
        {
          heading: "Pourquoi envoyer des roses via Presentail",
          items: [
            "Couverture nationale — Presentail dispose de sa propre flotte de livreurs et livre dans toutes les villes et régions du Liban, pas seulement à Beyrouth",
            "Livraison le jour même pour les commandes passées avant 22 h, plus une livraison express en 90 minutes dans certaines zones de Beyrouth",
            "Livraison gratuite pour les commandes supérieures à 75 $",
            "Garantie de satisfaction — si une commande arrive endommagée ou n'arrive pas, Presentail rembourse ou remplace",
            "Conçu spécifiquement pour le cas des expatriés : commandez depuis l'étranger en quelques clics, et le destinataire au Liban reçoit des roses fraîches et fraîchement arrangées à sa porte",
          ],
        },
        {
          heading: "Des roses pour chaque occasion",
          items: [
            "Roses rouges — amour romantique, anniversaires, Saint-Valentin",
            "Roses blanches — pureté, sympathie et compositions de condoléances",
            "Roses roses — admiration, gratitude et amitié",
            "Roses pastel et mixtes — anniversaires, souhaits de prompt rétablissement et gestes du quotidien « juste parce que »",
            "Roses préservées/éternelles — mariages, grands anniversaires ou tout moment destiné à durer",
          ],
        },
        {
          heading: "Comment garder vos roses fraîches plus longtemps",
          body: "Quelques habitudes simples permettent de prolonger la durée de vie d'un bouquet de roses fraîches d'environ une semaine :",
          items: [
            "Changez complètement l'eau du vase tous les 2 à 3 jours",
            "Coupez environ un centimètre sur chaque tige à chaque changement d'eau",
            "Éloignez les roses de la lumière directe du soleil et de la chaleur",
            "Ne placez pas les roses près de fruits qui mûrissent, surtout des bananes et des pommes — le gaz éthylène accélère le flétrissement",
          ],
        },
        {
          body: "Avec ces soins, un bouquet de roses fraîches de Presentail dure généralement jusqu'à 7 jours.",
        },
        {
          heading: "Livraison de roses dans tout le Liban",
          body: "Parce que Presentail livre avec sa propre flotte plutôt que de s'appuyer sur des partenaires fleuristes régionaux, les roses commandées pour Beyrouth, le Mont-Liban, le Sud, le Nord ou la Bekaa passent toutes par le même processus de livraison le jour même. Commandez avant 22 h pour une livraison le jour même partout dans le pays, ou optez pour la livraison express pour une fenêtre de 90 minutes dans certaines zones de Beyrouth.",
          callout: {
            variant: "service",
            title: "Livraison le jour même",
            body: "Commandez avant 22 h 00 pour une livraison le jour même partout au Liban.",
          },
          pullQuote:
            "De Beyrouth à la Bekaa et au Sud, nos fleuristes locaux composent chaque arrangement à la main avec les fleurs les plus fraîches.",
        },
        {
          heading: "Questions fréquentes",
          faqItems: [
            {
              q: "Quel est le meilleur moyen d'envoyer des roses au Liban depuis l'étranger ?",
              a: "Commandez en ligne via Presentail — choisissez la composition, ajoutez un message de carte personnalisé, et la flotte locale de Presentail se charge de la livraison au Liban, sans que vous ayez besoin d'un contact local pour réceptionner ou transmettre la commande.",
            },
            {
              q: "Livrez-vous des roses le jour même partout au Liban ?",
              a: "Oui. Les commandes passées avant 22 h sont livrées le jour même dans tout le pays, avec une livraison express en 90 minutes disponible dans certaines zones de Beyrouth.",
            },
            {
              q: "Puis-je personnaliser la couleur de la boîte à roses ?",
              a: "Oui — la Colossal Rose Box et les autres compositions en boîte vous permettent d'assortir la couleur de la boîte aux roses qu'elle contient.",
            },
            {
              q: "Les roses éternelles durent-elles vraiment indéfiniment ?",
              a: "Les roses éternelles sont de vraies roses qui ont subi un processus de conservation ; avec des soins de base (éviter la lumière directe et l'humidité), elles conservent leur apparence indéfiniment, contrairement aux roses fraîches coupées.",
            },
            {
              q: "La livraison est-elle gratuite ?",
              a: "La livraison est gratuite pour les commandes supérieures à 75 $ ; les commandes moins importantes sont soumises à des frais de livraison standard affichés lors du paiement.",
            },
          ],
        },
      ],
    },
  },

  "balloon-delivery-beirut-lebanon": {
    en: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      relatedSlugs: ["baby-boy-balloons", "balloon-arrangement-ideas", "valentines-day-gifts-lebanon"],
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
    ar: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      relatedSlugs: ["baby-boy-balloons", "balloon-arrangement-ideas", "valentines-day-gifts-lebanon"],
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
    fr: {
      slug: "balloon-delivery-beirut-lebanon",
      eyebrow: "Delivery guide",
      title: "Balloon delivery in Beirut, Lebanon",
      description:
        "Everything you need to know about same-day balloon delivery in Beirut — from helium and foil balloons to bouquets for birthdays, graduations, new arrivals and get-well celebrations.",
      datePublished: "2026-08-09",
      ogImage: { url: "/blog/balloon-delivery-beirut-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Shop balloon delivery in Beirut",
      relatedSlugs: ["baby-boy-balloons", "balloon-arrangement-ideas", "valentines-day-gifts-lebanon"],
      sections: [
        {
          body: "Balloons carry a particular kind of energy that flowers and chocolates alone cannot replicate — they are colour, motion, and celebration all at once. Whether you are sending a single oversized foil star or a full balloon bouquet, Presentail delivers balloons across Beirut and throughout Lebanon, usually the same day you order.",
        },
        {
          heading: "Same-day balloon delivery in Beirut",
          body: "Order before midday and your balloons can arrive the same afternoon — in Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, and every other neighbourhood in Beirut. Our delivery partners handle balloons with care so they arrive inflated and intact, ready to make the moment. Orders placed after midday are confirmed for the next available delivery window.",
        },
        {
          heading: "What kinds of balloons can you send?",
          body: "Presentail's balloon range includes helium balloons that float freely, foil and mylar balloons in shapes and characters that hold their inflation longer, and curated balloon bouquets designed to arrive as a complete, tied arrangement. We also carry number and letter balloons for milestone birthdays, anniversaries, and graduation celebrations. Every type is available for same-day delivery across Beirut.",
        },
        {
          heading: "Occasions that call for balloons",
          body: "Balloons are among the most versatile gifts we carry. A birthday without them feels like a missed beat. They brighten a hospital room for a get-well visit, mark a new baby's arrival with a soft palette of pinks or blues, and signal a graduation across a crowded garden. They also work quietly: a single foil balloon on a colleague's desk says 'happy birthday' without a speech. Whatever the moment, we can usually get them there by the afternoon.",
        },
        {
          heading: "Sending balloons anywhere in Lebanon",
          body: "Beirut is our primary hub, but Presentail delivers balloons everywhere in Lebanon — Tripoli, Saida, Zahle, Jbeil, and the dozens of cities and towns in between. If you are overseas and want to send balloons to someone in Lebanon for a birthday or celebration, the process is the same: choose your products, enter the recipient's address, and we handle the rest. International cards and wallets are accepted at checkout.",
        },
        {
          heading: "Pairing balloons with other gifts",
          body: "Balloons pair naturally with almost everything in our catalogue. A birthday balloon bouquet alongside a fresh flower arrangement is a statement. Add a box of chocolates and you have a full gift without needing to visit a shop. For a new baby, a pastel balloon and a plant is a combination that survives the first chaotic week without wilting. We let you add products from different categories to a single order at checkout, with one delivery.",
        },
      ],
    },
  },

  "baby-boy-balloons": {
    en: {
      slug: "baby-boy-balloons",
      eyebrow: "Baby & Newborn",
      // title includes "| Presentail" explicitly because h1 is also set —
      // BlogPost.tsx and buildBlogPostHead() both skip appending the suffix
      // when h1 is present (h1 = visible heading, title = full meta title).
      title: "Baby Boy Balloons: Adorable Ideas to Celebrate His Arrival | Presentail",
      seoTitle: "Baby Boy Balloons | Ideas & Same-Day Delivery | Presentail",
      h1: "Baby Boy Balloons: Adorable Ideas to Celebrate His Arrival",
      description:
        "Looking for baby boy balloons? Discover ten ideas — blue helium bouquets, foil stars, letter balloons, and more — plus safety tips and same-day delivery across Lebanon.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/en-lb/beirut/category/balloons",
      ctaLabel: "Explore Balloons & Gifts",
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "What balloons are best for a baby boy celebration?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
              },
            },
            {
              "@type": "Question",
              name: "Are helium balloons safe around a newborn?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
              },
            },
            {
              "@type": "Question",
              name: "Can I combine baby boy balloons with flowers or a gift basket?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
              },
            },
            {
              "@type": "Question",
              name: "Do you deliver baby boy balloons the same day in Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
              },
            },
            {
              "@type": "Question",
              name: "Can I send baby boy balloons from abroad to Lebanon?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
              },
            },
          ],
        },
      ],
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "teddy-bear-gifts-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/en-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/en-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/en-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/en-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/en-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
    ar: {
      slug: "baby-boy-balloons",
      eyebrow: "أطفال ومواليد",
      // Arabic metadata stub — body sections use English copy pending full translation (separate task).
      title: "بالونات مولود صبي: أفكار جميلة للاحتفال بقدومه | Presentail",
      h1: "بالونات مولود صبي: أفكار جميلة للاحتفال بقدومه",
      description:
        "هل تبحث عن بالونات مولود صبي؟ اكتشف عشر أفكار — باقات هيليوم زرقاء وبالونات فويل ونجوم ومزيداً — مع نصائح السلامة والتوصيل في نفس اليوم في لبنان.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/ar-lb/beirut/category/balloons",
      ctaLabel: "استعرض البالونات والهدايا",
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "teddy-bear-gifts-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/ar-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/ar-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/ar-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/ar-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/ar-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
    fr: {
      slug: "baby-boy-balloons",
      eyebrow: "Bébé & Nouveau-né",
      // French metadata stub — body sections use English copy pending full translation (separate task).
      title: "Ballons Garçon : Idées pour Célébrer Son Arrivée | Presentail",
      h1: "Ballons Garçon : Idées pour Célébrer Son Arrivée",
      description:
        "À la recherche de ballons pour garçon ? Découvrez dix idées — bouquets hélium bleus, étoiles aluminium, ballons lettres — avec conseils de sécurité et livraison le jour même au Liban.",
      datePublished: "2026-08-10",
      ogImage: { url: "/blog/baby-boy-balloons.webp", width: 1408, height: 768 },
      ogImageAlt: "Blue baby boy balloons arranged for a newborn celebration",
      ctaHref: "/fr-lb/beirut/category/balloons",
      ctaLabel: "Explorer les ballons et cadeaux",
      relatedSlugs: ["balloon-delivery-beirut-lebanon", "teddy-bear-gifts-lebanon", "gift-shop-in-lebanon"],
      sections: [
        {
          body: `A new baby boy deserves a celebration that feels as joyful as the moment itself. <a href="/fr-lb/beirut/category/balloons">Balloons</a> are one of the fastest ways to transform any room — whether it's a hospital ward, a living room, or a garden — into something that unmistakably says: he's here, and we're thrilled. This guide covers ten baby boy balloon ideas, how to choose the right type, what to pair them with, and when to send them.`,
        },
        {
          heading: "10 Baby Boy Balloon Ideas",
          body: "Here are ten baby boy balloon ideas ranging from simple to statement:",
          items: [
            "Classic sky-blue helium bouquet — a cluster of soft-blue and white latex balloons, the simplest and most universally recognised baby boy colour palette",
            "Foil 'It's a Boy' balloon — a large printed foil balloon announcing the news, works as a centrepiece on its own or as the anchor of a larger bouquet",
            "Silver and blue star mylar balloons — star-shaped foil balloons in silver and blue that float for 3–5 days, ideal for multi-day family visits",
            "Letter balloons spelling the baby's name — individually inflated letter balloons that double as a decoration and a personalised keepsake for the first nursery photo",
            "Number 1 balloon for the one-month milestone — a gold or silver '1' balloon marks the one-month celebration, a significant occasion in Lebanese family tradition",
            "Balloon bouquet with a newborn gift set — a curated blue bouquet paired with a newborn occasion set from the Presentail catalogue, combining décor and gift in one order",
            "White and gold balloon arch — a balloon arch in white and gold for a gender-reveal or welcome-home party, creates a full room backdrop for photos",
            "Blue and white confetti balloons — clear latex balloons filled with blue and white paper confetti, adds texture and playfulness to any bouquet",
            "Pastel rainbow bouquet — soft pastels including pale blue, mint, and peach for families who want a gentler, less colour-coded palette",
            "Balloon bouquet with hand bouquet — a blue balloon cluster alongside a white hand bouquet of garden roses or peonies, a combination that balances celebration energy with elegance",
          ],
        },
        {
          heading: "How to Choose the Right Baby Boy Balloon",
          body: "The right balloon depends on two things: how long it needs to last, and where it will be displayed. Latex helium balloons float for 12–24 hours — enough for the day of the birth or a single celebration. Foil and mylar balloons hold helium for 3–5 days, which is a better fit when relatives are arriving over several days or when you want the decoration to stay fresh through the full visiting week. If the celebration is outdoors in summer heat, foil balloons are also more stable in warm air than latex. For a hospital room where space is limited, a single large foil statement balloon is cleaner than a full bouquet. For a home living room, a full bouquet makes a stronger impression.",
        },
        {
          heading: "Balloon Safety Tips for Newborn Celebrations",
          body: "Balloons are safe in a newborn's environment when handled correctly. Keep inflated balloons tied and anchored out of the baby's direct reach at all times. Never leave infants or small children unsupervised near balloons — a burst latex balloon produces fragments that are a serious choking hazard for toddlers and older siblings who may be in the room. Dispose of any deflated or burst balloons immediately. Foil and mylar balloons burst less easily than latex under normal conditions, which makes them a lower-risk choice when the arrangement will be in a shared family space. Avoid placing balloons directly above a cot or a play mat.",
        },
        {
          heading: "Pairing Baby Boy Balloons with Flowers and Gift Baskets",
          body: `Balloons on their own make a room feel alive. Pairing them with a complementary gift creates a full welcome that the parents will remember long after the balloons have deflated. A blue balloon bouquet alongside a <a href="/fr-lb/beirut/category/hand-bouquets">hand bouquet</a> of white blooms — garden roses, ranunculi, or peonies in soft tones — is a particularly elegant combination: the balloons bring the colour and energy; the flowers bring the elegance. For something more practical, combine the balloons with a <a href="/fr-lb/beirut/category/gift-baskets">gift basket</a> stocked with newborn essentials or luxury treats for the new parents. Presentail lets you add products from multiple categories — balloons, flowers, gift baskets — to a single order with one delivery, so the entire welcome arrives at the door together. Pair with a <a href="/fr-lb/beirut/occasion/new-born">newborn occasion set</a> for a complete package.`,
        },
        {
          heading: "When to Send Baby Boy Balloons",
          body: "The timing of a balloon delivery matters more than most people expect. Sending balloons to a hospital room on the birth day is a strong gesture that signals you heard the news immediately — but the room may be busy and the parents exhausted. A delivery on the second or third day, when the initial chaos has settled and the family is beginning to enjoy the moment, is often more appreciated. If the family has a welcome-home gathering or a naming celebration planned, coordinate the delivery to arrive an hour or two before guests, so the balloons are inflated and the room is ready when people walk in. For the one-month milestone — a significant occasion across Lebanese culture — a fresh balloon delivery paired with a cake or gift basket is the standard way to mark it.",
        },
        {
          heading: "Sending Baby Boy Balloons from Abroad to Lebanon",
          body: `One of the most common reasons people contact Presentail is distance. You have heard the news about a baby boy being born to family or friends in Beirut, Tripoli, or Sidon, and you are in Paris, London, Dubai, or Lagos. Ordering <a href="/fr-lb/beirut/category/balloons">baby boy balloons</a> through Presentail from abroad works exactly the same as ordering locally: choose your products, enter the recipient's address in Lebanon, select a delivery date, and our team handles the local arrangement and delivery. International credit cards, debit cards, and digital wallets are accepted at checkout. Deliveries are confirmed by notification to the recipient before they arrive, so there are no surprises.`,
        },
        {
          heading: "Same-Day Baby Boy Balloon Delivery Across Lebanon",
          body: "Presentail delivers baby boy balloons across Beirut and throughout Lebanon, usually the same day you order. Place your order before midday for same-day afternoon delivery. Express delivery — a 90-minute window — is available in select Beirut zones for last-minute needs. Whether the new mother is at a hospital in Achrafieh, a home in Tripoli, or a family house in the Bekaa Valley, the process is the same: choose your balloons and gifts, enter the delivery address, and we handle the rest.",
        },
        {
          heading: "Frequently Asked Questions",
          faqItems: [
            {
              q: "What balloons are best for a baby boy celebration?",
              a: "Classic sky-blue and white helium balloons, foil 'It's a Boy' balloons, star-shaped mylar balloons in silver and blue, and letter balloons spelling the baby's name are all popular choices. Foil and mylar balloons last 3–5 days, making them ideal when family visits stretch across several days.",
            },
            {
              q: "Are helium balloons safe around a newborn?",
              a: "Keep balloons out of the baby's direct reach and never leave infants or small children unsupervised with inflated balloons or balloon fragments. Foil and mylar balloons are less likely to burst than latex, reducing the choking-hazard risk. Always dispose of deflated or burst balloons immediately.",
            },
            {
              q: "Can I combine baby boy balloons with flowers or a gift basket?",
              a: "Yes. Balloons pair beautifully with a fresh hand bouquet or a newborn gift basket. Presentail lets you add items from multiple categories to a single order with one delivery.",
            },
            {
              q: "Do you deliver baby boy balloons the same day in Lebanon?",
              a: "Yes. Orders placed before midday are delivered the same afternoon across Beirut and throughout Lebanon, with express 90-minute delivery available in select Beirut zones.",
            },
            {
              q: "Can I send baby boy balloons from abroad to Lebanon?",
              a: "Absolutely. Order online through Presentail from anywhere in the world, enter the recipient's address in Lebanon, and our local delivery team handles the rest. International cards and wallets are accepted at checkout.",
            },
          ],
        },
      ],
    },
  },

  "gift-shop-in-lebanon": {
    en: {
      slug: "gift-shop-in-lebanon",
      eyebrow: "Gifting Guide",
      title: "Gift Shop in Lebanon: A Complete Gifting Guide | Presentail",
      h1: "Looking for a Gift Shop in Lebanon? Here's How to Choose the Perfect Gift",
      description:
        "Looking for a gift shop in Lebanon? Find thoughtful flowers, cakes, plants and gifts, with convenient delivery options from Presentail.",
      datePublished: "2026-08-11",
      ogImageAlt: "Flowers, cake and a curated gift box from an online gift shop in Lebanon",
      ctaHref: "https://presentail.com/en-lb/beirut/shop",
      ctaLabel: "Shop all gifts",
      extraJsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "Where can I buy gifts online in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "You can buy flowers, cakes, plants and curated gifts online through Presentail. Browse the full collection, enter the recipient's Lebanese address, add a personal card message and select an available delivery date at checkout.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I send a gift to Lebanon while living abroad?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. You can place an order online from abroad for delivery to someone in Lebanon. Use the recipient's full name, accurate Lebanese address and active local phone number, then pay with an available online payment method.",
              },
            },
            {
              "@type": "Question",
              "name": "Does Presentail offer same-day gift delivery in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Presentail offers same-day delivery in Beirut for eligible orders placed before midday. Availability depends on the product, delivery area, date and capacity, so confirm the final option and time window at checkout.",
              },
            },
            {
              "@type": "Question",
              "name": "Can I add a personalised card to my gift?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Presentail lets you add a personalised message to the order. Include your name if the recipient may not immediately know who sent the gift.",
              },
            },
            {
              "@type": "Question",
              "name": "What are popular gifts for delivery in Lebanon?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Flowers, flower boxes, cakes, chocolates, plants and curated gift sets are versatile choices. The right option depends on the recipient, the occasion and whether you want the gift to be enjoyed immediately, shared with others or kept over time.",
              },
            },
            {
              "@type": "Question",
              "name": "How early should I order a gift?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "For a fixed event or important occasion, ordering ahead gives you more product and delivery-window choices. If you need same-day delivery in Beirut, order as early as possible and before the published midday cut-off for eligible orders.",
              },
            },
          ],
        },
      ],
      relatedSlugs: [
        "chocolatiers-behind-our-gift-boxes",
        "what-to-send-when-there-are-no-words",
        "baby-boy-balloons",
        "corporate-gifting-lebanon",
        "gift-baskets-dubai",
      ],
      sections: [
        {
          body: "Finding the right gift shop in Lebanon should make an important moment easier, not turn it into a long search across dozens of stores. Whether you are celebrating a birthday in Beirut, welcoming a new baby in Jbeil, sending an anniversary surprise to Tripoli, or simply reminding someone in Lebanon that you are thinking of them, the best gift is one that feels personal and arrives when it matters.\n\nThat is why many shoppers now prefer an online gift shop that brings flowers, cakes, chocolates, plants, balloons and curated presents together in one place. Instead of coordinating several suppliers, you can choose a complete gift, add a personal message and arrange delivery from the same checkout.\n\nAt Presentail, you can browse thoughtful gifts for life's biggest celebrations and its smaller, spontaneous moments. Start with the <a href=\"/en-lb/beirut/shop\">full collection of flowers and gifts</a>, then narrow your choice by recipient, occasion and the kind of feeling you want to send.",
        },
        {
          heading: "What should you look for in a gift shop in Lebanon?",
          body: "A gift can be beautiful and still create a disappointing experience if it is difficult to order, poorly presented or delivered at the wrong time. Before choosing a shop, look beyond the product photo and consider the complete journey from selection to delivery.",
        },
        {
          heading: "A varied but curated collection",
          body: "A strong gift shop gives you enough choice without making the experience overwhelming. Look for categories that suit different personalities and occasions: fresh flowers for an expressive gesture, cake for a celebration, a plant for a longer-lasting present, or a curated set when you want the unboxing to feel especially generous.\n\nThe advantage of shopping across categories is flexibility. You may arrive looking for flowers and realise that a cake would suit the recipient better. Or you may decide to pair a bouquet with chocolates, balloons or a candle to make the moment feel complete.",
        },
        {
          heading: "Clear delivery information",
          body: "Timing is part of the gift. A reliable online store should explain which dates and time windows are available before you finalise the order. If you need an urgent gift, check the same-day cut-off and confirm availability for the recipient's address at checkout. If the date is important, scheduling in advance is usually the calmer option.\n\nPresentail currently offers same-day delivery in Beirut for eligible orders placed before midday, with faster delivery available in select zones. You can also schedule a delivery ahead of time and select from the available windows shown at checkout. Availability can vary by product, date and location, so the checkout should always be treated as the final confirmation.",
        },
        {
          heading: "Personal touches",
          body: "The message often matters as much as the item. A personalised card turns a lovely product into a gift that belongs to a particular relationship and moment. Extras such as chocolates, balloons or scented candles can also help you shape the tone—playful, romantic, comforting or celebratory.",
        },
        {
          heading: "A straightforward checkout",
          body: "When ordering from another country, payment friction can ruin an otherwise easy experience. Look for secure digital payment options and a checkout that clearly separates the buyer's details from the recipient's delivery information. Presentail lists credit cards, Apple Pay and Google Pay among its payment options, while local shoppers can also see available payment methods at checkout.",
        },
        {
          heading: "Helpful support when details are uncertain",
          body: "Lebanese addresses can sometimes require extra directions, a landmark or a call to the recipient. Make sure the contact number and delivery information you provide are accurate. If the location is difficult to describe, add useful delivery notes rather than assuming the driver will recognise the building.",
        },
        {
          heading: "What can you buy from an online gift shop in Lebanon?",
          body: "The easiest way to find the right present is to match the gift to the experience you want the recipient to have.",
        },
        {
          heading: "Flowers and flower boxes",
          body: "Flowers are immediate, expressive and suitable for more occasions than almost any other gift. A hand bouquet feels warm and spontaneous, while a flower box creates a more structured, polished presentation. Colour can help communicate the mood: soft tones for gentle congratulations, bright arrangements for joyful celebrations, and classic red or white flowers for a more romantic or elegant gesture.\n\nBrowse <a href=\"/en-lb/beirut/category/hand-bouquets\">hand bouquets available for delivery</a>, or explore the full shop if you would like to compare flowers with other gift types.",
        },
        {
          heading: "Cakes for celebrations",
          body: "A cake does more than mark an occasion—it gives people a reason to gather. It works especially well for birthdays, office celebrations, anniversaries and family milestones. Before ordering, consider the number of people sharing it, the recipient's preferred flavours and whether candles or another small add-on would make the delivery more festive.\n\nExplore <a href=\"/en-lb/beirut/category/cakes\">cakes for delivery in Lebanon</a>. Current availability, flavours and delivery timing are shown on the collection and at checkout.",
        },
        {
          heading: "Plants that last beyond the day",
          body: "A plant is a thoughtful choice for someone who enjoys their home, desk or garden. It can suit a housewarming, a thank-you, a professional congratulations or a \"thinking of you\" moment. Plants also continue to remind the recipient of the sender long after the delivery day.\n\nWhen choosing one, consider the recipient's space and routine. A low-maintenance plant may be better for a busy person, while an orchid or bonsai can feel more decorative. Browse <a href=\"/en-lb/beirut/category/plants\">plants for delivery in Beirut</a> for current options.",
        },
        {
          heading: "Curated gift sets and thoughtful extras",
          body: "Gift sets are useful when one item does not quite say enough. A coordinated combination can create a more substantial reveal while keeping the presentation cohesive. Flowers with cake make a birthday delivery feel complete; flowers and chocolates create a classic romantic pairing; a plant with a personal card can be a warm professional gift.\n\nThe best combinations are not necessarily the biggest. They are the ones in which each item supports the same message.",
        },
        {
          heading: "How to choose a gift by occasion",
          body: "Searching by occasion can be faster than comparing every product individually. It also helps you avoid a gift that is attractive but wrong for the tone of the moment.",
        },
        {
          heading: "Birthday gifts",
          body: "For a birthday, begin with the recipient's personality. Someone expressive may love a colourful bouquet and balloons. A food lover may prefer a cake. A person who enjoys elegant, understated things may appreciate a simple flower arrangement or plant. If you are unsure, pair a versatile gift with a specific card message that shows you chose it for them.\n\nBrowse <a href=\"/en-lb/beirut/occasion/birthday\">birthday flowers and gifts</a> to compare celebratory options in one place.",
        },
        {
          heading: "Anniversary gifts",
          body: "Anniversary gifts should feel connected to the relationship. Flowers remain a classic choice because their colours and varieties can reflect romance, admiration and shared memories. A cake or chocolate pairing can turn the delivery into an experience the couple enjoys together.\n\nExplore <a href=\"/en-lb/beirut/occasion/anniversary\">anniversary flowers and gifts</a>, and use the card to mention a real memory rather than relying only on a familiar phrase.",
        },
        {
          heading: "New baby gifts",
          body: "When welcoming a baby, remember that you are also celebrating and supporting the parents. Soft flowers, balloons, a keepsake-style gift or a warm arrangement can all work well. If you are sending to a hospital, confirm that the recipient can receive deliveries and include the parent's full name and contact number.\n\nSee <a href=\"/en-lb/beirut/occasion/new-born\">new baby gifts</a> for current ideas.",
        },
        {
          heading: "Thank-you and congratulations gifts",
          body: "These occasions benefit from a clear sense of proportion. A plant, bouquet or small curated gift can feel generous without being excessive. For a professional recipient, keep the card warm and specific: say what they did and why it mattered.",
        },
        {
          heading: "Thinking-of-you and get-well gifts",
          body: "A gift does not need a formal event. Flowers, a plant or a comforting treat can make an ordinary day feel less lonely. For get-well wishes, choose something easy to receive and avoid making medical assumptions in the message. A simple \"Thinking of you and sending love\" is often enough.",
        },
        {
          heading: "How to choose a gift by recipient",
          body: "If the occasion does not point to an obvious answer, use three questions:",
          items: [
            "What do they enjoy? Think about their home, hobbies, favourite flavours and personal style.",
            "What do you want them to feel? Celebrated, appreciated, comforted, surprised or remembered?",
            "How will they receive it? At home, at work, in hospital or during a gathering?",
          ],
        },
        {
          body: "For a partner, a romantic arrangement and a personal note may be ideal. For a parent, a favourite cake or an elegant plant may feel more personal. For a colleague, choose a polished gift that is easy to share or display. For a close friend, colour, humour and a message only the two of you understand can matter more than formality.\n\nWhen in doubt, avoid choosing by gender alone. Interests, lifestyle and the relationship you share are much better guides.",
        },
        {
          heading: "Sending gifts to Lebanon from abroad",
          body: "For members of the Lebanese diaspora, distance often makes birthdays, holidays and family milestones feel more complicated. Ordering from a local online gift shop removes the need to package an item overseas, calculate international shipping or worry that a parcel will arrive long after the occasion.\n\nTo send gifts to Lebanon from abroad:",
          items: [
            "Open the store and set the recipient's Lebanese delivery location.",
            "Choose an item based on the products available for that location and date.",
            "Enter the recipient's full name, local phone number and precise address.",
            "Add a personalised message, including your name if the recipient may not recognise the order.",
            "Select an available delivery date and time window.",
            "Pay online and keep the order confirmation for reference.",
          ],
        },
        {
          body: "It is a small process, but accuracy matters. Use the recipient's active Lebanese number, add the floor or building name where relevant, and include a recognisable landmark if the address may be hard to find.",
        },
        {
          heading: "Same-day gift delivery in Beirut: what to know",
          body: "Same-day delivery is helpful when a celebration surprises you or a date has slipped your mind. Presentail offers same-day delivery in Beirut for eligible orders placed before midday, including areas such as Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael and Ras Beirut. Select zones may also have an express option.\n\nFor the smoothest urgent delivery:",
          items: [
            "Order as early as possible; do not wait until the published cut-off.",
            "Choose from products shown as available for the recipient's area.",
            "Double-check the phone number and address before payment.",
            "Make sure someone can receive the delivery.",
            "Use the available checkout slot as the final source of timing information.",
          ],
        },
        {
          body: "If the gift is for a wedding, engagement, hospital visit or another event with a fixed schedule, arranging delivery in advance is safer than relying on a last-minute order.",
        },
        {
          heading: "A simple formula for a more meaningful gift",
          body: "Thoughtful gifting does not require an enormous budget or an elaborate bundle. Use this simple formula: one item they will genuinely enjoy, one detail that reflects the occasion, and one personal sentence.\n\nThat might be a plant for a friend who has moved into a new home, delivered with a card that mentions the first coffee you plan to share there. It could be a birthday cake in a parent's favourite flavour with candles and a message recalling a family tradition. Or it could be a bouquet sent on an ordinary Tuesday simply because someone has had a difficult week.\n\nThe product creates the moment. The detail makes it theirs.",
        },
        {
          heading: "Find the right gift with Presentail",
          body: "If you are comparing options from a gift shop in Lebanon, start with the recipient and the feeling you want to send. Then choose a store that makes the practical details—selection, payment, personalisation and delivery—clear and convenient.\n\nPresentail brings flowers, cakes, plants and curated gifts together so you can plan one thoughtful delivery from one place. Browse the <a href=\"/en-lb/beirut/shop\">full collection of gifts in Lebanon</a>, add your personal message and select the available delivery option that fits your moment.",
        },
        {
          heading: "Frequently asked questions about gift shops in Lebanon",
          faqItems: [
            {
              q: "Where can I buy gifts online in Lebanon?",
              a: "You can buy flowers, cakes, plants and curated gifts online through Presentail. Browse the full collection, enter the recipient's Lebanese address, add a personal card message and select an available delivery date at checkout.",
            },
            {
              q: "Can I send a gift to Lebanon while living abroad?",
              a: "Yes. You can place an order online from abroad for delivery to someone in Lebanon. Use the recipient's full name, accurate Lebanese address and active local phone number, then pay with an available online payment method.",
            },
            {
              q: "Does Presentail offer same-day gift delivery in Lebanon?",
              a: "Presentail offers same-day delivery in Beirut for eligible orders placed before midday. Availability depends on the product, delivery area, date and capacity, so confirm the final option and time window at checkout.",
            },
            {
              q: "Can I add a personalised card to my gift?",
              a: "Yes. Presentail lets you add a personalised message to the order. Include your name if the recipient may not immediately know who sent the gift.",
            },
            {
              q: "What are popular gifts for delivery in Lebanon?",
              a: "Flowers, flower boxes, cakes, chocolates, plants and curated gift sets are versatile choices. The right option depends on the recipient, the occasion and whether you want the gift to be enjoyed immediately, shared with others or kept over time.",
            },
            {
              q: "How early should I order a gift?",
              a: "For a fixed event or important occasion, ordering ahead gives you more product and delivery-window choices. If you need same-day delivery in Beirut, order as early as possible and before the published midday cut-off for eligible orders.",
            },
          ],
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "corporate-gifting-lebanon": {
    en: {
      slug: "corporate-gifting-lebanon",
      eyebrow: "Lebanon",
      title: "Corporate Gifting in Lebanon | Presentail",
      h1: "Corporate Gifting in Lebanon: Ordering Online for Teams, Clients, and Colleagues",
      description:
        "Order corporate and office gifts online in Lebanon for teams, clients, and colleagues, with practical guidance on professional gift choices, bulk orders, and delivery timing.",
      dek:
        "A practical guide to ordering office-appropriate corporate gifts online in Lebanon for teams, clients, and colleagues.",
      geographyLabel: "Lebanon",
      categoryLabel: "Gifting Guides",
      datePublished: "2026-08-20",
      ctaHref: "https://presentail.com/en-lb/beirut/category/colleague",
      ctaLabel: "Browse the Colleague Collection →",
      relatedSlugs: [
        "gift-shop-in-lebanon",
        "flower-shops-in-lebanon",
        "send-gifts-to-lebanon-from-gulf",
      ],
      sections: [
        {
          body: `Buying flowers or a gift for someone in Lebanon is straightforward once you know the shop. Buying for a colleague, a client, or an entire team is a different problem — you're picking something appropriate rather than personal, you may be ordering more than one at a time, and you usually need it to arrive on a specific date without a lot of back-and-forth. Lebanon's online gift shops handle personal occasions well; here's how to think about the corporate side specifically.`,
        },
        {
          heading: "What Makes a Gift “Office-Appropriate”",
          body: `The instinct with corporate gifting is often to play it safe, which usually means something forgettable. The better approach is picking something genuinely nice but low on personal implication — nothing overly romantic, nothing that reads as too casual for a client relationship.

<strong>Desk plants</strong> solve this well. <a href="https://presentail.com/en-lb/beirut/product/vriesea">Vriesea</a> ($42) is compact, low-maintenance, and sits comfortably on an office desk without needing daily attention — a practical pick for a new hire or a client you're not sending flowers to every quarter.

<strong>Structured flower arrangements</strong> read as more polished than a loose bouquet. <a href="https://presentail.com/en-lb/beirut/product/the-bright-bouquet">The Bright Bouquet</a> ($85) and <a href="https://presentail.com/en-lb/beirut/product/omega-box">Omega Box</a> ($90) are both arranged in a box rather than tied, which tends to look more deliberate for a professional setting.

<strong>Chocolate boxes</strong> are the easiest shareable option when the gift is going to an entire team rather than one person. <a href="https://presentail.com/en-lb/beirut/product/classic-chocolate-box--881">Classic Chocolate Box</a> ($55) gets passed around an office in a way flowers on one desk don't.`,
        },
        {
          heading: "Matching the Gift to the Occasion",
          body: `<strong>Welcoming someone new.</strong> A <a href="https://presentail.com/en-lb/beirut/occasion/new-job">New Job</a> gift should feel encouraging without being over the top — this is often where a desk plant or a modest arrangement works better than a large, showy piece.

<strong>Recognizing a promotion.</strong> This is the moment to go slightly bigger. <a href="https://presentail.com/en-lb/beirut/product/15-roses-and-rocher-luxe-bundle">15 Roses & Rocher Luxe Bundle</a> ($85) pairs flowers with chocolate, which reads as more celebratory than either on its own — a good fit for a <a href="https://presentail.com/en-lb/beirut/occasion/promotion">Job Promotion</a> gift.

<strong>Saying thank you to a client or colleague.</strong> <a href="https://presentail.com/en-lb/beirut/product/white-ribbon-bouquet">White Ribbon Bouquet</a> ($180) is a genuine statement piece for a client relationship worth investing in, while something in the <a href="https://presentail.com/en-lb/beirut/category/colleague">Colleague</a> collection covers the more everyday version of a <a href="https://presentail.com/en-lb/beirut/occasion/thank-you">Thank You</a> gift.

<strong>Marking a team or company milestone.</strong> For a launch, a closed deal, or an office anniversary, browse <a href="https://presentail.com/en-lb/beirut/occasion/congratulations">Congratulations</a> gifts — most combine flowers with something extra, which tends to suit a shared celebration better than flowers alone.`,
        },
        {
          heading: "Ordering for More Than One Person",
          body: `The main difference between a personal order and a corporate one is volume — sending the same gift to five branch offices, or a dozen individual gifts to a sales team, is a different logistical exercise than a single bouquet. A few things worth confirming before placing a bulk order:

<strong>Delivery windows across multiple addresses.</strong> If gifts are going to different locations on the same day, confirm same-day delivery actually covers all of them — coverage can vary by area, and it's worth checking before assuming every address qualifies.

<strong>Consistency across the order.</strong> For a team gift, it usually looks more intentional if everyone receives the same item rather than a mix, so confirm stock is sufficient for the full order before locking in a date.

<strong>A message that isn't purely personal.</strong> Corporate cards read differently from a birthday note — something short and specific ("congratulations on the launch, from the whole team") tends to land better than a generic message.

For larger or recurring corporate orders, it's worth reaching out directly through <a href="https://presentail.com/en-lb/beirut/contact">Presentail's contact page</a> rather than placing several separate individual orders — this makes it easier to confirm bulk availability and coordinate delivery timing in one go.`,
        },
        {
          heading: "Why Order Corporate Gifts Online Rather Than In Person",
          body: `For a single personal gift, an in-person shop works fine. For corporate gifting specifically, ordering online tends to be the more practical choice: you can place the order from a desk without leaving the office, pay by card without handling cash for a company purchase, and keep a digital record of what was ordered and when — useful when the gift needs to be expensed or tracked against a budget.`,
        },
        {
          heading: "Ready to Order?",
          body: `<strong><a href="https://presentail.com/en-lb/beirut/category/colleague">Browse the Colleague Collection →</a></strong>

Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your corporate gift arrives exactly when it should.`,
        },
      ],
    },
    fr: {
      slug: "corporate-gifting-lebanon",
      eyebrow: "Liban",
      title: "Guide des cadeaux d’entreprise au Liban | Presentail",
      h1: "Cadeaux d’entreprise au Liban : idées pour équipes et clients",
      description:
        "Des idées de cadeaux d’entreprise au Liban pour employés, clients et collègues, avec des conseils pour les commandes groupées et la livraison.",
      dek:
        "Un guide pratique pour choisir et organiser des cadeaux professionnels au Liban, d’un geste pour un collègue à une commande pour toute une équipe.",
      geographyLabel: "Liban",
      categoryLabel: "Guides cadeaux",
      datePublished: "2026-08-20",
      ctaHref: "https://presentail.com/fr-lb/beirut/category/hand-bouquets",
      ctaLabel: "Découvrir les bouquets au Liban →",
      relatedSlugs: [
        "gift-shop-in-lebanon",
        "flower-shops-in-lebanon",
        "send-gifts-to-lebanon-from-gulf",
      ],
      sections: [
        {
          body: `Un cadeau d’entreprise au Liban peut remercier un client, accueillir une nouvelle recrue ou marquer une réussite collective. Le bon choix reste professionnel, chaleureux et facile à recevoir. Il faut aussi tenir compte du nombre de destinataires, de l’adresse et de la date souhaitée. Voici une méthode simple pour préparer ce geste sans le rendre impersonnel.`,
        },
        {
          heading: "Pourquoi offrir un cadeau d’entreprise ?",
          body: `Un cadeau bien choisi accompagne les moments qui comptent dans la vie d’une entreprise : arrivée d’un employé, promotion, anniversaire, fin de projet ou remerciement après une collaboration. Il peut être adressé à une personne, partagé par une équipe ou remis lors d’un événement. Dans chaque cas, le message et le format doivent correspondre à la relation professionnelle.

<strong>Pour un employé ou une nouvelle recrue</strong>, privilégiez une attention qui trouve facilement sa place au bureau : fleurs, plante ou assortiment à partager. La collection <a href="https://presentail.com/fr-lb/beirut/occasion/new-job">nouvel emploi</a> aide à trouver le ton juste.

<strong>Pour un client, un partenaire ou un collègue</strong>, choisissez un cadeau élégant et peu personnel. Une composition florale, des chocolats ou un coffret peuvent convenir pour remercier, féliciter ou célébrer une étape. Pour un collègue, consultez aussi les idées de la collection <a href="https://presentail.com/fr-lb/beirut/occasion/thank-you">remerciement</a>.`,
        },
        {
          heading: "Des idées selon le destinataire et l’occasion",
          body: `<strong>Remercier un client ou un collègue.</strong> Un message précis, accompagné de <a href="https://presentail.com/fr-lb/beirut/category/chocolate">chocolats</a> ou de fleurs, paraît plus attentionné qu’une formule générique. Pour une promotion ou un nouveau poste, une composition associée à un petit cadeau peut marquer l’événement sans être trop personnelle.

<strong>Accueillir, féliciter ou remercier.</strong> Les collections <a href="https://presentail.com/fr-lb/beirut/occasion/promotion">promotion</a> et <a href="https://presentail.com/fr-lb/beirut/occasion/congratulations">félicitations</a> offrent un point de départ pour une promotion, une signature ou un objectif atteint. Pour un anniversaire ou une fête de fin d’année, choisissez un format qui respecte les habitudes de l’équipe et le contexte de l’entreprise.

<strong>Pour une équipe ou un événement.</strong> Des <a href="https://presentail.com/fr-lb/beirut/category/hand-bouquets">bouquets</a> pour une salle de réunion, des <a href="https://presentail.com/fr-lb/beirut/category/cakes">gâteaux</a> à partager ou des <a href="https://presentail.com/fr-lb/beirut/category/balloons">ballons</a> peuvent accompagner un lancement, un anniversaire de bureau ou une célébration collective. L’essentiel est de vérifier le nombre de personnes et les contraintes du lieu avant de choisir.`,
        },
        {
          heading: "Préparer une commande pour plusieurs destinataires",
          body: `Une commande groupée demande un peu plus d’organisation qu’un cadeau individuel. Notez les noms, adresses, numéros de téléphone et dates souhaitées dans une liste claire. Si plusieurs personnes reçoivent le même cadeau, vérifiez la disponibilité de l’article pour l’ensemble de la commande avant de finaliser.

<strong>Un message adapté.</strong> Une carte personnalisée peut mentionner le projet, l’étape franchie ou la relation avec le destinataire. Pour une équipe, un mot signé au nom de l’entreprise est souvent plus naturel qu’un texte identique copié sans contexte.

<strong>Des adresses vérifiées.</strong> Pour plusieurs lieux, relisez chaque adresse et indiquez un contact joignable. Les créneaux et les possibilités de livraison peuvent dépendre de l’adresse, de la date et des disponibilités affichées au moment de la commande.

Pour un besoin en volume ou plusieurs adresses, décrivez votre projet via la page <a href="https://presentail.com/fr-lb/beirut/corporate">Cadeaux d’entreprise</a> de Presentail. Vous pouvez aussi utiliser la <a href="https://presentail.com/fr-lb/beirut/contact">page de contact</a> pour poser une question avant de commander.`,
        },
        {
          heading: "Organiser la livraison au Liban",
          body: `Avant de valider, renseignez l’adresse du destinataire et consultez les dates et créneaux réellement proposés pour cette destination. Pour une livraison à un bureau, précisez le nom de l’entreprise, l’étage ou l’accueil lorsque ces informations sont disponibles. Une date importante mérite d’être préparée à l’avance, tout en laissant une marge pour les contraintes de stock et de trajet.`,
        },
        {
          heading: "En résumé",
          body: `Pour réussir un cadeau d’entreprise au Liban, partez du destinataire et de l’occasion, choisissez un format facile à recevoir, puis vérifiez la disponibilité, l’adresse et la date au moment de la commande. Avec un message personnel et des informations de livraison précises, un bouquet, des chocolats ou un cadeau à partager devient une attention professionnelle qui a du sens.`,
        },
      ],
    },
  },
  "mothers-day-gifts-lebanon": {
    en: {
      slug: "mothers-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Mother's Day Gifts in Lebanon: The Complete Flower & Gift Guide",
      description:
        "Mother's Day in Lebanon falls on March 21. Discover the best Mother's Day flowers, cakes, and gifts with same-day delivery across Lebanon from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/mothers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/metn/occasion/mothers-day",
      ctaLabel: "Shop Mother's Day Gifts",
      relatedSlugs: ["fathers-day-gifts-lebanon", "valentines-day-gifts-lebanon", "send-roses-to-lebanon"],
      sections: [
        {
          body: "There's a detail that catches a lot of people off guard: Mother's Day in Lebanon doesn't fall on the date most of the world uses. While the US, UK, and many other countries celebrate on the second Sunday of May, Lebanon — along with most of the Arab world — marks Mother's Day on March 21, the first day of spring. The timing isn't a coincidence. Pairing the day with the start of spring, when the country's flower markets are at their fullest, has always felt like the right kind of symbolism for a day about mothers.",
        },
        {
          body: "If you're searching for Mother's Day gifts in Lebanon, here's everything you need to get it right — from what to send, to when to order, to a few specific pieces we think are worth a look this year.",
        },
        {
          heading: "When Is Mother's Day in Lebanon?",
          body: "Mark it now: March 21. It's a fixed date each year, not a moving Sunday, so there's no need to double-check a calendar the week before. That also means it's easy to plan ahead — flowers and gift baskets for March 21 can be ordered well in advance and scheduled for exact delivery on the day, no last-minute scrambling required.",
        },
        {
          heading: "What to Get Her: Mother's Day Gift Ideas That Actually Land",
          body: "Not every gift is a Mother's Day gift. The ones that land tend to share a few things in common: they feel personal, they don't require assembly or explanation, and they arrive looking exactly as good as they did in the photo. A few categories that consistently work well:",
        },
        {
          body: 'Fresh flowers. Still the classic for a reason. A vase arrangement in soft pinks or blush tones reads as thoughtful without trying too hard — something like our <a href="/en-lb/beirut/product/blush-rose-vase">Blush Rose Vase</a> ($50), a clean glass vase of blush roses that suits a coffee table or bedside table equally well.',
        },
        {
          body: "Something sweet. Cakes and chocolate boxes cover the moms who'd rather have dessert with the family than unwrap a box. A shared cake after Sunday lunch tends to disappear faster than any bouquet.",
        },
        {
          body: 'A small, cheerful extra. Balloons aren\'t the whole gift, but paired with flowers or a cake, they turn a delivery into a moment — especially with grandkids in the house. Our <a href="/en-lb/beirut/product/best-mom-ever-balloon">Best Mom Ever Balloon</a> ($14) is a simple, affordable way to add that.',
        },
        {
          body: "A full bundle, if you want to cover all three. For anyone who'd rather not choose between flowers, sweets, and a little extra, a combined gift set does the deciding for you.",
        },
        {
          heading: "Browse the Full Mother's Day Collection",
          body: 'Rather than picking through the entire catalogue, the fastest way to find the right gift is our dedicated <a href="/en-lb/metn/occasion/mothers-day">Mother\'s Day Collection</a> — flowers, cakes, chocolate, and balloons, all curated specifically for the day, with prices and delivery windows shown up front so there\'s no guessing.',
        },
        {
          heading: "Same-Day Delivery, Anywhere in Lebanon",
          body: "March 21 tends to be a busy day for florists across the country, which is exactly why we'd suggest ordering a day or two ahead if the timing matters to you (a surprise delivered while everyone's still at the breakfast table, for instance). That said, Presentail offers same-day delivery across Lebanon, including Beirut, Metn, and every city we serve, so a same-day order on the 21st itself is still very much doable.",
        },
        {
          heading: "A Few Tips for Getting It Right",
          items: [
            "Add a note. Every order includes the option to attach a personal message — it's free, and it's the part that gets remembered longer than the gift itself.",
            "Check the delivery address twice. If mom's spending the day at a sibling's house or a family gathering, double-confirm the address before checkout rather than after.",
            "Don't wait until the morning of. Popular arrangements (ours included) tend to sell through by mid-morning on Mother's Day itself. Ordering the evening before, or scheduling ahead for exact delivery on the 21st, is the safer bet.",
          ],
        },
        {
          heading: "Ready to Order?",
          body: 'Whether you\'re set on flowers, leaning toward something sweet, or want the whole bundle, the full range is right here: <a href="/en-lb/metn/occasion/mothers-day">Shop Mother\'s Day Gifts →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery options so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "fathers-day-gifts-lebanon": {
    en: {
      slug: "fathers-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "When Is Father's Day in Lebanon? Date + Gift Ideas | Presentail",
      h1: "When Is Father's Day in Lebanon? The Date, and What to Actually Get Him",
      description:
        "Father's Day in Lebanon is 21 June every year — not the third Sunday like the US and UK. Here's the date, why it differs, and what to actually get him.",
      dek: "It's 21 June, it's the same date every year, and it is not the day the rest of your family abroad is celebrating.",
      datePublished: "2026-08-13",
      dateModified: "2026-09-06",
      ogImage: { url: "/blog/fathers-day-gifts-lebanon.webp", width: 1408, height: 768 },
      toc: true,
      cta: {
        label: "Shop Father's Day gifts",
        path: "/occasion/fathers-day",
        country: "lb",
      },
      relatedSlugs: ["mothers-day-gifts-lebanon", "gift-shop-in-lebanon", "corporate-gifting-lebanon"],
      sections: [
        {
          body: "Father's Day in Lebanon is on 21 June, and it is on 21 June every year. It does not move. If you have family in the US, the UK or Australia, theirs does move — and that mismatch is the single most common reason a gift arrives on the wrong day.",
        },
        {
          body: "Here is the date, why it is different, and what is actually worth sending once you have it in the calendar.",
        },
        {
          heading: "When is Father's Day in Lebanon?",
          body: "21 June, fixed. It does not shift to a Sunday and it does not follow the American calendar. Lebanon shares the date with most of the Arab world — Egypt, Jordan, Syria, the Gulf — where 21 June is the standard.",
          items: [
            "2027 — 21 June, a Monday",
            "2028 — 21 June, a Wednesday",
            "2029 — 21 June, a Thursday",
            "2030 — 21 June, a Friday",
          ],
          callout: {
            variant: "info",
            body: "Lebanon's Mother's Day works the same way — 21 March, fixed, not the second Sunday of May. Both dates sit on an equinox, which is where the convention comes from.",
          },
        },
        {
          body: "The practical consequence: it usually falls on a working day. Unlike a Sunday holiday, the gift often has to reach an office, or reach the house before he gets home from one. That changes what you send and when you schedule it.",
        },
        {
          heading: "Why the date is different from the US and UK",
          body: "The US and UK both use the third Sunday of June, which lands on a different date every year. Lebanon uses a fixed calendar date. So the two only occasionally line up.",
        },
        {
          body: "In 2027 they fall on consecutive days — the American Father's Day is Sunday 20 June, Lebanon's is Monday 21 June. In 2028 they are three days apart. In 2029, four.",
        },
        {
          body: "If your family is split across countries, pick one and be consistent, or you end up with a father who gets called twice in one week and is not sure which one counted.",
          pullQuote: "A fixed date is a gift in itself. You have no excuse for being surprised by it.",
        },
        {
          heading: "What Lebanese dads actually want",
          body: "The hardest part of Father's Day is not the date. It is that most fathers of a certain generation will tell you, sincerely, not to get them anything.",
        },
        {
          body: "Ignore that, but take the hint underneath it: they mean don't spend money on something I won't use. Which rules out most of the novelty aisle.",
        },
        {
          heading: "The dad who has everything",
          subheading: true,
          body: 'Send something consumable or living rather than another object. A plant he will tend, a good bottle, something edible that gets shared. <a href="/en-lb/beirut/product/baba-s-bonsai">Baba\'s Bonsai</a> works here precisely because it asks something of him — it is a small ongoing project, not an ornament.',
        },
        {
          heading: "The dad who won't ask for anything",
          subheading: true,
          body: 'Flowers. Genuinely. There is a lingering idea that flowers are not a men\'s gift, and it is wrong — a proper arrangement delivered to a man who has never been sent one lands harder than almost anything else on this list. <a href="/en-lb/beirut/product/dad-s-signature-bouquet">Dad\'s Signature Bouquet</a> and <a href="/en-lb/beirut/product/dads-timeless-blooms">Dad\'s Timeless Blooms</a> are built for exactly this, in palettes that skip the pastel register.',
        },
        {
          heading: "The dad who is far away",
          subheading: true,
          body: 'If you are abroad and he is in Lebanon — or the reverse — the gift is doing double duty as proof you remembered. Send something that arrives on the day, and put the effort into the card rather than the price. <a href="/en-lb/beirut/product/cheers-to-dad">Cheers to Dad</a> ($165) is the option that reads as an occasion rather than an errand.',
        },
        {
          heading: "The new dad",
          subheading: true,
          body: "First Father's Day is its own category and it is usually overlooked — everyone is focused on the baby. Something addressed to him specifically, however small, tends to be remembered for years.",
        },
        {
          heading: "Gift ideas that land",
          body: "A shortlist, across budgets:",
          items: [
            'Flowers — <a href="/en-lb/beirut/product/dads-timeless-blooms">Dad\'s Timeless Blooms</a>, <a href="/en-lb/beirut/product/dad-s-signature-bouquet">Dad\'s Signature Bouquet</a>, or <a href="/en-lb/beirut/product/florals-for-my-hero">Florals For My Hero</a> for something less restrained.',
            'Plants — <a href="/en-lb/beirut/product/baba-s-bonsai">Baba\'s Bonsai</a> or <a href="/en-lb/beirut/product/dads-garden">Dad\'s Garden</a> ($120), for a gift with a longer life than a week.',
            'Hampers — <a href="/en-lb/beirut/product/cheers-to-dad">Cheers to Dad</a> ($165), when it is a milestone year or the gift is coming from several people.',
            "Cakes and chocolates — the choice when the celebration is a family lunch rather than a delivery.",
            'Balloons — the <a href="/en-lb/beirut/product/happy-fathers-day-balloon">Happy Father\'s Day Balloon</a> ($13) is not the gift, but it turns a delivery into an event, especially for kids sending something to their father.',
          ],
        },
        {
          body: 'Browse the full range on our <a href="/en-lb/beirut/occasion/fathers-day">Father\'s Day gifts in Lebanon</a> page, which has the current collection and prices.',
        },
        {
          heading: "Sending from abroad",
          body: "A large share of Father's Day orders into Lebanon come from outside it — from the Gulf, Europe, North America, West Africa. The mechanics are straightforward: order online from anywhere, enter his address in Lebanon, add a card message, and pay by credit card, Apple Pay or Google Pay. He pays nothing on delivery.",
        },
        {
          body: "Two things that matter more on this occasion than most:",
          ordered: true,
          items: [
            "Give a working local number. Our driver calls on arrival, and fathers are notoriously the family member whose number nobody has updated.",
            "Mind the weekday. Because 21 June is fixed, it often lands midweek. If he is at work, either send to the office or schedule an evening window.",
          ],
        },
        {
          heading: "When to order",
          body: "21 June is a volume day. The delivery slots that go first are the evening windows, which are also the ones most people want.",
          items: [
            "Order before midday on the day itself for same-day delivery.",
            "Better: schedule ahead. You can book up to 30 days in advance and choose a two-hour window, which on a fixed-date occasion is simply the smarter move — you already know the date a year out.",
            "If it is going to an office, aim for late morning. Flowers that arrive at 5:55pm go home in a car boot.",
          ],
        },
        {
          heading: "Ready to order?",
          body: "Pick the gift, write the card properly, and choose your window.",
        },
        {
          heading: "Frequently asked questions",
          faqItems: FATHERS_DAY_GIFTS_LEBANON_FAQS,
        },
      ],
      extraJsonLd: [buildFaqPageJsonLd(FATHERS_DAY_GIFTS_LEBANON_FAQS)],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "valentines-day-gifts-lebanon": {
    en: {
      slug: "valentines-day-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Valentine's Day Gifts in Lebanon | Presentail",
      h1: "Valentine's Day Gifts in Lebanon",
      description:
        "The best Valentine's Day gifts in Lebanon — roses, preserved flowers, and gift bundles with same-day delivery from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/valentines-day-gifts-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/metn/occasion/valentines-day",
      ctaLabel: "Shop Valentine's Day Gifts",
      relatedSlugs: ["send-roses-to-lebanon", "balloon-delivery-beirut-lebanon", "best-cakes-lebanon"],
      sections: [
        {
          body: "Valentine's Day doesn't need an explanation of when it falls — February 14, same as everywhere else. What it does need, if you're sending something in Lebanon this year, is a clear sense of what actually works versus what's a safe-but-forgettable default. Here's a practical guide to Valentine's Day gifts in Lebanon, built around what tends to land best.",
        },
        {
          heading: "Roses Are Still the Answer (Mostly)",
          body: 'There\'s a reason red roses dominate February 14 order volume every single year — they work, reliably, for almost every kind of relationship. But "roses" isn\'t one gift, it\'s a range:',
        },
        {
          body: 'Classic and unmistakable. A <a href="/en-lb/beirut/product/colossal-red-roses-box">Colossal Red Roses Box</a> ($360) is the statement version — the kind of arrangement that doesn\'t need a card to explain the intent.',
        },
        {
          body: "Smaller and still meaningful. Not every relationship calls for the biggest box on the menu. A tighter arrangement of red roses covers the sentiment without the price tag of the showstopper.",
        },
        {
          heading: "Beyond Roses: Gifts With More Staying Power",
          body: "Fresh flowers are beautiful for a week. A few Valentine's categories last considerably longer, which matters if longevity is part of the message you're going for:",
        },
        {
          body: 'Preserved roses that don\'t wilt. A <a href="/en-lb/beirut/product/red-heart-shaped-eternal-rose">Red Heart-Shaped Eternal Rose</a> ($127) keeps its form for months rather than days — a genuinely different gifting proposition from a fresh bouquet, and one that reads as more deliberate.',
        },
        {
          body: 'Something soft and a little playful. Not every Valentine\'s gift needs to be serious. A <a href="/en-lb/beirut/product/love-bear">Love Bear</a> ($32) works well as an add-on gift, or as the whole gift for a newer relationship where a $300 rose box would read as too much, too soon.',
        },
        {
          heading: "Matching the Gift to the Relationship",
          body: "A genuinely useful way to think about it: how long have you been together, and how big is the moment supposed to feel this year? A first Valentine's Day rarely calls for the most expensive option in the catalogue — something warm but proportionate tends to land better than something that feels like it's trying too hard. Longer relationships, anniversaries that happen to fall near February 14, or a make-up-for-lost-time gift after a rough stretch are where the bigger, more considered pieces make sense.",
        },
        {
          heading: "Browse the Full Valentine's Day Collection",
          body: 'Rather than scrolling the entire catalogue, the curated collection is the fastest way to compare what\'s actually built for the day: <a href="/en-lb/metn/occasion/valentines-day">Valentine\'s Day Collection</a> — roses, preserved flowers, bears, and gift bundles, all in one place.',
        },
        {
          heading: "Order Early — February 14 Sells Out Fast",
          body: "This is the single most order-heavy day of the year for florists across Lebanon, and popular arrangements do sell through, sometimes days in advance. If you have a specific piece in mind, ordering a few days ahead and scheduling exact delivery for the 14th is the safest route. Same-day ordering on Valentine's Day itself is still possible, but selection narrows as the day goes on.",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/metn/occasion/valentines-day">Shop Valentine\'s Day Gifts →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your gift arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "best-cakes-lebanon": {
    en: {
      slug: "best-cakes-lebanon",
      eyebrow: "Gifting Guide",
      title: "The Best Cakes in Lebanon: Where to Order Online for Same-Day Delivery",
      seoTitle: "Best Cakes in Lebanon | Order Online for Same-Day Delivery",
      description:
        "Looking for the best cakes in Lebanon? Order Hallab 1881, Sables Gourmets, and more with same-day delivery from Presentail.",
      datePublished: "2026-08-13",
      ogImage: { url: "/blog/best-cakes-lebanon.webp", width: 1408, height: 768 },
      ctaHref: "https://presentail.com/en-lb/beirut/category/cakes",
      ctaLabel: "Shop Cakes & Sweets",
      relatedSlugs: ["chocolatiers-behind-our-gift-boxes", "fathers-day-gifts-lebanon", "mothers-day-gifts-lebanon"],
      sections: [
        {
          body: "Finding a good cake in Lebanon isn't the hard part — the country has no shortage of bakeries. The hard part is finding one that (a) actually delivers, (b) shows up looking like the photo, and (c) doesn't require you to plan three days ahead. Here's where that search tends to land, and what's worth ordering.",
        },
        {
          heading: "Hallab 1881: The Name Everyone Already Knows",
          body: 'If you\'ve spent any time in Lebanon, you know the name. <a href="/en-lb/beirut/brand/hallab-1881">Hallab 1881</a> has been a fixture of Lebanese sweets since, unsurprisingly, 1881 — a heritage brand that\'s less "trendy bakery" and more "the sweets your grandmother trusted." Ordering Hallab through Presentail means the same recognizable quality, delivered same-day, without a trip to Tripoli or a Beirut branch.',
        },
        {
          heading: "Sablés Gourmets: For the French-Style Pick",
          body: 'For something a little different from traditional Lebanese sweets, <a href="/en-lb/beirut/brand/sables-gourmets">Sablés Gourmets</a> brings a French-inflected take on gifting sweets — refined, boxed, and built for gifting rather than just eating. It\'s the pick for someone who wants "elegant" over "traditional."',
        },
        {
          heading: "Our Favorite Cakes to Order Right Now",
          body: "A few specific picks worth calling out from the current catalogue:",
        },
        {
          body: 'Chocolate Rocher Cake ($48) — serves 8 to 10 people, built around the Ferrero Rocher flavor profile that\'s become something of a Lebanese celebration staple. <a href="/en-lb/beirut/product/chocolate-rocher-cake--899">Order it here</a>.',
        },
        {
          body: 'Classic Chocolate Box ($55) — not a cake in the traditional sense, but for gifting rather than serving at a table, a curated box of milk, dark, and white chocolates often does the job better than a full cake. <a href="/en-lb/beirut/product/classic-chocolate-box--881">See the box</a>.',
        },
        {
          heading: "What to Actually Check Before You Order",
          body: "A few things separate a good cake order from a disappointing one:",
        },
        {
          body: 'Serving size. Check how many people the cake actually serves before ordering — "cake" can mean anything from a personal-size dessert to a 20-person centerpiece, and the price difference is significant.',
        },
        {
          body: "Delivery timing. Cakes are more delicate in transit than flowers or balloons. Ordering with enough lead time (same-day is usually fine, but not last-minute-before-an-event) gives more room for things to go smoothly.",
        },
        {
          body: 'What it\'s actually for. A birthday cake, a congratulations cake, and a "just because" cake call for different things — a full serving cake for the first, something shareable and celebratory for the second, a smaller gesture like a chocolate box for the third.',
        },
        {
          heading: "Browse the Full Cake & Chocolate Selection",
          body: 'For the complete range beyond these picks — cakes, chocolate boxes, and Arabic sweets — the full category is here: <a href="/en-lb/beirut/category/cakes">Cakes</a> and <a href="/en-lb/beirut/category/chocolate">Chocolate</a>.',
        },
        {
          heading: "Same-Day Delivery Across Lebanon",
          body: "Presentail delivers cakes and sweets same-day across Beirut and the rest of Lebanon. Order before midday for same-afternoon delivery, or schedule ahead for an exact time if you're planning around a specific event.",
        },
        {
          heading: "Ready to Order?",
          body: '<a href="/en-lb/beirut/category/cakes">Shop Cakes & Sweets →</a>',
        },
        {
          body: "Presentail delivers across Lebanon, the UAE, and Cyprus, with same-day and scheduled delivery so your order arrives exactly when it should.",
        },
      ],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "teddy-bear-gifts-lebanon": {
    en: {
      slug: "teddy-bear-gifts-lebanon",
      eyebrow: "Gifting Guide",
      title: "Teddy Bear Gifts in Lebanon: Sizes & Delivery | Presentail",
      h1: "Teddy Bear Gifts in Lebanon: A Guide for Every Occasion",
      description:
        "Choosing a teddy bear in Lebanon — which size suits which occasion, what they cost, how to pair one with flowers or balloons, and same-day delivery nationwide.",
      datePublished: "2026-08-13",
      dateModified: "2026-08-24",
      ogImage: { url: "/blog/teddy-bear-gifts-lebanon.webp", width: 1408, height: 768 },
      dek: "Which size for which occasion, what to expect to pay, and how to get one to the door the same day.",
      toc: true,
      cta: {
        label: "Shop teddy bears in Lebanon",
        path: "/category/stuffed-animals",
        country: "lb",
      },
      relatedSlugs: ["gift-shop-in-lebanon", "balloon-delivery-beirut-lebanon", "best-cakes-lebanon"],
      sections: [
        {
          body: 'A teddy bear is one of the few gifts that works from birth to a fiftieth birthday, which is exactly why it is easy to get wrong. Buy one that is too small and it reads as an afterthought; buy one that is too big and someone has to find somewhere to put a 200 cm bear in a Beirut apartment.\n\nOrdering a teddy bear in Lebanon is straightforward once you know the two things that actually decide the outcome: the size, and what you send alongside it. For anyone searching "teddy bear Lebanon," this guide covers both, plus what to expect to pay and how the delivery works.',
        },
        {
          heading: "Start with the size, not the bear",
          body: "Almost every teddy bear decision resolves at the size question. Get that right and the rest is aesthetics.",
          items: [
            "Small (roughly 25–40 cm) — babies, toddlers, hospital visits, and anywhere the bear has to share space with other gifts. Small bears also travel well in a car and survive being carried around by a three-year-old.",
            "Medium (40–80 cm) — the default birthday bear. Big enough to feel generous, small enough to sit on a bed or a shelf without becoming furniture.",
            "Large (80–120 cm) — anniversaries, graduations, and \"I want them to react when they open the door.\"",
            "Life-size (around 200 cm) — a statement, not a gift. These are for proposals, milestone birthdays and the kind of moment that ends up on Instagram. Check the recipient has the space first.",
          ],
          callout: {
            variant: "info",
            body: "Rule of thumb — the closer the relationship, the bigger the bear can be. For a colleague or a new acquaintance, small to medium is the safe range.",
          },
        },
        {
          heading: "The bears, and who they are for",
        },
        {
          heading: "Birthdays and everyday gifting",
          subheading: true,
          body: 'The <a href="/en-lb/beirut/product/birthday-bear">Birthday Bear</a> (around $32) is the easy pick: recognisably celebratory, priced so you can pair it with something else, and appropriate for almost any age. The <a href="/en-lb/beirut/product/marmalade-bear">Marmalade Bear</a> (around $74) is the step up when you want the presentation to carry more weight — a friend\'s thirtieth, a sister, a niece.\n\nThe <a href="/en-lb/beirut/product/brown-bear">Brown Bear</a> and <a href="/en-lb/beirut/product/red-bear">Red Bear</a> cover the classic end of the range, where you want a teddy bear that looks like a teddy bear and nothing more.',
        },
        {
          heading: "Romance and anniversaries",
          subheading: true,
          body: 'The <a href="/en-lb/beirut/product/love-bear">Love Bear</a> (around $32) is built for Valentine\'s Day and anniversaries and does the job without ceremony. The <a href="/en-lb/beirut/product/giant-rose-teddy-bear">Life-Size Rose Teddy Bear</a> is the other end of the same idea — a bear made of roses, which reads as flowers and a teddy bear at once, and photographs far better than either separately.\n\n<a href="/en-lb/beirut/product/rosy-the-bear">Rosy the Bear</a> sits in between: soft, romantic, and not so large that it has to be explained.',
        },
        {
          heading: "New babies and children",
          subheading: true,
          body: 'For a newborn or a young child, the animal matters less than the size. The <a href="/en-lb/beirut/product/hippo">Hippo</a>, <a href="/en-lb/beirut/product/tiger">Tiger</a>, Monkey and <a href="/en-lb/beirut/product/raccoon">Raccoon</a> are all good choices precisely because they are not another bear — a family with a new baby usually receives several. Keep it small enough to sit in a cot or a car seat, and pair it with something for the parents rather than the child.',
        },
        {
          heading: "When you want a reaction",
          subheading: true,
          body: 'The <a href="/en-lb/beirut/product/giant-teddy-bear">Life-Size Teddy Bear</a> at roughly 200 cm is the statement piece. It is genuinely large, it needs a car with a folding back seat, and it is unforgettable — which is the point. Send it for proposals, eighteenth and twenty-first birthdays, and homecomings.',
          pullQuote: "A teddy bear is one of the few gifts where the size is the message.",
        },
        {
          heading: "What a teddy bear costs in Lebanon",
          body: "Broadly, three bands:",
          ordered: true,
          items: [
            "Around $30 — small and medium classic bears. Fine on their own for a child, better paired with balloons or chocolate for an adult.",
            "$70 to $150 — larger bears and the more considered designs. This is where most birthday and anniversary gifting lands.",
            "$300 and up — life-size and rose bears. A single-gift budget, not something you add to a basket.",
          ],
        },
        {
          body: "If you are working to a fixed budget, spend it on one good bear rather than a small bear plus filler. A $32 bear with a handwritten card lands better than $60 spread across three forgettable items.",
        },
        {
          heading: "Pair it with one thing, not four",
          body: "A teddy bear on its own is a complete gift for a child. For an adult, it usually wants a companion — and one is enough.",
          items: [
            '<a href="/en/blog/balloon-delivery-beirut-lebanon">Balloons</a> turn a bear into a birthday. The cheapest and most visible upgrade.',
            "Chocolates are the safe adult pairing, and the one people actually consume.",
            "Flowers make the bear the supporting act rather than the main event, which is the right call for anniversaries and apologies.",
            '<a href="/en/blog/best-cakes-lebanon">A cake</a> makes it an occasion rather than a delivery.',
          ],
        },
        {
          body: "All of these can be added at checkout, along with a personalised card. Write the card. A bear with no message is soft furnishing.",
        },
        {
          heading: "Delivery across Lebanon",
          body: "Order before midday and same-day delivery is available. After that, the next available slot is the following day.\n\nIf you are planning around a specific moment — a party, an office surprise, someone landing at the airport — you can schedule up to 30 days in advance and choose a two-hour delivery window. For large and life-size bears, an afternoon or evening window is usually the better choice, since someone needs to be home to receive something that size.",
          callout: {
            variant: "service",
            title: "Same-day across Lebanon",
            body: "Order before midday for same-day delivery. Scheduling ahead? Pick your date and a two-hour window at checkout.",
          },
        },
        {
          heading: "Sending a teddy bear to Lebanon from abroad",
          body: "A large share of these orders come from outside the country: someone in Dubai, Paris or Montreal sending a bear to a niece in Beirut. The process is the same as ordering locally — choose the bear, enter the recipient's address in Lebanon, add a card message, and pay by credit card, Apple Pay or Google Pay. You do not need to be in Lebanon, and the recipient pays nothing on arrival.\n\nTwo things worth doing from abroad: give a working local phone number for the recipient so our driver can call, and add an access note if the address is an apartment building without a doorman. Those two fields prevent nearly every delayed delivery.",
        },
        {
          heading: "A note on quality",
          body: "For a baby or a very young child, check that the bear has embroidered features rather than plastic eyes and nose, and that seams are tight. For everyone else, weight and pile density are what separate a bear that feels expensive from one that does not — a well-made medium bear reads better than a cheap large one, every time.",
        },
        {
          heading: "Ready to order?",
          body: "Browse the full range of teddy bears and soft toys, add a card message, and choose your delivery window at checkout.",
        },
        {
          heading: "Frequently asked questions",
          faqItems: TEDDY_BEAR_GIFTS_LEBANON_FAQS,
        },
      ],
      extraJsonLd: [buildFaqPageJsonLd(TEDDY_BEAR_GIFTS_LEBANON_FAQS)],
    },
    get ar() { return this.en; },
    get fr() { return this.en; },
  },
  "cake-for-proposal": {
    en: {
      slug: "cake-for-proposal",
      eyebrow: "Lebanon",
      title: "Cake for a Proposal: 9 Ideas and How to Order One | Presentail",
      h1: "Cake for a Proposal: 9 Ideas, and How to Get One Made",
      description:
        "Proposal cake ideas that work — Marry Me designs, ring-box cakes, what to write on it, what size to order, and how to have a custom one made and delivered.",
      dek:
        "What to put on it, what size to order, when to bring it out — and how to have a custom proposal cake delivered.",
      geographyLabel: "Lebanon",
      categoryLabel: "Gifting Guides",
      datePublished: "2026-08-25",
      toc: true,
      ogImage: { url: "/blog/best-cakes-lebanon.webp", width: 1408, height: 768 },
      ogImageAlt: "A simple proposal cake with a piped message",
      cta: {
        label: "Order a proposal cake",
        path: "/category/cakes",
        country: "lb",
      },
      recommendation: {
        title: "Cakes for the moment",
        body:
          "Order from our range with a personalised message, or request a custom proposal cake — delivered across Lebanon.",
        label: "Browse cakes",
        path: "/category/cakes",
        country: "lb",
        image: {
          url: "/blog/best-cakes-lebanon.webp",
          width: 1408,
          height: 768,
          alt: "A simple proposal cake with a piped message",
        },
      },
      relatedSlugs: [
        "best-cakes-lebanon",
        "balloon-arrangement-ideas",
        "flower-shops-in-lebanon",
      ],
      sections: [
        {
          body:
            "A proposal cake has one job, and it is not dessert. It is the reveal — the object that says the thing before you do, while your hands are busy and your voice is not cooperating. Which is why the best proposal cakes are simple, legible from a metre away, and photograph in a single frame.\n\nNine ideas below, then the practical part: what to write on it, what size to order for a proposal that is usually just two people, and how to have a custom one made.",
        },
        {
          heading: "Nine proposal cake ideas",
        },
        {
          heading: "1. The classic \"Marry Me\" cake",
          subheading: true,
          body:
            "Two words, piped clean across the top of a plain cake. It works because it removes every possible ambiguity, and because a photograph of it needs no caption. Keep the cake itself undecorated — white, ivory or dark chocolate — so the words carry the whole message.",
        },
        {
          heading: "2. The ring-box cake",
          subheading: true,
          body:
            "A small square or round cake designed to look like a ring box, sometimes with the real ring set into a hollow on top. Higher-effort and much higher-impact, and it solves the question of where to hold the ring until the moment arrives.",
        },
        {
          heading: "3. White cake with fresh flowers",
          subheading: true,
          body:
            "A single-tier white cake dressed with fresh blooms — roses, ranunculus, whatever is in season. No writing at all. This is the choice when the proposal is the surprise and the cake is the setting rather than the announcement, and it doubles as the centrepiece if you are proposing at a dinner.",
        },
        {
          heading: "4. The reveal under the lid",
          subheading: true,
          body:
            "A cake delivered in a closed box, with the message on the inside of the lid or written across the cake so it appears only when the box opens. The pause between \"there is a cake\" and \"oh\" is the entire point.",
        },
        {
          heading: "5. The date cake",
          subheading: true,
          body:
            "Piped with the date you met, the date of your first trip, or the coordinates of where you are standing. Quieter than \"Marry Me\" and more personal — for the couple whose story has a specific reference point.",
        },
        {
          heading: "6. Dessert for two",
          subheading: true,
          body:
            "A miniature cake, sized for two people, because that is usually the actual audience. A six-inch cake for a proposal on a balcony makes far more sense than a party cake nobody will finish. Small also travels better and photographs closer.",
        },
        {
          heading: "7. The bilingual cake",
          subheading: true,
          body:
            "\"Btetzawajini?\" in Arabic, or a mix of Arabic and English across the tiers. For a lot of couples here this reads warmer and more like them than the English version — and it lands differently with family afterwards.",
        },
        {
          heading: "8. Chocolate drip with a ring topper",
          subheading: true,
          body:
            "A dark chocolate drip cake with a small gold or acrylic ring topper. The one on this list that suits a proposal happening at a restaurant table, since it looks like an ordinary celebration cake until you read the topper.",
        },
        {
          heading: "9. The \"She Said Yes\" cake",
          subheading: true,
          body:
            "Not for the proposal — for the day after. A second, smaller cake for the family dinner or the office announcement, which is often the moment people forget to plan for and later wish they had photographed.",
        },
        {
          pullQuote:
            "The cake is not dessert. It is the sentence you cannot get out.",
        },
        {
          heading: "What to write on it",
          body:
            "Short beats clever. The message has to be readable in a photo and understood in a second.",
          items: [
            "Marry me — unimprovable.",
            "Will you marry me? — the full question, when you want it unmistakable.",
            "Forever? — for couples who already talk about forever.",
            "One more yes — if there is a running joke about it.",
            "Btetzawajini? — the Arabic version, and often the one that gets the bigger reaction.",
            "The date — no words at all, just the day that started it.",
          ],
          callout: {
            variant: "info",
            body:
              "Test it by imagining the photo. If the message is not readable in a picture taken from across a table, it is too long or too ornate.",
          },
        },
        {
          body:
            "Avoid anything that needs explaining, anything longer than five words, and script fonts on a small cake — they blur at photo distance.",
        },
        {
          heading: "Size and flavour: order for the moment, not the crowd",
          body:
            "Most proposals have an audience of one. The cake still gets eaten, but usually later, and usually by fewer people than you think.",
          items: [
            "Proposing privately — a six-inch cake, serving four to six. Enough to share that evening, small enough to carry.",
            "Proposing at a family dinner — eight to ten servings, so nobody is watching someone else eat.",
            "Proposing then announcing — order two: the small one for the moment, a larger one for the gathering after.",
          ],
        },
        {
          body:
            "On flavour, choose theirs, not yours, and choose something that survives sitting out. Chocolate holds up. Cream-heavy and fresh-fruit cakes are less forgiving if the cake waits an hour in a warm room for its moment — a real consideration in a Lebanese or Gulf summer.",
        },
        {
          heading: "Timing the reveal",
          body:
            "The most common mistake is bringing the cake out too early. Once it is on the table, everyone knows.",
          items: [
            "Keep the cake out of sight until the moment — a car, a kitchen, a neighbour's flat, a restaurant's back room.",
            "If you are at a restaurant, tell the staff exactly when to bring it out, and give them a signal rather than a time.",
            "Decide who is filming before you start. Ask them to hold one wide shot rather than moving around.",
            "If the cake is being delivered, schedule it before the two of you arrive, not during.",
          ],
        },
        {
          heading: "What to send with it",
          body:
            "A cake on its own is complete. If you want the room to look staged, one addition is enough.",
          items: [
            "Flowers are the natural pairing — a white or blush arrangement beside the cake reads as intentional rather than decorated.",
            'A <a href="/en/blog/balloon-arrangement-ideas">ring balloon</a> or a small cluster of red heart balloons gives the photo a background.',
            "A rose bear if the proposal is at home and you want something that stays afterwards.",
          ],
        },
        {
          body:
            "What not to do: all three. A proposal photographed against a wall of decoration looks like a party, not a question.",
        },
        {
          heading: "How to order a proposal cake",
          body:
            "Custom proposal cakes — piped messages, ring-box designs, toppers — can be made on request. Tell us what you want written and the design you have in mind, and allow a few days' lead time so it can be made properly rather than rushed.",
        },
        {
          body:
            "If you are working to a shorter timeline, the cakes in our range can be ordered with a personalised message through the gift note field at checkout, with same-day delivery when you order before midday. Either way, you can schedule delivery up to 30 days in advance and choose a two-hour window — which matters more here than for any other cake, because a proposal cake that arrives at the wrong moment is not a proposal cake.",
        },
        {
          body:
            "Delivery covers Beirut and across Lebanon, and cakes can be sent together with flowers, balloons or chocolates in the same order.",
        },
        {
          heading: "Frequently asked questions",
          faqItems: CAKE_FOR_PROPOSAL_FAQS,
        },
      ],
      extraJsonLd: [buildFaqPageJsonLd(CAKE_FOR_PROPOSAL_FAQS)],
    },
  },
  "balloon-arrangement-ideas": {
    en: {
      slug: "balloon-arrangement-ideas",
      eyebrow: "Lebanon",
      title: "12 Balloon Arrangement Ideas for Any Occasion | Presentail",
      h1: "Balloon Arrangement Ideas: 12 Ways to Style Balloons for Any Occasion",
      description:
        "Balloon arrangement ideas that actually work — bouquets, columns, garlands, number displays and ceiling clouds, plus how to pick colours and how long each one lasts.",
      dek:
        "Bouquets, columns, garlands, ceiling clouds and number displays — what each one suits, what it costs you in effort, and how long it lasts.",
      geographyLabel: "Lebanon",
      categoryLabel: "Gifting Guides",
      datePublished: "2026-08-25",
      toc: true,
      cta: {
        label: "Shop balloon arrangements",
        path: "/category/balloons",
        country: "lb",
      },
      recommendation: {
        title: "Ready-made balloon bundles",
        body:
          "Sixty arrangements that arrive inflated, weighted and colour-matched — with same-day delivery across Lebanon.",
        label: "View balloons",
        path: "/category/balloons",
        country: "lb",
      },
      relatedSlugs: [
        "balloon-delivery-beirut-lebanon",
        "baby-boy-balloons",
        "best-cakes-lebanon",
      ],
      sections: [
        {
          body:
            "Balloons are the cheapest way to change how a room feels, and the easiest decoration to get slightly wrong. The difference between a party that looks styled and one that looks like someone bought balloons is almost never budget — it is arrangement. Three balloons in the right shape and palette beat twenty in a bunch.\n\nBelow are twelve balloon arrangement ideas, grouped by what they are actually for, with an honest note on effort and lifespan for each. Whether you are building it yourself or ordering a ready-made bundle, the same principles apply.",
        },
        {
          heading: "Before you choose: three decisions that do the work",
          body: "Get these right and almost any arrangement looks intentional.",
          ordered: true,
          items: [
            "Pick three colours, not five. Two base colours plus one metallic is the formula that never fails — think blush, white and gold, or navy, silver and white. More than three and it reads as a children's party regardless of the occasion.",
            "Decide the height. Table-level, standing, or ceiling. Arrangements fail most often when everything sits at the same height and the eye has nothing to follow.",
            "Work out where it lives. A doorway, a table, a wall behind the cake. Balloons need an anchor point; floating them in the middle of a room is what makes a space feel half-decorated.",
          ],
          callout: {
            variant: "info",
            body:
              "Odd numbers look better than even ones. Three, five or seven balloons in a cluster read as designed; four or six read as leftover.",
          },
        },
        {
          heading: "Classic arrangements that work anywhere",
        },
        {
          heading: "1. The balloon bouquet",
          subheading: true,
          body:
            "The default for a reason. Five to seven helium balloons of varying sizes, tied at different lengths and weighted at the base. Mix finishes — two chrome, two plain latex, one printed foil — so the light hits them differently.\n\nThis is the arrangement to send rather than build. A Vibrant Balloon Mix or a set of 6 Gold Chrome Balloons arrives already weighted and ready to place.",
          note: "Effort: none if ordered. Lifespan: helium latex floats 8–12 hours; foil holds for days.",
        },
        {
          heading: "2. The balloon column",
          subheading: true,
          body:
            "Two to four balloons stacked on a weighted pole, usually a metre and a half tall. Columns frame a doorway or flank a cake table, and they read as far more effort than they are. Use air rather than helium — columns are structural, not floating.",
          note: "Effort: moderate. Lifespan: several days.",
        },
        {
          heading: "3. The table centrepiece cluster",
          subheading: true,
          body:
            "Three balloons on short strings, weighted, sitting just above eye level when guests are seated. The key is short — a centrepiece taller than a person's head means nobody can see across the table.",
          note: "Effort: low. Lifespan: one evening on helium.",
          pullQuote:
            "The best balloon arrangement is the one people photograph without being asked to.",
        },
        {
          heading: "Statement pieces for a big moment",
        },
        {
          heading: "4. The number display",
          subheading: true,
          body:
            "Giant foil numbers — an 18th, a 30th, a 50th — flanked by a cluster of coordinating balloons. This is the single most photographed arrangement at any milestone birthday, because it dates the picture and centres the person. Keep the numbers one colour and let the cluster carry the palette.",
          note: "Effort: low. Lifespan: foil numbers hold air for weeks.",
        },
        {
          heading: "5. The organic garland",
          subheading: true,
          body:
            "The curved, uneven arch of mixed-size balloons you have seen behind every cake table on Instagram. It looks improvised and is not: the effect comes from mixing 5-inch, 11-inch and 36-inch balloons in a deliberately irregular rhythm, air-filled, on a strip.",
          note: "Effort: high — budget two hours. Lifespan: several days, longer indoors.",
        },
        {
          heading: "6. The ceiling cloud",
          subheading: true,
          body:
            "Helium balloons released to the ceiling with long ribbons trailing down. Almost no effort, disproportionate impact, and it works especially well in rooms with high ceilings where wall decoration would get lost. Vary the ribbon lengths. Equal lengths look like a mistake.",
          note: "Effort: minimal. Lifespan: one evening.",
        },
        {
          heading: "Small-space and gifting arrangements",
        },
        {
          heading: "7. The single oversized balloon",
          subheading: true,
          body:
            "One 36-inch balloon with a weighted ribbon, in a room that needs one gesture rather than a scheme. Restrained, adult, and the right choice for an office or a small apartment.",
        },
        {
          heading: "8. Balloon-in-a-box",
          subheading: true,
          body:
            "A folded box that opens to release balloons, usually with a gift at the bottom. It converts the arrangement into a moment — which is the whole point when the balloons are the delivery rather than the decoration.",
        },
        {
          heading: "9. Balloons paired with flowers or a cake",
          subheading: true,
          body:
            "The most underrated arrangement. A Happy Birthday Balloon beside a bouquet, or a Congrats Bundle delivered with a cake, does more than either item alone — the balloon supplies the colour and motion, the flowers or cake supply the substance. Order them together so they arrive together.",
        },
        {
          heading: "Themed ideas by occasion",
        },
        {
          heading: "10. New arrivals and baby showers",
          subheading: true,
          body:
            'Pastels, one metallic, and a printed foil that says what the occasion is — a <a href="/en/blog/baby-boy-balloons">baby boy balloons</a> bundle or Baby Girl Bundle anchors the palette so everything else can stay soft. Keep the cluster small and table-height; new parents have limited surfaces and no time to dismantle a garland.',
        },
        {
          heading: "11. Get well and hospital visits",
          subheading: true,
          body:
            "Foil only. Most hospitals do not allow latex, for allergy reasons, and foil holds helium far longer, which matters when someone is in a room for days. A Get Well Soon Bundle in three balloons is the right scale — anything larger becomes a problem for the staff.",
        },
        {
          heading: "12. Anniversaries and proposals",
          subheading: true,
          body:
            "Reds, golds and heart shapes, kept tighter than a birthday arrangement. 4 Red Heart Balloons or Rose Gold and Silver Heart Balloons as a low cluster, or a Gold Ring Balloon Bundle for a proposal. Restraint reads as romance; volume reads as a party.",
        },
        {
          heading: "Helium or air — and how long it all lasts",
          body:
            "The single most common disappointment with balloons is timing, and it comes down to gas.",
          items: [
            "Helium latex floats roughly 8 to 12 hours untreated. Fine for an evening, not for a weekend.",
            "Foil and mylar hold helium for several days and often a week or more, which is why every long-lived arrangement leans on them.",
            "Air-filled arrangements — garlands, columns, anything built on a frame — last for days and do not float at all. If the balloons do not need to rise, use air.",
          ],
        },
        {
          body:
            "Two practical notes for our climate: never leave helium balloons in a hot car or direct sun, since heat expands the gas and pops them, and keep arrangements away from AC vents, which push them around and rub latex until it fails.",
        },
        {
          heading: "The easier route: order the arrangement ready-made",
          body:
            'Everything above can be built. Most of it does not need to be. Ready-made bundles arrive inflated, weighted and coordinated, which removes the two hardest parts — sourcing a helium tank and getting the palette right.\n\nOrder before midday for same-day delivery, or schedule up to 30 days ahead with a two-hour window so the balloons arrive before the guests do rather than during. Delivery covers Beirut and across Lebanon, and balloons can be sent alongside flowers, a cake or chocolates in the same order. See <a href="/en/blog/balloon-delivery-beirut-lebanon">our balloon delivery guide</a> for the delivery details.',
        },
        {
          heading: "Frequently asked questions",
          faqItems: BALLOON_ARRANGEMENT_IDEAS_FAQS,
        },
      ],
      extraJsonLd: [buildFaqPageJsonLd(BALLOON_ARRANGEMENT_IDEAS_FAQS)],
    },
  },
};

// Normalize the shared corpus once so every public localized entry has an
// explicit author while still allowing future articles to provide a named
// person, role, credential, or profile URL. Mutate the authored objects in
// place so untranslated getter aliases retain reference identity.
for (const articlesByLang of Object.values(BLOG_POSTS_COPY)) {
  for (const article of Object.values(articlesByLang)) {
    article.author ??= BLOG_EDITORIAL_TEAM;
  }
}

export const BLOG_POSTS = BLOG_POSTS_COPY;

// ---------------------------------------------------------------------------
// Editorial taxonomy + landing-page metadata
// ---------------------------------------------------------------------------

/**
 * The four editorial categories used by the blog landing page pills and the
 * crawlable blog index. Values are stable slugs — display labels are localized
 * by the consumers (Blog.tsx COPY / seo-inject).
 */
export const BLOG_CATEGORIES = /** @type {const} */ ([
  "flowers",
  "gifting-guides",
  "behind-the-scenes",
  "makers",
]);

/**
 * Curated, bidirectional editorial graph used by the related-article cards.
 *
 * Keep this separate from localized copy so every translated version of an
 * article exposes the same helpful onward reading. Each destination below has
 * two or three thematically relevant inbound article links; this avoids orphan
 * guides while keeping the three-card article module focused.
 */
export const BLOG_RELATED_SLUGS = {
  "gift-baskets-dubai": [
    "inside-spring-sourcing-trip",
    "corporate-gifting-lebanon",
    "send-gifts-to-lebanon-from-gulf",
  ],
  "send-gifts-to-lebanon-from-gulf": [
    "gift-baskets-dubai",
    "what-to-send-when-there-are-no-words",
    "corporate-gifting-lebanon",
  ],
  "flower-shops-in-lebanon": [
    "flower-shop-in-achrafieh",
    "send-gifts-to-lebanon-from-gulf",
    "bouquet-delivery-dubai",
  ],
  "inside-spring-sourcing-trip": [
    "chocolatiers-behind-our-gift-boxes",
    "flower-shop-in-achrafieh",
  ],
  "chocolatiers-behind-our-gift-boxes": [
    "inside-spring-sourcing-trip",
    "gift-shop-in-lebanon",
  ],
  "what-to-send-when-there-are-no-words": [
    "valentines-day-gifts-lebanon",
    "teddy-bear-gifts-lebanon",
    "bouquet-delivery-dubai",
  ],
  "flower-shop-in-achrafieh": [
    "flower-shops-in-lebanon",
    "inside-spring-sourcing-trip",
  ],
  "send-roses-to-lebanon": [
    "flower-shops-in-lebanon",
    "flower-shop-in-achrafieh",
  ],
  "balloon-delivery-beirut-lebanon": [
    "baby-boy-balloons",
    "what-to-send-when-there-are-no-words",
    "balloon-arrangement-ideas",
  ],
  "baby-boy-balloons": [
    "teddy-bear-gifts-lebanon",
    "balloon-delivery-beirut-lebanon",
  ],
  "gift-shop-in-lebanon": [
    "gift-baskets-dubai",
    "chocolatiers-behind-our-gift-boxes",
    "corporate-gifting-lebanon",
  ],
  "corporate-gifting-lebanon": [
    "gift-baskets-dubai",
    "what-to-send-when-there-are-no-words",
    "send-gifts-to-lebanon-from-gulf",
  ],
  "mothers-day-gifts-lebanon": [
    "fathers-day-gifts-lebanon",
    "valentines-day-gifts-lebanon",
  ],
  "fathers-day-gifts-lebanon": [
    "mothers-day-gifts-lebanon",
    "gift-shop-in-lebanon",
    "corporate-gifting-lebanon",
  ],
  "valentines-day-gifts-lebanon": [
    "baby-boy-balloons",
    "gift-shop-in-lebanon",
    "fathers-day-gifts-lebanon",
  ],
  "best-cakes-lebanon": [
    "chocolatiers-behind-our-gift-boxes",
    "fathers-day-gifts-lebanon",
    "balloon-arrangement-ideas",
  ],
  "teddy-bear-gifts-lebanon": [
    "gift-shop-in-lebanon",
    "balloon-delivery-beirut-lebanon",
    "best-cakes-lebanon",
  ],
  "balloon-arrangement-ideas": [
    "balloon-delivery-beirut-lebanon",
    "baby-boy-balloons",
    "best-cakes-lebanon",
  ],
  "cake-for-proposal": [
    "best-cakes-lebanon",
    "balloon-arrangement-ideas",
    "flower-shops-in-lebanon",
  ],
};

/**
 * Locale-independent per-post metadata for the landing page. Kept in a single
 * slug-keyed map (instead of duplicating across the three language entries)
 * so category/featured/readingTime can never drift between locales.
 *
 * - `category`: one of BLOG_CATEGORIES.
 * - `featured`: editors flag exactly one post; getFeaturedBlogSlug falls back
 *   to the newest post when nothing is flagged.
 * - `readingTime`: optional explicit minutes override; when absent it is
 *   computed from the section body text (computeReadingTimeMinutes).
 */
export const BLOG_POST_META = {
  "bouquet-delivery-dubai": { category: "flowers" },
  "send-gifts-to-lebanon-from-gulf": { category: "gifting-guides", readingTime: 7 },
  "inside-spring-sourcing-trip": { category: "behind-the-scenes", featured: true },
  "chocolatiers-behind-our-gift-boxes": { category: "makers" },
  "what-to-send-when-there-are-no-words": { category: "gifting-guides" },
  "flower-shop-in-achrafieh": { category: "flowers" },
  "send-roses-to-lebanon": { category: "flowers" },
  "balloon-delivery-beirut-lebanon": { category: "gifting-guides" },
  "baby-boy-balloons": { category: "gifting-guides" },
  "gift-shop-in-lebanon": { category: "gifting-guides" },
  "corporate-gifting-lebanon": { category: "gifting-guides" },
  "mothers-day-gifts-lebanon": { category: "gifting-guides" },
  "fathers-day-gifts-lebanon": { category: "gifting-guides" },
  "valentines-day-gifts-lebanon": { category: "gifting-guides" },
  "best-cakes-lebanon": { category: "gifting-guides" },
  "teddy-bear-gifts-lebanon": { category: "gifting-guides" },
  "balloon-arrangement-ideas": { category: "gifting-guides" },
  "cake-for-proposal": { category: "gifting-guides" },
};

const BLOG_LANGUAGES = ["en", "ar", "fr"];

/**
 * Return the languages with dedicated blog copy for an article.
 *
 * Some articles expose untranslated languages as getter aliases that return
 * the English article. Those aliases must not be advertised as alternate
 * pages, because their routes intentionally render the English fallback.
 *
 * @param {Record<string, object> | null | undefined} articlesByLang
 * @returns {Array<"en" | "ar" | "fr">}
 */
export function getBlogPostLanguages(articlesByLang) {
  if (!articlesByLang || typeof articlesByLang !== "object") return [];
  const englishArticle = articlesByLang.en;
  return BLOG_LANGUAGES.filter((lang) => {
    const article = articlesByLang[lang];
    return Boolean(article) && (lang === "en" || article !== englishArticle);
  });
}

/** Meta lookup with a safe default so a newly added post never crashes the page. */
export function getBlogPostMeta(slug) {
  return BLOG_POST_META[slug] ?? { category: "flowers" };
}

// Average adult reading speed. Arabic/French word counts via whitespace split
// are close enough for a "N min read" label.
const WORDS_PER_MINUTE = 200;

function countWords(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Compute reading time in whole minutes (min 1) from an article's sections
 * (body paragraphs, list items, and FAQ Q&A text). Used when a post has no
 * explicit `readingTime` in BLOG_POST_META.
 */
export function computeReadingTimeMinutes(sections) {
  let words = 0;
  for (const s of sections ?? []) {
    words += countWords(s.heading);
    words += countWords(s.body);
    words += countWords(s.note);
    for (const item of s.items ?? []) words += countWords(item);
    for (const f of s.faqItems ?? []) {
      words += countWords(f.q) + countWords(f.a);
    }
  }
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Reading time for a slug+lang: explicit meta override, else computed. */
export function getBlogPostReadingTime(slug, lang = "en") {
  const meta = getBlogPostMeta(slug);
  if (Number.isInteger(meta.readingTime) && meta.readingTime > 0) {
    return meta.readingTime;
  }
  const article = BLOG_POSTS[slug]?.[lang] ?? BLOG_POSTS[slug]?.en;
  return computeReadingTimeMinutes(article?.sections);
}

/**
 * Excerpt fallback chain: `description` → first section body (trimmed to
 * ~160 chars on a word boundary) → empty string.
 */
export function getBlogPostExcerpt(article) {
  if (!article) return "";
  const desc = (article.description ?? "").trim();
  if (desc) return desc;
  const firstBody = (article.sections ?? []).find((s) => s.body)?.body ?? "";
  const text = String(firstBody).trim();
  if (text.length <= 160) return text;
  const cut = text.slice(0, 160);
  return cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 160) + "…";
}

/**
 * The featured post slug: the first slug flagged `featured: true` in
 * BLOG_POST_META, falling back to the newest post by datePublished (en).
 */
export function getFeaturedBlogSlug() {
  const flagged = Object.keys(BLOG_POSTS).find(
    (slug) => BLOG_POST_META[slug]?.featured === true,
  );
  if (flagged) return flagged;
  return Object.keys(BLOG_POSTS)
    .slice()
    .sort((a, b) => {
      const da = BLOG_POSTS[a]?.en?.datePublished ?? "";
      const db = BLOG_POSTS[b]?.en?.datePublished ?? "";
      return da < db ? 1 : da > db ? -1 : 0;
    })[0];
}

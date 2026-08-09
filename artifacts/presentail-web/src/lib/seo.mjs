// Central SEO template + builder module (single source of truth).
//
// This file is authored as plain ESM (.mjs) on purpose: it is consumed by BOTH
//   - the server-side injector `seo-inject.mjs` (run by Node in production and
//     by the Vite dev plugin), which cannot import TypeScript at runtime, and
//   - the client `SeoHead.tsx` component (via the typed facade `seo.ts`).
//
// All page-type copy (titles / descriptions / OG / Twitter) for EN, AR and FR
// lives here so a copy change only ever touches one file. `seo.ts` re-exports
// everything with TypeScript types (see `seo.d.mts`).
//
// Templates use `{city}` and `{country}` placeholders, filled by `formatTemplate`.

export const SUPPORTED_LANGS = ["en", "ar", "fr"];

export const OG_LOCALE = { en: "en_US", ar: "ar_AE", fr: "fr_FR" };

export const OG_LOCALE_COUNTRY = {
  en: { ae: "en_US", lb: "en_US", cy: "en_US" },
  ar: { ae: "ar_AE", lb: "ar_LB", cy: "ar_CY" },
  fr: { ae: "fr_FR", lb: "fr_FR", cy: "fr_FR" },
};

// Public social profiles, surfaced as Organization `sameAs` links in JSON-LD.
export const SEO_SOCIAL_LINKS = [
  "https://www.instagram.com/presentail",
  "https://www.facebook.com/presentail",
  "https://www.tiktok.com/@presentail",
];

export const COUNTRY_NAMES = {
  en: { ae: "the UAE", lb: "Lebanon", cy: "Cyprus" },
  ar: {
    ae: "الإمارات العربية المتحدة",
    lb: "لبنان",
    cy: "قبرص",
  },
  fr: { ae: "Émirats arabes unis", lb: "Liban", cy: "Chypre" },
};

// Plain English-style country names (no leading article) for use inside
// LocalBusiness schema `addressCountry`.
export const COUNTRY_PLAIN_NAMES = {
  en: { ae: "United Arab Emirates", lb: "Lebanon", cy: "Cyprus" },
  ar: {
    ae: "الإمارات العربية المتحدة",
    lb: "لبنان",
    cy: "قبرص",
  },
  fr: { ae: "Émirats arabes unis", lb: "Liban", cy: "Chypre" },
};

export const CITY_NAMES = {
  en: {
    "ae-dubai": "Dubai",
    "ae-abu-dhabi": "Abu Dhabi",
    "ae-sharjah": "Sharjah",
    "ae-ajman": "Ajman",
    "ae-ras-al-khaimah": "Ras Al Khaimah",
    "ae-fujairah": "Fujairah",
    "ae-umm-al-quwain": "Umm Al Quwain",
    "lb-akkar": "Akkar",
    "lb-aley": "Aley",
    "lb-baabda": "Baabda",
    "lb-baalbeck": "Baalbeck",
    "lb-batroun": "Batroun",
    "lb-bcharee": "Bcharre",
    "lb-beirut": "Beirut",
    "lb-bent-jbeil": "Bint Jbeil",
    "lb-chouf": "Chouf",
    "lb-hasbaya": "Hasbaya",
    "lb-hermel": "Hermel",
    "lb-jbeil": "Jbeil",
    "lb-jezzine": "Jezzine",
    "lb-kesserwan": "Kesserwan",
    "lb-koura": "Koura",
    "lb-marjayoun": "Marjayoun",
    "lb-metn": "Metn",
    "lb-minnieh-dennaya": "Minnieh-Denniyeh",
    "lb-nabatieh": "Nabatieh",
    "lb-rechaya": "Rachaya",
    "lb-saida": "Saida",
    "lb-tripoli": "Tripoli",
    "lb-tyre": "Tyre",
    "lb-west-bekaa": "West Bekaa",
    "lb-zahle": "Zahle",
    "lb-zghorta": "Zgharta",
    "cy-nicosia": "Nicosia",
    "cy-limassol": "Limassol",
    "cy-larnaca": "Larnaca",
    "cy-paphos": "Paphos",
  },
  ar: {
    "ae-dubai": "دبي",
    "ae-abu-dhabi": "أبو ظبي",
    "ae-sharjah": "الشارقة",
    "ae-ajman": "عجمان",
    "ae-ras-al-khaimah": "رأس الخيمة",
    "ae-fujairah": "الفجيرة",
    "ae-umm-al-quwain": "أم القيوين",
    "lb-akkar": "عكار",
    "lb-aley": "عاليه",
    "lb-baabda": "بعبدا",
    "lb-baalbeck": "بعلبك",
    "lb-batroun": "البترون",
    "lb-bcharee": "بشري",
    "lb-beirut": "بيروت",
    "lb-bent-jbeil": "بنت جبيل",
    "lb-chouf": "الشوف",
    "lb-hasbaya": "حاصبيا",
    "lb-hermel": "الهرمل",
    "lb-jbeil": "جبيل",
    "lb-jezzine": "جزين",
    "lb-kesserwan": "كسروان",
    "lb-koura": "الكورة",
    "lb-marjayoun": "مرجعيون",
    "lb-metn": "المتن",
    "lb-minnieh-dennaya": "المنية-الضنية",
    "lb-nabatieh": "النبطية",
    "lb-rechaya": "راشيا",
    "lb-saida": "صيدا",
    "lb-tripoli": "طرابلس",
    "lb-tyre": "صور",
    "lb-west-bekaa": "البقاع الغربي",
    "lb-zahle": "زحلة",
    "lb-zghorta": "زغرتا",
    "cy-nicosia": "نيقوسيا",
    "cy-limassol": "ليماسول",
    "cy-larnaca": "لارنكا",
    "cy-paphos": "بافوس",
  },
  fr: {
    "ae-dubai": "Dubaï",
    "ae-abu-dhabi": "Abou Dhabi",
    "ae-sharjah": "Charjah",
    "ae-ajman": "Ajman",
    "ae-ras-al-khaimah": "Ras el Khaïmah",
    "ae-fujairah": "Foujaïrah",
    "ae-umm-al-quwain": "Oumm al Qaïwaïn",
    "lb-akkar": "Akkar",
    "lb-aley": "Aley",
    "lb-baabda": "Baabda",
    "lb-baalbeck": "Baalbeck",
    "lb-batroun": "Batroun",
    "lb-bcharee": "Bcharré",
    "lb-beirut": "Beyrouth",
    "lb-bent-jbeil": "Bint Jbeil",
    "lb-chouf": "Chouf",
    "lb-hasbaya": "Hasbaya",
    "lb-hermel": "Hermel",
    "lb-jbeil": "Jbeil",
    "lb-jezzine": "Jezzine",
    "lb-kesserwan": "Kesserwan",
    "lb-koura": "Koura",
    "lb-marjayoun": "Marjayoun",
    "lb-metn": "Metn",
    "lb-minnieh-dennaya": "Minnieh-Denniyeh",
    "lb-nabatieh": "Nabatieh",
    "lb-rechaya": "Rachaya",
    "lb-saida": "Saïda",
    "lb-tripoli": "Tripoli",
    "lb-tyre": "Tyr",
    "lb-west-bekaa": "Bekaa occidental",
    "lb-zahle": "Zahlé",
    "lb-zghorta": "Zgharta",
    "cy-nicosia": "Nicosie",
    "cy-limassol": "Limassol",
    "cy-larnaca": "Larnaca",
    "cy-paphos": "Paphos",
  },
};

export const TITLES = {
  en: {
    landing: "Online Flower & Gift Delivery | Presentail",
    home: "Flower & Gift Delivery in {city} | Presentail",
    shop: "Shop Flowers & Gifts in {city} | Presentail",
    bestSellers: "Best Sellers in {city} | Presentail",
    product: "Gift Delivery in {city} | Presentail",
    allOccasions: "Shop by Occasion in {city} | Presentail",
    brands: "Partner Brands in {city} | Presentail",
    brand: "Brand Collection in {city} | Presentail",
    occasions: "Shop by Occasion in {city} | Presentail",
    occasion: "Gift Delivery in {city} | Presentail",
    category: "Gift Delivery in {city} | Presentail",
    blogPost: "The Atelier Journal | Presentail",
    cart: "Your Bag | Presentail",
    checkout: "Checkout | Presentail",
    orderConfirmed: "Order Confirmed | Presentail",
    auth: "Sign In | Presentail",
    account: "My Account | Presentail",
    favorites: "My Favorites | Presentail",
    careers: "Careers at Presentail | Flower & Gift Delivery Jobs",
    blog: "The Atelier Journal | Presentail",
    partner: "Partner with Presentail | Brand & Supplier Partnerships",
    weddings: "Wedding Flowers in {city} | Presentail",
    corporate: "Corporate Gifting in {city} | Presentail",
    contact: "Contact Presentail in {city} | Gift Delivery Help",
    faqs: "Flower Delivery FAQs in {city} | Presentail",
    terms: "Terms of Use | Presentail",
    privacy: "Privacy Policy | Presentail",
    "return-policy": "Return Policy | Presentail",
    "shipping-policy": "Shipping & Delivery Policy | Presentail",
    "account-deletion": "Account Deletion Policy | Presentail",
  },
  ar: {
    landing: "توصيل الأزهار والهدايا أونلاين | Presentail",
    home: "توصيل الأزهار والهدايا في {city} | Presentail",
    shop: "تسوّق الأزهار والهدايا في {city} | Presentail",
    bestSellers: "الأكثر مبيعاً في {city} | Presentail",
    product: "توصيل الهدايا في {city} | Presentail",
    allOccasions: "تسوّق حسب المناسبة في {city} | Presentail",
    brands: "العلامات الشريكة في {city} | Presentail",
    brand: "مجموعة العلامة في {city} | Presentail",
    occasions: "تسوّق حسب المناسبة في {city} | Presentail",
    occasion: "توصيل الهدايا في {city} | Presentail",
    category: "توصيل الهدايا في {city} | Presentail",
    blogPost: "يوميّات الأتيليه | Presentail",
    cart: "حقيبتك | Presentail",
    checkout: "الدفع | Presentail",
    orderConfirmed: "تم تأكيد الطلب | Presentail",
    auth: "تسجيل الدخول | Presentail",
    account: "حسابي | Presentail",
    favorites: "مفضّلاتي | Presentail",
    about: "عن بريزانتيل | الأزهار والهدايا الفاخرة",
    careers: "الوظائف في بريزانتيل | وظائف توصيل الأزهار والهدايا",
    blog: "يوميّات الأتيليه | Presentail",
    partner: "كن شريكاً مع Presentail | شراكات العلامات والموردين",
    weddings: "زهور الزفاف في {city} | Presentail",
    corporate: "الإهداء للشركات في {city} | Presentail",
    contact: "تواصل مع Presentail في {city} | دعم التوصيل",
    faqs: "أسئلة توصيل الزهور في {city} | Presentail",
    terms: "شروط الاستخدام | Presentail",
    privacy: "سياسة الخصوصية | Presentail",
    "return-policy": "سياسة الإرجاع | Presentail",
    "shipping-policy": "سياسة الشحن والتوصيل | Presentail",
    "account-deletion": "سياسة حذف الحساب | Presentail",
  },
  fr: {
    landing: "Livraison de fleurs et cadeaux en ligne | Presentail",
    home: "Livraison de fleurs et cadeaux à {city} | Presentail",
    shop: "Boutique fleurs et cadeaux à {city} | Presentail",
    bestSellers: "Meilleures ventes à {city} | Presentail",
    product: "Livraison de cadeaux à {city} | Presentail",
    allOccasions: "Acheter par occasion à {city} | Presentail",
    brands: "Marques partenaires à {city} | Presentail",
    brand: "Collection de la marque à {city} | Presentail",
    occasions: "Acheter par occasion à {city} | Presentail",
    occasion: "Livraison de cadeaux à {city} | Presentail",
    category: "Livraison de cadeaux à {city} | Presentail",
    blogPost: "Le Journal de l'Atelier | Presentail",
    cart: "Votre sac | Presentail",
    checkout: "Paiement | Presentail",
    orderConfirmed: "Commande confirmée | Presentail",
    auth: "Connexion | Presentail",
    account: "Mon compte | Presentail",
    favorites: "Mes favoris | Presentail",
    about: "À propos de Presentail | Fleurs et cadeaux de luxe",
    careers: "Carrières chez Presentail | Emplois livraison fleurs et cadeaux",
    blog: "Le Journal de l'Atelier | Presentail",
    partner: "Partenaire de Presentail | Partenariats marques et fournisseurs",
    weddings: "Fleurs de mariage à {city} | Presentail",
    corporate: "Cadeaux d'entreprise à {city} | Presentail",
    contact: "Contacter Presentail à {city} | Aide livraison",
    faqs: "FAQ livraison de fleurs à {city} | Presentail",
    terms: "Conditions d'utilisation | Presentail",
    privacy: "Politique de confidentialité | Presentail",
    "return-policy": "Politique de retour | Presentail",
    "shipping-policy": "Politique de livraison | Presentail",
    "account-deletion": "Politique de suppression de compte | Presentail",
  },
};

// Separate OG and Twitter copy for the landing page only.
// All other routes reuse the page title/description for og:/twitter: tags.
export const LANDING_OG = {
  en: {
    title: "Online Flower & Gift Delivery | Presentail",
    description: "Order flowers, cakes, balloons and gifts online with Presentail. Express same-day delivery available in Lebanon, UAE, and Cyprus.",
  },
  ar: {
    title: "توصيل الزهور والهدايا أونلاين | Presentail",
    description: "اطلب الزهور والكعك والبالونات والهدايا أونلاين مع Presentail. توصيل سريع في اليوم نفسه في لبنان والإمارات وقبرص.",
  },
  fr: {
    title: "Livraison de fleurs et cadeaux en ligne | Presentail",
    description: "Commandez fleurs, gâteaux, ballons et cadeaux en ligne avec Presentail. Livraison express le jour même disponible au Liban, aux Émirats et à Chypre.",
  },
};

export const LANDING_TWITTER = {
  en: {
    title: "Online Flower & Gift Delivery | Presentail",
    description: "Send flowers and gifts online with Presentail. Express same-day delivery in Lebanon, UAE, and Cyprus.",
  },
  ar: {
    title: "توصيل الزهور والهدايا أونلاين | Presentail",
    description: "أرسل الزهور والهدايا أونلاين مع Presentail. توصيل سريع في اليوم نفسه في لبنان والإمارات وقبرص.",
  },
  fr: {
    title: "Livraison de fleurs et cadeaux en ligne | Presentail",
    description: "Envoyez fleurs et cadeaux en ligne avec Presentail. Livraison express le jour même au Liban, aux Émirats et à Chypre.",
  },
};

// Separate OG and Twitter copy for the locale-prefixed homepage (routeKey
// "home", e.g. /en-lb/beirut). Shorter, more share-friendly than the page
// title/description. Uses {city} placeholders resolved via formatTemplate().
export const HOME_OG = {
  en: {
    title: "Flowers & Gifts in {city} | Presentail",
    description: "Send flowers, cakes and gifts in {city} with same-day delivery from Presentail.",
  },
  ar: {
    title: "الأزهار والهدايا في {city} | Presentail",
    description: "أرسل الأزهار والكعك والهدايا في {city} مع توصيل في نفس اليوم من Presentail.",
  },
  fr: {
    title: "Fleurs et cadeaux à {city} | Presentail",
    description: "Envoyez fleurs, gâteaux et cadeaux à {city} avec la livraison le jour même par Presentail.",
  },
};

export const HOME_TWITTER = {
  en: {
    title: "Flowers & Gifts in {city} | Presentail",
    description: "Send flowers and gifts in {city} — same-day delivery by Presentail.",
  },
  ar: {
    title: "الأزهار والهدايا في {city} | Presentail",
    description: "أرسل الأزهار والهدايا في {city} — توصيل في نفس اليوم من Presentail.",
  },
  fr: {
    title: "Fleurs et cadeaux à {city} | Presentail",
    description: "Envoyez fleurs et cadeaux à {city} — livraison le jour même par Presentail.",
  },
};

// Separate OG and Twitter copy for the generic browse routes (Shop, Brands,
// All Occasions, Category). Shorter, more share-friendly than the page
// title/description. Keyed by routeKey, then lang. Uses {city} placeholders
// resolved via format(). Server routeKey for /occasions is "occasions";
// client routeKey is "allOccasions" — both read from seo.ts where keys are
// consistent. The category entry only applies when the per-entity category
// lookup fails and computeSeoHead falls back to the generic head — category
// routes always carry a slug, so the success path uses buildCategoryHead.
export const GENERIC_OG = {
  shop: {
    en: {
      title: "Shop Flowers & Gifts in {city} | Presentail",
      description: "Browse curated bouquets, cakes and luxury gifts in {city} with same-day delivery from Presentail.",
    },
    ar: {
      title: "تسوّق الأزهار والهدايا في {city} | Presentail",
      description: "تصفّح الباقات المنتقاة والكعك والهدايا الفاخرة في {city} مع توصيل في نفس اليوم من Presentail.",
    },
    fr: {
      title: "Boutique fleurs et cadeaux à {city} | Presentail",
      description: "Parcourez bouquets, gâteaux et cadeaux de luxe à {city} avec la livraison le jour même par Presentail.",
    },
  },
  brands: {
    en: {
      title: "Partner Brands in {city} | Presentail",
      description: "Discover Presentail's hand-picked partner brands delivering in {city}.",
    },
    ar: {
      title: "العلامات الشريكة في {city} | Presentail",
      description: "اكتشف العلامات الشريكة المنتقاة من Presentail والمتاحة للتوصيل في {city}.",
    },
    fr: {
      title: "Marques partenaires à {city} | Presentail",
      description: "Découvrez les marques partenaires sélectionnées par Presentail, disponibles à {city}.",
    },
  },
  occasions: {
    en: {
      title: "Shop by Occasion in {city} | Presentail",
      description: "Find the perfect gift for any occasion in {city} with same-day delivery from Presentail.",
    },
    ar: {
      title: "تسوّق حسب المناسبة في {city} | Presentail",
      description: "اعثر على الهدية المثالية لكل مناسبة في {city} مع توصيل في نفس اليوم من Presentail.",
    },
    fr: {
      title: "Acheter par occasion à {city} | Presentail",
      description: "Trouvez le cadeau idéal pour chaque occasion à {city} avec la livraison le jour même par Presentail.",
    },
  },
  category: {
    en: {
      title: "Shop Gifts by Category in {city} | Presentail",
      description: "Browse Presentail's gift categories in {city} with same-day delivery.",
    },
    ar: {
      title: "تسوّق الهدايا حسب الفئة في {city} | Presentail",
      description: "تصفّح فئات الهدايا من Presentail في {city} مع توصيل في نفس اليوم.",
    },
    fr: {
      title: "Acheter des cadeaux par catégorie à {city} | Presentail",
      description: "Parcourez les catégories de cadeaux Presentail à {city} avec la livraison le jour même.",
    },
  },
};

export const GENERIC_TWITTER = {
  shop: {
    en: {
      title: "Shop Flowers & Gifts in {city} | Presentail",
      description: "Shop flowers, cakes and gifts in {city} — same-day delivery by Presentail.",
    },
    ar: {
      title: "تسوّق الأزهار والهدايا في {city} | Presentail",
      description: "تسوّق الأزهار والكعك والهدايا في {city} — توصيل في نفس اليوم من Presentail.",
    },
    fr: {
      title: "Boutique fleurs et cadeaux à {city} | Presentail",
      description: "Fleurs, gâteaux et cadeaux à {city} — livraison le jour même par Presentail.",
    },
  },
  brands: {
    en: {
      title: "Partner Brands in {city} | Presentail",
      description: "Explore our hand-picked partner brands in {city} — delivered by Presentail.",
    },
    ar: {
      title: "العلامات الشريكة في {city} | Presentail",
      description: "استكشف علاماتنا الشريكة المنتقاة في {city} — توصيل من Presentail.",
    },
    fr: {
      title: "Marques partenaires à {city} | Presentail",
      description: "Explorez nos marques partenaires à {city} — livrées par Presentail.",
    },
  },
  occasions: {
    en: {
      title: "Shop by Occasion in {city} | Presentail",
      description: "Gifts for every occasion in {city} — same-day delivery by Presentail.",
    },
    ar: {
      title: "تسوّق حسب المناسبة في {city} | Presentail",
      description: "هدايا لكل مناسبة في {city} — توصيل في نفس اليوم من Presentail.",
    },
    fr: {
      title: "Acheter par occasion à {city} | Presentail",
      description: "Des cadeaux pour chaque occasion à {city} — livraison le jour même par Presentail.",
    },
  },
  category: {
    en: {
      title: "Shop Gifts by Category in {city} | Presentail",
      description: "Browse gifts by category in {city} — same-day delivery by Presentail.",
    },
    ar: {
      title: "تسوّق الهدايا حسب الفئة في {city} | Presentail",
      description: "تصفّح الهدايا حسب الفئة في {city} — توصيل في نفس اليوم من Presentail.",
    },
    fr: {
      title: "Acheter des cadeaux par catégorie à {city} | Presentail",
      description: "Parcourez les cadeaux par catégorie à {city} — livraison le jour même par Presentail.",
    },
  },
};

export const DESCRIPTIONS = {
  en: {
    landing:
      "Send flowers, cakes, balloons, plants, chocolates and more gifts online with Presentail. Express same-day delivery available in Lebanon, UAE, and Cyprus.",
    home: "Send flowers, cakes, balloons, plants, chocolates and gifts online in {city}. Express same-day delivery available with Presentail.",
    shop: "Browse Presentail's curated bouquets, cakes and luxury gifts for delivery in {city}, {country}.",
    bestSellers: "Discover Presentail's best-selling bouquets, cakes and luxury gifts for delivery in {city}, {country}.",
    product: "Order this gift for delivery in {city}, {country} with Presentail.",
    allOccasions:
      "Browse all occasions — birthdays, anniversaries, weddings and more — and find the perfect gift for delivery in {city}, {country}.",
    brands:
      "Discover Presentail's hand-picked partner brands available for delivery in {city}, {country}.",
    brand: "Shop this brand's full collection for delivery in {city}, {country} on Presentail.",
    occasions: "Browse gifts by occasion in {city}, {country} — birthdays, anniversaries, weddings, sympathy, and more on Presentail.",
    occasion: "Shop the perfect gift for this occasion in {city}, {country} with same-day delivery from Presentail.",
    category: "Order from this gift category for delivery in {city}, {country} with Presentail.",
    blogPost: "Read the latest stories, seasonal sourcing guides, and gifting inspiration from the Presentail editorial team.",
    cart: "Review your Presentail bag and proceed to a secure checkout.",
    checkout:
      "Complete your Presentail order with secure card, PayPal or Mamo payment.",
    orderConfirmed: "Thank you — your Presentail order has been confirmed.",
    auth: "Sign in or create a Presentail account to manage orders and addresses.",
    account: "Manage your Presentail profile, orders and saved addresses.",
    favorites: "View and manage your saved Presentail gifts and favorites.",
    about: "Presentail is a luxury flower and gift atelier delivering across Lebanon, the UAE and Cyprus. Meet the team and the craft behind every send.",
    careers: "Join the Presentail team — we're hiring florists, designers, and engineers to build the most thoughtful gifting experience across Lebanon, the UAE and Cyprus.",
    blog: "Notes from the Presentail studio: seasonal sourcing, partner makers, and gifting guides for life's most meaningful moments.",
    partner: "Partner with Presentail to bring your brand to luxury gifting customers across Lebanon, the UAE and Cyprus — florists, chocolatiers and lifestyle ateliers welcome.",
    weddings: "Bespoke floral design and styling for weddings and private events in {city} by the Presentail atelier, with same-day guest gift delivery.",
    corporate: "Corporate gifting programmes from Presentail in {city} — curated client and team gifts at scale, with branded packaging and consolidated invoicing.",
    contact: "Contact the Presentail concierge in {city} for order support, delivery tracking, custom requests, and partnership enquiries.",
    faqs: "Answers to common questions about Presentail flower and gift delivery in {city}, including delivery windows, payment options, cancellations and returns.",
    terms: "The Terms of Use that govern your purchase and use of the Presentail website, mobile apps and services.",
    privacy: "How Presentail collects, uses and protects your personal information across our website, mobile apps and social channels.",
    "return-policy": "Presentail's return and satisfaction-guarantee policy — how to request a return, our 7-day photo window, and what's covered.",
    "shipping-policy": "How Presentail delivers flowers and gifts across Lebanon, the UAE and Cyprus — delivery windows, same-day options, and cut-off times.",
    "account-deletion": "How to delete your Presentail account in-app or by email, what data is erased, and the 15-day processing window.",
  },
  ar: {
    landing:
      "أرسل الزهور والكعك والبالونات والنباتات والشوكولاتة والمزيد من الهدايا أونلاين مع Presentail. توصيل سريع في اليوم نفسه في لبنان والإمارات وقبرص.",
    home: "أرسل الأزهار والكعك والبالونات والنباتات والشوكولاتة والهدايا أونلاين في {city}. توصيل سريع في نفس اليوم متاح مع Presentail.",
    shop: "تصفّح باقات Presentail المنتقاة والكعك والهدايا الفاخرة للتوصيل في {city}، {country}.",
    product: "اطلب هذه الهدية للتوصيل في {city}، {country} مع Presentail.",
    allOccasions:
      "تصفّح جميع المناسبات — أعياد الميلاد والذكرى السنوية وحفلات الزفاف والمزيد — وابحث عن الهدية المثالية للتوصيل في {city}، {country}.",
    brands:
      "اكتشف العلامات الشريكة المنتقاة من Presentail والمتاحة للتوصيل في {city}، {country}.",
    brand: "تسوّق المجموعة الكاملة لهذه العلامة للتوصيل في {city}، {country} عبر Presentail.",
    bestSellers: "اكتشف باقات Presentail وكعكها وهداياها الفاخرة الأكثر مبيعاً للتوصيل في {city}، {country}.",
    occasions: "تصفّح الهدايا حسب المناسبة في {city}، {country} — أعياد الميلاد والذكريات والأعراس والتعازي والمزيد.",
    occasion: "تسوّق الهدية المثالية لهذه المناسبة في {city}، {country} مع توصيل في نفس اليوم من Presentail.",
    category: "اطلب من هذه الفئة للتوصيل في {city}، {country} مع Presentail.",
    blogPost: "اقرأ أحدث قصص وأدلّة الإهداء الموسمي والإلهام من الفريق التحريري لبريزانتيل.",
    cart: "راجع حقيبة Presentail وتابع إلى الدفع الآمن.",
    checkout: "أكمل طلب Presentail عبر الدفع الآمن بالبطاقة أو PayPal أو Mamo.",
    orderConfirmed: "شكراً لك — تم تأكيد طلب Presentail الخاص بك.",
    auth: "سجّل الدخول أو أنشئ حساب Presentail لإدارة الطلبات والعناوين.",
    account: "أدر بيانات حساب Presentail والطلبات والعناوين المحفوظة.",
    favorites: "اعرض وأدر هدايا Presentail المحفوظة ومفضّلاتك.",
    about: "بريزانتيل أتيليه فاخر للأزهار والهدايا، يوصّل في لبنان والإمارات وقبرص. تعرّف على الفريق والحرفة وراء كل هدية.",
    careers: "انضم إلى فريق بريزانتيل — نوظّف منسّقي أزهار ومصمّمين ومهندسين لبناء أكثر تجارب الإهداء عناية في لبنان والإمارات وقبرص.",
    blog: "ملاحظات من استوديو بريزانتيل: مصادر موسمية، صنّاع شركاء، وأدلّة إهداء لأهمّ لحظات الحياة.",
    partner: "كن شريكاً مع بريزانتيل لتقديم علامتك إلى عملاء الإهداء الفاخر في لبنان والإمارات وقبرص — منسّقو أزهار وصنّاع شوكولاتة وأتيليهات نمط حياة.",
    weddings: "تصميم وتنسيق زهور بريزانتيل المخصّص للأعراس والمناسبات الخاصّة في {city}، مع توصيل هدايا الضيوف في نفس اليوم.",
    corporate: "برامج الإهداء للشركات من بريزانتيل في {city} — هدايا منتقاة للعملاء والفِرَق على نطاق واسع مع تغليف مخصّص وفوترة موحّدة.",
    contact: "تواصل مع كونسيرج Presentail في {city} لدعم الطلبات وتتبع التوصيل والطلبات الخاصة واستفسارات الشراكة.",
    faqs: "إجابات على أبرز الأسئلة حول توصيل الأزهار والهدايا من Presentail في {city}، تشمل مواعيد التوصيل وخيارات الدفع والإلغاء والمرتجعات.",
    terms: "شروط الاستخدام التي تحكم شراءك واستخدامك لموقع بريزانتيل وتطبيقاته وخدماته.",
    privacy: "كيف تجمع بريزانتيل معلوماتك الشخصية وتستخدمها وتحميها عبر الموقع والتطبيقات والقنوات الاجتماعية.",
    "return-policy": "سياسة الإرجاع وضمان الرضا من Presentail — كيفية طلب الإرجاع، نافذة الـ7 أيام لإرسال الصورة، وما يشمله الضمان.",
    "shipping-policy": "كيف توصّل Presentail الأزهار والهدايا في لبنان والإمارات وقبرص — مواعيد التوصيل وخيارات نفس اليوم وأوقات الإغلاق.",
    "account-deletion": "كيفية حذف حسابك في Presentail من داخل التطبيق أو عبر البريد الإلكتروني، والبيانات التي تُمسح، ومهلة المعالجة البالغة 15 يوماً.",
  },
  fr: {
    landing:
      "Envoyez des fleurs, des gâteaux, des ballons, des plantes, des chocolats et plus encore avec Presentail. Livraison express le jour même disponible au Liban, aux Émirats et à Chypre.",
    home: "Envoyez fleurs, gâteaux, ballons, plantes, chocolats et cadeaux en ligne à {city}. Livraison express le jour même disponible avec Presentail.",
    shop: "Parcourez les bouquets, gâteaux et cadeaux de luxe Presentail pour livraison à {city}, {country}.",
    bestSellers: "Découvrez les bouquets, gâteaux et cadeaux de luxe les plus vendus de Presentail pour livraison à {city}, {country}.",
    product: "Commandez ce cadeau pour livraison à {city}, {country} avec Presentail.",
    allOccasions:
      "Parcourez toutes les occasions — anniversaires, mariages et plus encore — et trouvez le cadeau idéal pour livraison à {city}, {country}.",
    brands:
      "Découvrez les marques partenaires sélectionnées par Presentail, disponibles à la livraison à {city}, {country}.",
    brand: "Achetez la collection complète de cette marque pour livraison à {city}, {country} sur Presentail.",
    occasions: "Parcourez les cadeaux par occasion à {city}, {country} — anniversaires, mariages, condoléances et plus encore.",
    occasion: "Trouvez le cadeau idéal pour cette occasion à {city}, {country} avec livraison le jour même par Presentail.",
    category: "Commandez dans cette catégorie de cadeaux pour livraison à {city}, {country} avec Presentail.",
    blogPost: "Lisez les dernières histoires, guides de saison et inspirations cadeaux de l'équipe éditoriale Presentail.",
    cart: "Revoyez votre sac Presentail et passez au paiement sécurisé.",
    checkout:
      "Finalisez votre commande Presentail par carte, PayPal ou Mamo en toute sécurité.",
    orderConfirmed: "Merci — votre commande Presentail a été confirmée.",
    auth: "Connectez-vous ou créez un compte Presentail pour gérer vos commandes et adresses.",
    account: "Gérez votre profil Presentail, vos commandes et vos adresses enregistrées.",
    favorites: "Consultez et gérez vos cadeaux et favoris Presentail enregistrés.",
    about: "Presentail est un atelier de fleurs et cadeaux de luxe livrant au Liban, aux Émirats arabes unis et à Chypre. Découvrez l'équipe et le savoir-faire derrière chaque envoi.",
    careers: "Rejoignez l'équipe Presentail — nous recrutons fleuristes, designers et ingénieurs pour bâtir la plus belle expérience cadeau au Liban, aux Émirats et à Chypre.",
    blog: "Notes du studio Presentail : sourcing de saison, artisans partenaires et guides cadeaux pour les moments qui comptent.",
    partner: "Devenez partenaire de Presentail pour présenter votre marque aux clients du cadeau de luxe au Liban, aux Émirats et à Chypre — fleuristes, chocolatiers et ateliers bienvenus.",
    weddings: "Design et stylisme floraux sur mesure pour mariages et événements privés à {city} par l'atelier Presentail, avec livraison cadeaux invités le jour J.",
    corporate: "Programmes de cadeaux d'entreprise Presentail à {city} — sélections raffinées pour clients et équipes, emballage de marque et facturation consolidée.",
    contact: "Contactez la conciergerie Presentail à {city} pour le suivi de commande, les livraisons, les demandes sur mesure et les partenariats.",
    faqs: "Réponses aux questions fréquentes sur la livraison de fleurs et cadeaux Presentail à {city} — délais, paiement, annulations et retours.",
    terms: "Les Conditions d'utilisation qui régissent vos achats et votre utilisation du site, des applications et des services Presentail.",
    privacy: "Comment Presentail collecte, utilise et protège vos informations personnelles sur le site, les applications et les canaux sociaux.",
    "return-policy": "La politique de retour et de garantie de satisfaction de Presentail — comment demander un retour, notre fenêtre de 7 jours et ce qui est couvert.",
    "shipping-policy": "Comment Presentail livre fleurs et cadeaux au Liban, aux Émirats et à Chypre — délais de livraison, options le jour même et heures limites.",
    "account-deletion": "Comment supprimer votre compte Presentail depuis l'application ou par e-mail, les données effacées et le délai de traitement de 15 jours.",
  },
};

// Entity-specific templates (filled with the live entity `{name}` + `{city}`).
// These power product / category / occasion pages where the title and
// description are built from the fetched entity name.
export const ENTITY_TITLES = {
  product: {
    en: "{name} — {city} | Presentail",
    ar: "{name} — {city} | Presentail",
    fr: "{name} — {city} | Presentail",
  },
  category: {
    en: "{name} Delivery in {city} | Presentail",
    ar: "توصيل {name} في {city} | Presentail",
    fr: "Livraison de {name} à {city} | Presentail",
  },
  occasion: {
    en: "{name} Flowers & Gifts in {city} | Presentail",
    ar: "زهور وهدايا {name} في {city} | Presentail",
    fr: "Fleurs et cadeaux {name} à {city} | Presentail",
  },
};

// No-city fallback titles (bare/legacy paths without a locale-prefixed city).
export const ENTITY_TITLES_NO_CITY = {
  product: { en: "{name} | Presentail", ar: "{name} | Presentail", fr: "{name} | Presentail" },
  category: { en: "{name} | Presentail", ar: "{name} | Presentail", fr: "{name} | Presentail" },
  occasion: { en: "{name} | Presentail", ar: "{name} | Presentail", fr: "{name} | Presentail" },
};

export const ENTITY_DESCRIPTIONS = {
  product: {
    en: "Order {name} online in {city}. Send it with Presentail for fast, reliable gift delivery.",
    ar: "اطلب {name} أونلاين في {city}. أرسلها مع Presentail لتوصيل هدايا سريع وموثوق.",
    fr: "Commandez {name} en ligne à {city}. Envoyez-le avec Presentail pour une livraison de cadeaux rapide et fiable.",
  },
  category: {
    en: "Shop {name} online in {city}. Send beautiful {name} with Presentail and enjoy express same-day delivery.",
    ar: "تسوّق {name} أونلاين في {city}. أرسل {name} الجميلة مع Presentail واستمتع بتوصيل سريع في نفس اليوم.",
    fr: "Achetez {name} en ligne à {city}. Envoyez de magnifiques {name} avec Presentail et profitez d'une livraison express le jour même.",
  },
  occasion: {
    en: "Send {name} flowers, cakes, balloons and gifts in {city}. Order online with Presentail for express same-day delivery.",
    ar: "أرسل زهور وكعك وبالونات وهدايا {name} في {city}. اطلب أونلاين مع Presentail لتوصيل سريع في نفس اليوم.",
    fr: "Envoyez fleurs, gâteaux, ballons et cadeaux {name} à {city}. Commandez en ligne avec Presentail pour une livraison express le jour même.",
  },
  brand: {
    en: "Shop {name} gifts online in {city}. Send curated {name} products with reliable delivery from Presentail.",
    ar: "تسوّق هدايا {name} أونلاين في {city}. أرسل منتجات {name} المنتقاة مع توصيل موثوق من Presentail.",
    fr: "Achetez les cadeaux {name} en ligne à {city}. Envoyez des produits {name} sélectionnés avec une livraison fiable de Presentail.",
  },
};

// No-city fallback descriptions.
export const ENTITY_DESCRIPTIONS_NO_CITY = {
  product: {
    en: "Order {name} online. Send it with Presentail for fast, reliable gift delivery.",
    ar: "اطلب {name} أونلاين. أرسلها مع Presentail لتوصيل هدايا سريع وموثوق.",
    fr: "Commandez {name} en ligne. Envoyez-le avec Presentail pour une livraison de cadeaux rapide et fiable.",
  },
  category: {
    en: "Shop {name} online. Send beautiful {name} with Presentail and enjoy express same-day delivery.",
    ar: "تسوّق {name} أونلاين. أرسل {name} الجميلة مع Presentail واستمتع بتوصيل سريع في نفس اليوم.",
    fr: "Achetez {name} en ligne. Envoyez de magnifiques {name} avec Presentail et profitez d'une livraison express le jour même.",
  },
  occasion: {
    en: "Send {name} flowers, cakes, balloons and gifts. Order online with Presentail for express same-day delivery.",
    ar: "أرسل زهور وكعك وبالونات وهدايا {name}. اطلب أونلاين مع Presentail لتوصيل سريع في نفس اليوم.",
    fr: "Envoyez fleurs, gâteaux, ballons et cadeaux {name}. Commandez en ligne avec Presentail pour une livraison express le jour même.",
  },
  brand: {
    en: "Shop {name} gifts online. Send curated {name} products with reliable delivery from Presentail.",
    ar: "تسوّق هدايا {name} أونلاين. أرسل منتجات {name} المنتقاة مع توصيل موثوق من Presentail.",
    fr: "Achetez les cadeaux {name} en ligne. Envoyez des produits {name} sélectionnés avec une livraison fiable de Presentail.",
  },
};

// Classify static pages into two groups.
//
// Group A: city-specific and indexable. Each city URL is genuinely unique
//   because the title, description, and H1 include the city name.
// Group B: non-city, noindex-or-single-canonical. These pages have no
//   city-specific content and must not be indexed at the per-city level.
export const STATIC_PAGE_GROUP = {
  A: new Set(["contact", "faqs", "corporate", "weddings"]),
  // "blog" (the Journal index) was moved out of Group B: it is indexable and
  // acts as the hub page linking to the individual articles.
  B: new Set(["privacy", "terms", "careers", "partner"]),
};

/** True when routeKey is a Group A static page (city-specific, indexable). */
export function isGroupAStaticPage(routeKey) {
  return STATIC_PAGE_GROUP.A.has(routeKey);
}

// Route keys that must never be indexed (transactional / private / auth /
// Group B static pages that carry no city-specific content).
export const NONINDEX_ROUTE_KEYS = new Set([
  "cart",
  "checkout",
  "orderConfirmed",
  "auth",
  "account",
  "favorites",
  // Group B static pages: accessible but not indexed at the city URL level.
  "privacy",
  "terms",
  "careers",
  "partner",
]);

const ROBOTS_INDEX = "index, follow";
const ROBOTS_NOINDEX = "noindex, follow";

/**
 * Replace {city} / {country} placeholders. Empty values collapse cleanly so we
 * never emit "in , " fragments. Also strips an orphaned ", {country}" tail.
 */
export function formatTemplate(template, params = {}) {
  let out = String(template ?? "");
  const city = params.city ?? "";
  const country = params.country ?? "";
  const name = params.name ?? "";
  out = out.replace(/\{name\}/g, name);
  out = out.replace(/\{city\}/g, city);
  out = out.replace(/\{country\}/g, country);
  // Collapse leftover artefacts from empty city/country substitutions.
  out = out
    .replace(/\s+in\s*,\s*\./g, ".")
    .replace(/\s+in\s+\./g, ".")
    .replace(/,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

function pickLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : "en";
}

/** @returns {object} a plain SeoMeta object */
function meta({ title, description, robots = ROBOTS_INDEX, ogTitle, ogDescription, twitterTitle, twitterDescription }) {
  return {
    title,
    description,
    ogTitle: ogTitle ?? title,
    ogDescription: ogDescription ?? description,
    twitterTitle: twitterTitle ?? title,
    twitterDescription: twitterDescription ?? description,
    robots,
  };
}

export function buildHomepageSeo({ lang } = {}) {
  const l = pickLang(lang);
  return meta({
    title: TITLES[l].landing,
    description: DESCRIPTIONS[l].landing,
    ogTitle: LANDING_OG[l].title,
    ogDescription: LANDING_OG[l].description,
    twitterTitle: LANDING_TWITTER[l].title,
    twitterDescription: LANDING_TWITTER[l].description,
  });
}

export function buildCitySeo({ lang, city, country } = {}) {
  const l = pickLang(lang);
  const params = { city: city ?? "", country: country ?? "" };
  return meta({
    title: formatTemplate(TITLES[l].home, params),
    description: formatTemplate(DESCRIPTIONS[l].home, params),
  });
}

export function buildCategorySeo({ lang, categoryName, city, country, productCount } = {}) {
  const l = pickLang(lang);
  const name = categoryName ?? "";
  const params = { name, city: city ?? "", country: country ?? "" };
  const titleTpl = city ? ENTITY_TITLES.category[l] : ENTITY_TITLES_NO_CITY.category[l];
  const descTpl = city ? ENTITY_DESCRIPTIONS.category[l] : ENTITY_DESCRIPTIONS_NO_CITY.category[l];
  const robots = productCount === 0 ? ROBOTS_NOINDEX : ROBOTS_INDEX;
  return meta({
    title: formatTemplate(titleTpl, params),
    description: formatTemplate(descTpl, params),
    robots,
  });
}

export function buildOccasionSeo({ lang, occasionName, city, country, productCount } = {}) {
  const l = pickLang(lang);
  const name = occasionName ?? "";
  const params = { name, city: city ?? "", country: country ?? "" };
  const titleTpl = city ? ENTITY_TITLES.occasion[l] : ENTITY_TITLES_NO_CITY.occasion[l];
  const descTpl = city ? ENTITY_DESCRIPTIONS.occasion[l] : ENTITY_DESCRIPTIONS_NO_CITY.occasion[l];
  const robots = productCount === 0 ? ROBOTS_NOINDEX : ROBOTS_INDEX;
  return meta({
    title: formatTemplate(titleTpl, params),
    description: formatTemplate(descTpl, params),
    robots,
  });
}

// Maximum character length for product page titles before Google truncates them
// in SERPs. When the full "{name} — {city} | Presentail" exceeds this limit,
// the product name is shortened with an ellipsis so the city and brand suffix
// always remain visible. This mirrors the FAQ/Contact page guardrail pattern.
const PRODUCT_TITLE_HARD_MAX = 65;

export function buildProductSeo({ lang, productName, city, country, shortDescription } = {}) {
  const l = pickLang(lang);
  const name = productName ?? "";
  const cityVal = city ?? "";
  const params = { name, city: cityVal, country: country ?? "" };
  const titleTpl = city ? ENTITY_TITLES.product[l] : ENTITY_TITLES_NO_CITY.product[l];
  const descTpl = city ? ENTITY_DESCRIPTIONS.product[l] : ENTITY_DESCRIPTIONS_NO_CITY.product[l];
  // Prefer the product's own short description when it fits within 160 chars.
  const clean = typeof shortDescription === "string" ? shortDescription.trim() : "";
  const description = clean && clean.length <= 160 ? clean : formatTemplate(descTpl, params);

  // Title-length guardrail: when the city-qualified title would exceed
  // PRODUCT_TITLE_HARD_MAX, truncate the product name so the " — {city} |
  // Presentail" suffix always fits. The ellipsis counts as one character.
  // No guardrail is applied to the no-city fallback (shorter by design).
  let title = formatTemplate(titleTpl, params);
  if (city && title.length > PRODUCT_TITLE_HARD_MAX) {
    // Suffix that always follows the name in the city-qualified template.
    const suffix = ` \u2014 ${cityVal} | Presentail`;
    const maxNameLen = PRODUCT_TITLE_HARD_MAX - suffix.length - 1; // -1 for ellipsis
    if (maxNameLen > 0 && name.length > maxNameLen) {
      const truncatedName = name.slice(0, maxNameLen) + "\u2026";
      title = formatTemplate(titleTpl, { ...params, name: truncatedName });
    }
  }

  return meta({ title, description });
}

export function buildBrandSeo({ lang, brandName, city, country } = {}) {
  const l = pickLang(lang);
  const name = brandName ?? "";
  const params = { name, city: city ?? "", country: country ?? "" };
  const titleTpl = city
    ? { en: "{name} Delivery in {city} | Presentail", ar: "توصيل {name} في {city} | Presentail", fr: "Livraison {name} à {city} | Presentail" }[l]
    : `${name} | Presentail`;
  const descTpl = city ? ENTITY_DESCRIPTIONS.brand[l] : ENTITY_DESCRIPTIONS_NO_CITY.brand[l];
  return meta({
    title: typeof titleTpl === "string" && titleTpl.includes("{") ? formatTemplate(titleTpl, params) : titleTpl ?? `${name} | Presentail`,
    description: formatTemplate(descTpl, params),
  });
}

// FAQs page title guardrail constants (not exported from TITLES to avoid
// collision with the static-seo fallback path).
const FAQS_TITLE_HARD_MAX = 65;
const FAQS_TITLE_MIN = 30;

const FAQS_TITLE_PREFERRED = {
  en: "Flower Delivery FAQs in {city} | Presentail",
  ar: "أسئلة توصيل الزهور في {city} | Presentail",
  fr: "FAQ livraison de fleurs à {city} | Presentail",
};

const FAQS_TITLE_FALLBACK = {
  en: "Flower Delivery FAQs in {city}",
  ar: "أسئلة توصيل الزهور في {city}",
  fr: "FAQ livraison de fleurs à {city}",
};

const FAQS_TITLE_MEDIUM = {
  en: "Presentail FAQs in {city} | Gift Delivery Help",
  ar: "Presentail في {city} | أسئلة التوصيل الشائعة",
  fr: "Presentail FAQ livraison à {city} | Aide cadeaux",
};

/**
 * Build SEO meta for the /faqs page with a smart title-length guardrail.
 *
 * Tiers (evaluated in order):
 *   1. Preferred  — used when its rendered length ≤ FAQS_TITLE_HARD_MAX (65).
 *   2. Fallback   — used when preferred is too long.
 *   3. Medium     — used when fallback is shorter than FAQS_TITLE_MIN (30),
 *                   i.e. an extremely short city name combined with short AR copy.
 *
 * Returns the same meta(...) shape as all other build*Seo functions.
 */
export function buildFaqsSeo({ lang, city, country } = {}) {
  const l = pickLang(lang);
  const params = { city: city ?? "", country: country ?? "" };

  const preferred = formatTemplate(FAQS_TITLE_PREFERRED[l], params);
  const fallback = formatTemplate(FAQS_TITLE_FALLBACK[l], params);
  const medium = formatTemplate(FAQS_TITLE_MEDIUM[l], params);

  let title;
  if (preferred.length <= FAQS_TITLE_HARD_MAX) {
    title = preferred;
  } else if (fallback.length >= FAQS_TITLE_MIN) {
    title = fallback;
  } else {
    title = medium;
  }

  return meta({
    title,
    description: formatTemplate(DESCRIPTIONS[l].faqs, params),
  });
}

// Contact page title guardrail constants (not exported from TITLES to avoid
// collision with the static-seo fallback path).
const CONTACT_TITLE_HARD_MAX = 65;
const CONTACT_TITLE_MIN = 30;

const CONTACT_TITLE_PREFERRED = {
  en: "Contact Presentail in {city} | Gift Delivery Help",
  ar: "تواصل مع Presentail في {city} | دعم التوصيل",
  fr: "Contacter Presentail à {city} | Aide livraison",
};

const CONTACT_TITLE_FALLBACK = {
  en: "Contact Presentail in {city}",
  ar: "تواصل مع Presentail في {city}",
  fr: "Contacter Presentail à {city}",
};

const CONTACT_TITLE_MEDIUM = {
  en: "Presentail Contact in {city} | Delivery Help",
  ar: "تواصل مع Presentail {city} | دعم التوصيل",
  fr: "Contact Presentail {city} | Aide livraison",
};

// Used when no city is selected — avoids a dangling preposition ("in", "في", "à").
const CONTACT_TITLE_NO_CITY = {
  en: "Contact Presentail | Gift Delivery Help",
  ar: "تواصل مع Presentail | دعم التوصيل",
  fr: "Contacter Presentail | Aide livraison",
};

/**
 * Build SEO meta for the /contact page with a smart title-length guardrail.
 *
 * When no city is provided (empty or whitespace) the no-city template is used
 * directly to avoid a dangling preposition.
 *
 * With a city, tiers are evaluated in order:
 *   1. Preferred  — used when its rendered length ≤ CONTACT_TITLE_HARD_MAX (65).
 *   2. Fallback   — used when preferred is too long.
 *   3. Medium     — used when fallback is shorter than CONTACT_TITLE_MIN (30),
 *                   i.e. an extremely short city name.
 *
 * Returns the same meta(...) shape as all other build*Seo functions.
 */
export function buildContactSeo({ lang, city, country } = {}) {
  const l = pickLang(lang);
  const params = { city: city ?? "", country: country ?? "" };

  if (!params.city.trim()) {
    return meta({
      title: CONTACT_TITLE_NO_CITY[l],
      description: formatTemplate(DESCRIPTIONS[l].contact, params),
    });
  }

  const preferred = formatTemplate(CONTACT_TITLE_PREFERRED[l], params);
  const fallback = formatTemplate(CONTACT_TITLE_FALLBACK[l], params);
  const medium = formatTemplate(CONTACT_TITLE_MEDIUM[l], params);

  let title;
  if (preferred.length <= CONTACT_TITLE_HARD_MAX) {
    title = preferred;
  } else if (fallback.length >= CONTACT_TITLE_MIN) {
    title = fallback;
  } else {
    title = medium;
  }

  return meta({
    title,
    description: formatTemplate(DESCRIPTIONS[l].contact, params),
  });
}

export function buildStaticSeo({ lang, routeKey, city, country } = {}) {
  const l = pickLang(lang);
  const key = routeKey ?? "home";
  const params = { city: city ?? "", country: country ?? "" };
  const titleTpl = TITLES[l][key] ?? TITLES[l].home;
  const descTpl = DESCRIPTIONS[l][key] ?? DESCRIPTIONS[l].home;
  const robots = NONINDEX_ROUTE_KEYS.has(key) ? ROBOTS_NOINDEX : ROBOTS_INDEX;
  return meta({
    title: formatTemplate(titleTpl, params),
    description: formatTemplate(descTpl, params),
    robots,
  });
}

export function buildNonIndexableSeo({ lang, routeKey, city, country } = {}) {
  const base = buildStaticSeo({ lang, routeKey, city, country });
  return { ...base, robots: ROBOTS_NOINDEX };
}

/** True when a route key should carry a noindex directive. */
export function isNonIndexableRouteKey(routeKey) {
  return NONINDEX_ROUTE_KEYS.has(routeKey);
}

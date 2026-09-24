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

import { LOCATION_DATA } from "./locationData.mjs";

export const SUPPORTED_LANGS = ["en", "ar", "fr", "el"];

export const OG_LOCALE = { en: "en_US", ar: "ar_AE", fr: "fr_FR", el: "el_GR" };

// Per-country og:locale values. Each entry maps the country slug to the
// correct BCP 47-style locale tag so social crawlers understand which market
// and language variant the page targets (e.g. en_LB for English Lebanon,
// ar_AE for Arabic UAE). These must match the hreflang declarations emitted
// on the same page.
export const OG_LOCALE_COUNTRY = {
  en: { ae: "en_AE", lb: "en_LB", cy: "en_CY" },
  ar: { ae: "ar_AE", lb: "ar_LB", cy: "ar_CY" },
  fr: { ae: "fr_AE", lb: "fr_LB", cy: "fr_CY" },
  el: { ae: "el_AE", lb: "el_LB", cy: "el_CY" },
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
  el: { ae: "τα Ηνωμένα Αραβικά Εμιράτα", lb: "τον Λίβανο", cy: "την Κύπρο" },
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
  el: { ae: "Ηνωμένα Αραβικά Εμιράτα", lb: "Λίβανος", cy: "Κύπρος" },
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
  el: {
    "ae-dubai": "Ντουμπάι",
    "ae-abu-dhabi": "Άμπου Ντάμπι",
    "ae-sharjah": "Σάρτζα",
    "ae-ajman": "Ατζμάν",
    "ae-ras-al-khaimah": "Ρας Αλ Χάιμα",
    "ae-fujairah": "Φουτζάιρα",
    "ae-umm-al-quwain": "Ουμ Αλ Κουέιν",
    "lb-akkar": "Άκαρ",
    "lb-aley": "Άλεϊ",
    "lb-baabda": "Μπάαμπντα",
    "lb-baalbeck": "Μπάαλμπεκ",
    "lb-batroun": "Μπατρούν",
    "lb-bcharee": "Μπσαρέ",
    "lb-beirut": "Βηρυτός",
    "lb-bent-jbeil": "Μπιντ Τζμπέιλ",
    "lb-chouf": "Σουφ",
    "lb-hasbaya": "Χασμπάγια",
    "lb-hermel": "Ερμέλ",
    "lb-jbeil": "Τζμπέιλ",
    "lb-jezzine": "Τζεζίν",
    "lb-kesserwan": "Κεσερουάν",
    "lb-koura": "Κούρα",
    "lb-marjayoun": "Μαρτζαγιούν",
    "lb-metn": "Μετν",
    "lb-minnieh-dennaya": "Μινιέ-Ντενιγιέ",
    "lb-nabatieh": "Ναμπατιγιέ",
    "lb-rechaya": "Ρασάγια",
    "lb-saida": "Σαϊντά",
    "lb-tripoli": "Τρίπολη",
    "lb-tyre": "Τύρος",
    "lb-west-bekaa": "Δυτική Μπεκάα",
    "lb-zahle": "Ζαχλέ",
    "lb-zghorta": "Ζγκόρτα",
    "cy-nicosia": "Λευκωσία",
    "cy-limassol": "Λεμεσός",
    "cy-larnaca": "Λάρνακα",
    "cy-paphos": "Πάφος",
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
    "late-night-flower-delivery": "Late-Night Flower Delivery in {city} | Presentail",
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
  el: {
    landing: "Αποστολή λουλουδιών & δώρων online | Presentail",
    home: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
    shop: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
    bestSellers: "Δημοφιλέστερα στην πόλη {city} | Presentail",
    product: "Αποστολή δώρων στην πόλη {city} | Presentail",
    allOccasions: "Δώρα ανά περίσταση στην {city} | Presentail",
    brands: "Συνεργαζόμενες μάρκες στην {city} | Presentail",
    brand: "Συλλογή μάρκας στην πόλη {city} | Presentail",
    occasions: "Δώρα ανά περίσταση στην {city} | Presentail",
    occasion: "Αποστολή δώρων στην πόλη {city} | Presentail",
    category: "Αποστολή δώρων στην πόλη {city} | Presentail",
    blogPost: "Το Ημερολόγιο του Ατελιέ | Presentail",
    cart: "Η τσάντα σας | Presentail",
    checkout: "Ολοκλήρωση αγοράς | Presentail",
    orderConfirmed: "Η παραγγελία επιβεβαιώθηκε | Presentail",
    auth: "Σύνδεση | Presentail",
    account: "Ο λογαριασμός μου | Presentail",
    favorites: "Τα αγαπημένα μου | Presentail",
    about: "Σχετικά με την Presentail | Πολυτελή λουλούδια & δώρα",
    careers: "Καριέρα στην Presentail | Θέσεις εργασίας",
    blog: "Το Ημερολόγιο του Ατελιέ | Presentail",
    partner: "Γίνετε συνεργάτης της Presentail | Συνεργασίες μαρκών",
    weddings: "Λουλούδια γάμου στην πόλη {city} | Presentail",
    corporate: "Εταιρικά δώρα στην πόλη {city} | Presentail",
    contact: "Επικοινωνία Presentail στην {city} | Υποστήριξη",
    faqs: "Συχνές ερωτήσεις αποστολής στην {city} | Presentail",
    terms: "Όροι χρήσης | Presentail",
    privacy: "Πολιτική απορρήτου | Presentail",
    "return-policy": "Πολιτική επιστροφών | Presentail",
    "shipping-policy": "Πολιτική αποστολής & παράδοσης | Presentail",
    "account-deletion": "Πολιτική διαγραφής λογαριασμού | Presentail",
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
  el: {
    title: "Αποστολή λουλουδιών & δώρων online | Presentail",
    description: "Παραγγείλετε λουλούδια, τούρτες, μπαλόνια και δώρα online με την Presentail. Ταχεία αυθημερόν παράδοση διαθέσιμη σε Λίβανο, ΗΑΕ και Κύπρο.",
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
  el: {
    title: "Αποστολή λουλουδιών & δώρων online | Presentail",
    description: "Στείλτε λουλούδια και δώρα online με την Presentail. Ταχεία αυθημερόν παράδοση σε Λίβανο, ΗΑΕ και Κύπρο.",
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
  el: {
    title: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
    description: "Στείλτε λουλούδια, τούρτες και δώρα στην πόλη {city} με αυθημερόν παράδοση από την Presentail.",
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
  el: {
    title: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
    description: "Στείλτε λουλούδια και δώρα στην πόλη {city} — αυθημερόν παράδοση από την Presentail.",
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
    el: {
      title: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
      description: "Δείτε επιλεγμένα μπουκέτα, τούρτες και πολυτελή δώρα στην πόλη {city} με αυθημερόν παράδοση από την Presentail.",
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
    el: {
      title: "Συνεργαζόμενες μάρκες στην {city} | Presentail",
      description: "Ανακαλύψτε τις επιλεγμένες συνεργαζόμενες μάρκες της Presentail με παράδοση στην πόλη {city}.",
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
    el: {
      title: "Δώρα ανά περίσταση στην {city} | Presentail",
      description: "Βρείτε το ιδανικό δώρο για κάθε περίσταση στην πόλη {city} με αυθημερόν παράδοση από την Presentail.",
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
    el: {
      title: "Δώρα ανά κατηγορία στην πόλη {city} | Presentail",
      description: "Δείτε τις κατηγορίες δώρων της Presentail στην πόλη {city} με αυθημερόν παράδοση.",
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
    el: {
      title: "Λουλούδια & δώρα στην πόλη {city} | Presentail",
      description: "Λουλούδια, τούρτες και δώρα στην πόλη {city} — αυθημερόν παράδοση από την Presentail.",
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
    el: {
      title: "Συνεργαζόμενες μάρκες στην {city} | Presentail",
      description: "Εξερευνήστε τις επιλεγμένες συνεργαζόμενες μάρκες μας στην πόλη {city} — παράδοση από την Presentail.",
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
    el: {
      title: "Δώρα ανά περίσταση στην {city} | Presentail",
      description: "Δώρα για κάθε περίσταση στην πόλη {city} — αυθημερόν παράδοση από την Presentail.",
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
    el: {
      title: "Δώρα ανά κατηγορία στην πόλη {city} | Presentail",
      description: "Δώρα ανά κατηγορία στην πόλη {city} — αυθημερόν παράδοση από την Presentail.",
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
    "late-night-flower-delivery": "Shop fresh flower arrangements available for verified late-night delivery windows in {city}, with live availability confirmed by Presentail.",
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
  el: {
    landing:
      "Στείλτε λουλούδια, τούρτες, μπαλόνια, φυτά, σοκολάτες και άλλα δώρα online με την Presentail. Ταχεία αυθημερόν παράδοση διαθέσιμη σε Λίβανο, ΗΑΕ και Κύπρο.",
    home: "Στείλτε λουλούδια, τούρτες, μπαλόνια, φυτά, σοκολάτες και δώρα online στην πόλη {city}. Ταχεία αυθημερόν παράδοση διαθέσιμη με την Presentail.",
    shop: "Δείτε τα επιλεγμένα μπουκέτα, τούρτες και πολυτελή δώρα της Presentail για παράδοση στην πόλη {city}, {country}.",
    bestSellers: "Ανακαλύψτε τα δημοφιλέστερα μπουκέτα, τούρτες και πολυτελή δώρα της Presentail για παράδοση στην πόλη {city}, {country}.",
    product: "Παραγγείλετε αυτό το δώρο για παράδοση στην πόλη {city}, {country} με την Presentail.",
    allOccasions:
      "Δείτε όλες τις περιστάσεις — γενέθλια, επετείους, γάμους και άλλα — και βρείτε το ιδανικό δώρο για παράδοση στην πόλη {city}, {country}.",
    brands:
      "Ανακαλύψτε τις επιλεγμένες συνεργαζόμενες μάρκες της Presentail που είναι διαθέσιμες για παράδοση στην πόλη {city}, {country}.",
    brand: "Αγοράστε ολόκληρη τη συλλογή αυτής της μάρκας για παράδοση στην πόλη {city}, {country} με την Presentail.",
    occasions: "Δείτε δώρα ανά περίσταση στην πόλη {city}, {country} — γενέθλια, επετείους, γάμους, συλλυπητήρια και άλλα με την Presentail.",
    occasion: "Βρείτε το ιδανικό δώρο για αυτή την περίσταση στην πόλη {city}, {country} με αυθημερόν παράδοση από την Presentail.",
    category: "Παραγγείλετε από αυτή την κατηγορία δώρων για παράδοση στην πόλη {city}, {country} με την Presentail.",
    blogPost: "Διαβάστε τις τελευταίες ιστορίες, εποχικούς οδηγούς και εμπνεύσεις για δώρα από τη συντακτική ομάδα της Presentail.",
    cart: "Ελέγξτε την τσάντα σας στην Presentail και προχωρήστε σε ασφαλή ολοκλήρωση αγοράς.",
    checkout:
      "Ολοκληρώστε την παραγγελία σας στην Presentail με ασφαλή πληρωμή μέσω κάρτας, PayPal ή Mamo.",
    orderConfirmed: "Σας ευχαριστούμε — η παραγγελία σας στην Presentail επιβεβαιώθηκε.",
    auth: "Συνδεθείτε ή δημιουργήστε λογαριασμό Presentail για να διαχειρίζεστε παραγγελίες και διευθύνσεις.",
    account: "Διαχειριστείτε το προφίλ, τις παραγγελίες και τις αποθηκευμένες διευθύνσεις σας στην Presentail.",
    favorites: "Δείτε και διαχειριστείτε τα αποθηκευμένα δώρα και αγαπημένα σας στην Presentail.",
    about: "Η Presentail είναι ένα πολυτελές ατελιέ λουλουδιών και δώρων με παράδοση σε Λίβανο, ΗΑΕ και Κύπρο. Γνωρίστε την ομάδα και την τέχνη πίσω από κάθε αποστολή.",
    careers: "Ελάτε στην ομάδα της Presentail — προσλαμβάνουμε ανθοπώλες, σχεδιαστές και μηχανικούς για να χτίσουμε την πιο προσεγμένη εμπειρία δώρων σε Λίβανο, ΗΑΕ και Κύπρο.",
    blog: "Σημειώσεις από το studio της Presentail: εποχική προμήθεια, συνεργαζόμενοι δημιουργοί και οδηγοί δώρων για τις πιο σημαντικές στιγμές της ζωής.",
    partner: "Γίνετε συνεργάτης της Presentail για να φέρετε τη μάρκα σας σε πελάτες πολυτελών δώρων σε Λίβανο, ΗΑΕ και Κύπρο — ανθοπώλες, σοκολατοποιοί και ατελιέ lifestyle ευπρόσδεκτοι.",
    weddings: "Εξατομικευμένος ανθικός σχεδιασμός και styling για γάμους και ιδιωτικές εκδηλώσεις στην πόλη {city} από το ατελιέ της Presentail, με αυθημερόν παράδοση δώρων στους καλεσμένους.",
    corporate: "Προγράμματα εταιρικών δώρων από την Presentail στην πόλη {city} — επιλεγμένα δώρα για πελάτες και ομάδες σε μεγάλη κλίμακα, με επώνυμη συσκευασία και ενοποιημένη τιμολόγηση.",
    contact: "Επικοινωνήστε με το concierge της Presentail στην πόλη {city} για υποστήριξη παραγγελιών, παρακολούθηση παράδοσης, ειδικά αιτήματα και συνεργασίες.",
    faqs: "Απαντήσεις σε συχνές ερωτήσεις για την αποστολή λουλουδιών και δώρων της Presentail στην πόλη {city}, όπως χρόνοι παράδοσης, τρόποι πληρωμής, ακυρώσεις και επιστροφές.",
    terms: "Οι Όροι Χρήσης που διέπουν την αγορά και τη χρήση του ιστότοπου, των εφαρμογών και των υπηρεσιών της Presentail.",
    privacy: "Πώς η Presentail συλλέγει, χρησιμοποιεί και προστατεύει τα προσωπικά σας δεδομένα στον ιστότοπο, τις εφαρμογές και τα κοινωνικά κανάλια.",
    "return-policy": "Η πολιτική επιστροφών και εγγύησης ικανοποίησης της Presentail — πώς να ζητήσετε επιστροφή, το παράθυρο φωτογραφίας 7 ημερών και τι καλύπτεται.",
    "shipping-policy": "Πώς η Presentail παραδίδει λουλούδια και δώρα σε Λίβανο, ΗΑΕ και Κύπρο — χρόνοι παράδοσης, επιλογές αυθημερόν και ώρες λήξης παραγγελιών.",
    "account-deletion": "Πώς να διαγράψετε τον λογαριασμό σας στην Presentail εντός της εφαρμογής ή μέσω email, ποια δεδομένα διαγράφονται και το διάστημα επεξεργασίας 15 ημερών.",
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
    el: "{name} — {city} | Presentail",
  },
  category: {
    en: "{name} Delivery in {city} | Presentail",
    ar: "توصيل {name} في {city} | Presentail",
    fr: "Livraison de {name} à {city} | Presentail",
    el: "Αποστολή {name} στην πόλη {city} | Presentail",
  },
  occasion: {
    en: "{name} Flowers & Gifts in {city} | Presentail",
    ar: "زهور وهدايا {name} في {city} | Presentail",
    fr: "Fleurs et cadeaux {name} à {city} | Presentail",
    el: "Λουλούδια & δώρα {name} στην {city} | Presentail",
  },
};

// No-city fallback titles (bare/legacy paths without a locale-prefixed city).
export const ENTITY_TITLES_NO_CITY = {
  product: {
    en: "Order {name} Online | Presentail",
    ar: "اطلب {name} أونلاين | Presentail",
    fr: "Commander {name} en ligne | Presentail",
    el: "Παραγγείλετε {name} online | Presentail",
  },
  category: {
    en: "Shop {name} Online | Presentail",
    ar: "تسوّق {name} أونلاين | Presentail",
    fr: "Acheter {name} en ligne | Presentail",
    el: "Αγοράστε {name} online | Presentail",
  },
  occasion: {
    en: "{name} Flowers & Gifts Online | Presentail",
    ar: "زهور وهدايا {name} أونلاين | Presentail",
    fr: "Fleurs et cadeaux {name} en ligne | Presentail",
    el: "Λουλούδια και δώρα {name} online | Presentail",
  },
};

export const ENTITY_H1 = {
  product: {
    en: "{name}", ar: "{name}", fr: "{name}", el: "{name}",
  },
  category: {
    en: "{name} in {city}",
    ar: "{name} في {city}",
    fr: "{name} à {city}",
    el: "{name} στην πόλη {city}",
  },
  occasion: {
    en: "{name} Flowers & Gifts",
    ar: "زهور وهدايا {name}",
    fr: "Fleurs et cadeaux {name}",
    el: "Λουλούδια και δώρα {name}",
  },
  brand: {
    en: "{name}", ar: "{name}", fr: "{name}", el: "{name}",
  },
};

export const ROUTE_H1 = {
  en: {
    landing: "Flowers, Gifts & Cakes Delivered Across Lebanon, UAE & Cyprus",
    home: "Fresh Flowers & Gifts, Delivered in {city}",
    shop: "The Full Collection — Flowers, Gifts & Plants in {city}",
    brands: "Curated Partner Brands Available in {city}",
    allOccasions: "Gifts for Every Occasion, Delivered to {city}",
    occasions: "Gifts for Every Occasion, Delivered to {city}",
    blog: "Gift Ideas, Flower Guides & Stories",
    contact: "Talk to Us — Order & Delivery Help in {city}",
    faqs: "Flower & Gift Delivery in {city} — Your Questions Answered",
    weddings: "Bridal Flowers, Table Arrangements & Wedding Gifts in {city}",
    corporate: "Hampers, Branded Gifts & Bulk Delivery for Teams in {city}",
    "account-deletion": "Delete Your Presentail Account and Personal Data",
  },
  ar: {
    landing: "توصيل الزهور والهدايا والكيك في لبنان والإمارات وقبرص",
    home: "توصيل الزهور والهدايا في {city}",
    shop: "المجموعة الكاملة — زهور وهدايا ونباتات في {city}",
    brands: "العلامات الشريكة المتاحة في {city}",
    allOccasions: "هدايا لكل مناسبة توصّل إلى {city}",
    occasions: "هدايا لكل مناسبة توصّل إلى {city}",
    blog: "أفكار هدايا وأدلة زهور وقصص",
    contact: "تواصل معنا — دعم الطلبات والتوصيل في {city}",
    faqs: "توصيل الزهور والهدايا في {city} — إجابات على أسئلتك",
    weddings: "زهور الزفاف وتنسيق الطاولات وهدايا الأعراس في {city}",
    corporate: "هدايا الشركات والتوصيل بالجملة للفرق في {city}",
    "account-deletion": "حذف حساب Presentail وبياناتك الشخصية",
  },
  fr: {
    landing: "Fleurs, cadeaux et gâteaux livrés au Liban, aux Émirats et à Chypre",
    home: "Fleurs et cadeaux livrés à {city}",
    shop: "Toute la collection — fleurs, cadeaux et plantes à {city}",
    brands: "Marques partenaires disponibles à {city}",
    allOccasions: "Cadeaux pour chaque occasion, livrés à {city}",
    occasions: "Cadeaux pour chaque occasion, livrés à {city}",
    blog: "Idées cadeaux, guides floraux et histoires",
    contact: "Contactez-nous — aide commandes et livraisons à {city}",
    faqs: "Livraison de fleurs et cadeaux à {city} — vos questions",
    weddings: "Fleurs de mariage, compositions de table et cadeaux à {city}",
    corporate: "Coffrets, cadeaux de marque et livraisons groupées à {city}",
    "account-deletion": "Supprimer votre compte Presentail et vos données personnelles",
  },
  el: {
    landing: "Λουλούδια, δώρα και τούρτες σε Λίβανο, ΗΑΕ και Κύπρο",
    home: "Φρέσκα λουλούδια και δώρα στην πόλη {city}",
    shop: "Η πλήρης συλλογή λουλουδιών και δώρων στην πόλη {city}",
    brands: "Επιλεγμένες συνεργαζόμενες μάρκες στην πόλη {city}",
    allOccasions: "Δώρα για κάθε περίσταση στην πόλη {city}",
    occasions: "Δώρα για κάθε περίσταση στην πόλη {city}",
    blog: "Ιδέες δώρων, οδηγοί λουλουδιών και ιστορίες",
    contact: "Επικοινωνήστε μαζί μας για παραγγελίες στην πόλη {city}",
    faqs: "Παράδοση λουλουδιών και δώρων στην πόλη {city}",
    weddings: "Λουλούδια γάμου και δώρα στην πόλη {city}",
    corporate: "Εταιρικά δώρα και μαζική παράδοση στην πόλη {city}",
    "account-deletion": "Διαγραφή λογαριασμού Presentail και προσωπικών δεδομένων",
  },
};

export const ENTITY_DESCRIPTIONS = {
  product: {
    en: "Order {name} online in {city}. Send it with Presentail for fast, reliable gift delivery.",
    ar: "اطلب {name} أونلاين في {city}. أرسلها مع Presentail لتوصيل هدايا سريع وموثوق.",
    fr: "Commandez {name} en ligne à {city}. Envoyez-le avec Presentail pour une livraison de cadeaux rapide et fiable.",
    el: "Παραγγείλετε {name} online στην πόλη {city}. Στείλτε το με την Presentail για γρήγορη και αξιόπιστη παράδοση δώρων.",
  },
  category: {
    en: "Shop {name} online in {city}. Send beautiful {name} with Presentail and enjoy express same-day delivery.",
    ar: "تسوّق {name} أونلاين في {city}. أرسل {name} الجميلة مع Presentail واستمتع بتوصيل سريع في نفس اليوم.",
    fr: "Achetez {name} en ligne à {city}. Envoyez de magnifiques {name} avec Presentail et profitez d'une livraison express le jour même.",
    el: "Αγοράστε {name} online στην πόλη {city}. Στείλτε υπέροχα {name} με την Presentail και απολαύστε ταχεία αυθημερόν παράδοση.",
  },
  occasion: {
    en: "Send {name} flowers, cakes, balloons and gifts in {city}. Order online with Presentail for express same-day delivery.",
    ar: "أرسل زهور وكعك وبالونات وهدايا {name} في {city}. اطلب أونلاين مع Presentail لتوصيل سريع في نفس اليوم.",
    fr: "Envoyez fleurs, gâteaux, ballons et cadeaux {name} à {city}. Commandez en ligne avec Presentail pour une livraison express le jour même.",
    el: "Στείλτε λουλούδια, τούρτες, μπαλόνια και δώρα {name} στην πόλη {city}. Παραγγείλετε online με την Presentail για ταχεία αυθημερόν παράδοση.",
  },
  brand: {
    en: "Shop {name} gifts online in {city}. Send curated {name} products with reliable delivery from Presentail.",
    ar: "تسوّق هدايا {name} أونلاين في {city}. أرسل منتجات {name} المنتقاة مع توصيل موثوق من Presentail.",
    fr: "Achetez les cadeaux {name} en ligne à {city}. Envoyez des produits {name} sélectionnés avec une livraison fiable de Presentail.",
    el: "Αγοράστε δώρα {name} online στην πόλη {city}. Στείλτε επιλεγμένα προϊόντα {name} με αξιόπιστη παράδοση από την Presentail.",
  },
};

// No-city fallback descriptions.
export const ENTITY_DESCRIPTIONS_NO_CITY = {
  product: {
    en: "Order {name} online. Send it with Presentail for fast, reliable gift delivery.",
    ar: "اطلب {name} أونلاين. أرسلها مع Presentail لتوصيل هدايا سريع وموثوق.",
    fr: "Commandez {name} en ligne. Envoyez-le avec Presentail pour une livraison de cadeaux rapide et fiable.",
    el: "Παραγγείλετε {name} online. Στείλτε το με την Presentail για γρήγορη και αξιόπιστη παράδοση δώρων.",
  },
  category: {
    en: "Shop {name} online. Send beautiful {name} with Presentail and enjoy express same-day delivery.",
    ar: "تسوّق {name} أونلاين. أرسل {name} الجميلة مع Presentail واستمتع بتوصيل سريع في نفس اليوم.",
    fr: "Achetez {name} en ligne. Envoyez de magnifiques {name} avec Presentail et profitez d'une livraison express le jour même.",
    el: "Αγοράστε {name} online. Στείλτε υπέροχα {name} με την Presentail και απολαύστε ταχεία αυθημερόν παράδοση.",
  },
  occasion: {
    en: "Send {name} flowers, cakes, balloons and gifts. Order online with Presentail for express same-day delivery.",
    ar: "أرسل زهور وكعك وبالونات وهدايا {name}. اطلب أونلاين مع Presentail لتوصيل سريع في نفس اليوم.",
    fr: "Envoyez fleurs, gâteaux, ballons et cadeaux {name}. Commandez en ligne avec Presentail pour une livraison express le jour même.",
    el: "Στείλτε λουλούδια, τούρτες, μπαλόνια και δώρα {name}. Παραγγείλετε online με την Presentail για ταχεία αυθημερόν παράδοση.",
  },
  brand: {
    en: "Shop {name} gifts online. Send curated {name} products with reliable delivery from Presentail.",
    ar: "تسوّق هدايا {name} أونلاين. أرسل منتجات {name} المنتقاة مع توصيل موثوق من Presentail.",
    fr: "Achetez les cadeaux {name} en ligne. Envoyez des produits {name} sélectionnés avec une livraison fiable de Presentail.",
    el: "Αγοράστε δώρα {name} online. Στείλτε επιλεγμένα προϊόντα {name} με αξιόπιστη παράδοση από την Presentail.",
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
  B: new Set(["privacy", "terms", "careers", "partner"]),
};

/** True when routeKey is a Group A static page (city-specific, indexable). */
export function isGroupAStaticPage(routeKey) {
  return STATIC_PAGE_GROUP.A.has(routeKey);
}

// Route keys that must never be indexed (transactional / private / auth /
// Group B static pages that carry no city-specific content).
export const NONINDEX_ROUTE_KEYS = new Set([
  "blog",
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
  // Paid-only campaign landing (single locale/city — /en-lb/beirut/
  // late-night-flower-delivery). noindex,follow with a self-referencing
  // canonical; not part of any hreflang/JSON-LD/markdown cluster.
  "late-night-flower-delivery",
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
function meta({ title, h1, description, robots = ROBOTS_INDEX, ogTitle, ogDescription, twitterTitle, twitterDescription }) {
  return {
    title,
    h1,
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
    h1: ROUTE_H1[l].landing,
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
    h1: formatTemplate(ROUTE_H1[l].home, params),
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
    h1: formatTemplate(ENTITY_H1.category[l], params),
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
    h1: formatTemplate(ENTITY_H1.occasion[l], params),
    description: formatTemplate(descTpl, params),
    robots,
  });
}

// Maximum character length for product page titles before Google truncates them
// in SERPs. When the full "{name} — {city} | Presentail" exceeds this limit,
// the product name is shortened with an ellipsis so the city and brand suffix
// always remain visible. This mirrors the FAQ/Contact page guardrail pattern.
const PRODUCT_TITLE_HARD_MAX = 65;
const PRODUCT_DESCRIPTION_MIN = 120;
const PRODUCT_DESCRIPTION_MAX = 155;

const PRODUCT_VARIANT_TRANSLATIONS = {
  ar: {
    "hand bouquets": "باقات يدوية",
    "flower boxes": "صناديق زهور",
    "flower baskets": "سلال ورد",
    "flowers": "ورود",
    "roses": "ورد",
    "sunflowers": "زهور عباد الشمس",
    cakes: "كيك",
    chocolate: "شوكولاتة",
    plants: "نباتات",
    balloons: "بالونات",
    "gift baskets": "سلال هدايا",
    "stuffed animals": "دمى محشوة",
    // Colours — variant qualifiers like "Yellow" or "Red" appended to Arabic names
    red: "أحمر",
    white: "أبيض",
    pink: "وردي",
    yellow: "أصفر",
    blue: "أزرق",
    purple: "بنفسجي",
    orange: "برتقالي",
    green: "أخضر",
    mixed: "متنوع",
    classic: "كلاسيكي",
    luxury: "فاخر",
    premium: "مميز",
    small: "صغير",
    medium: "وسط",
    large: "كبير",
    "extra large": "كبير جداً",
    mini: "ميني",
  },
  fr: {
    "hand bouquets": "Bouquets",
    "flower boxes": "Boîtes de fleurs",
    "flower baskets": "Corbeilles de fleurs",
    "flowers": "Fleurs",
    "roses": "Roses",
    "sunflowers": "Tournesols",
    cakes: "Gâteaux",
    chocolate: "Chocolat",
    plants: "Plantes",
    balloons: "Ballons",
    "gift baskets": "Coffrets cadeaux",
    "stuffed animals": "Peluches",
    // Colours
    red: "Rouge",
    white: "Blanc",
    pink: "Rose",
    yellow: "Jaune",
    blue: "Bleu",
    purple: "Violet",
    orange: "Orange",
    green: "Vert",
    mixed: "Mixte",
    classic: "Classique",
    luxury: "Luxe",
    premium: "Premium",
    small: "Petit",
    medium: "Moyen",
    large: "Grand",
    "extra large": "Très grand",
    mini: "Mini",
  },
};

function localizeProductVariant(value, lang) {
  if (typeof value !== "string") return "";
  const clean = value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return PRODUCT_VARIANT_TRANSLATIONS[lang]?.[clean.toLocaleLowerCase("en")] ?? clean;
}

function clipSeoSentence(value, maxLength) {
  const clean = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength - 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > maxLength * 0.7 ? boundary : maxLength - 1).replace(/[,:;.!?\s]+$/g, "")}…`;
}

function composeProductDescription({ lang, name, city, detail }) {
  const templates = {
    en: `Order ${name} for reliable gift delivery in ${city}.`,
    ar: `اطلب ${name} مع توصيل هدايا موثوق في ${city}.`,
    fr: `Commandez ${name} avec une livraison cadeau fiable à ${city}.`,
    el: `Παραγγείλετε ${name} με αξιόπιστη παράδοση δώρου στην πόλη ${city}.`,
  };
  const endings = {
    en: "Prepared with care by Presentail, with scheduled and same-day options where available.",
    ar: "يُجهّز بعناية من Presentail، مع خيارات توصيل مجدولة وفي اليوم نفسه حيثما تتوفر.",
    fr: "Préparé avec soin par Presentail, avec livraison planifiée ou le jour même selon disponibilité.",
    el: "Ετοιμάζεται με φροντίδα από την Presentail, με προγραμματισμένη ή αυθημερόν παράδοση όπου διατίθεται.",
  };
  const usefulDetail = String(detail || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let description = `${templates[lang]} ${usefulDetail}`.trim();
  if (description.length < PRODUCT_DESCRIPTION_MIN) {
    description = `${description.replace(/[.!?]+$/g, "")}. ${endings[lang]}`;
  }
  return clipSeoSentence(description, PRODUCT_DESCRIPTION_MAX);
}

function truncateProductNameForTitle(name, maxLength) {
  if (name.length <= maxLength) return name;
  if (maxLength <= 1) return "\u2026";
  // Product variants commonly differ at the end of the name ("16 Pieces",
  // "24 Pieces", size, colour, etc.). Preserve that tail so title truncation
  // cannot collapse distinct variants back into the same SERP title.
  const tailLength = Math.min(16, Math.max(6, Math.floor((maxLength - 1) / 3)));
  const headLength = maxLength - tailLength - 1;
  return `${name.slice(0, headLength)}\u2026${name.slice(-tailLength)}`;
}

export function buildProductSeo({
  lang,
  productName,
  productVariant,
  city,
  country,
  shortDescription,
} = {}) {
  const l = pickLang(lang);
  const name = productName ?? "";
  const localizedVariant = localizeProductVariant(productVariant, l);
  const cleanVariant =
    localizedVariant &&
    normalizeSeoText(localizedVariant) !== normalizeSeoText(name)
      ? localizedVariant.slice(0, 24)
      : "";
  const variantSuffix = cleanVariant ? ` \u00b7 ${cleanVariant}` : "";
  const titleName = `${name}${variantSuffix}`;
  const cityVal = city ?? "";
  const params = { name: titleName, city: cityVal, country: country ?? "" };
  const h1Params = { name, city: cityVal, country: country ?? "" };
  const titleTpl = city ? ENTITY_TITLES.product[l] : ENTITY_TITLES_NO_CITY.product[l];
  const clean = typeof shortDescription === "string" ? shortDescription.trim() : "";
  const descTpl = city ? ENTITY_DESCRIPTIONS.product[l] : ENTITY_DESCRIPTIONS_NO_CITY.product[l];
  const description = city
    ? composeProductDescription({ lang: l, name, city: cityVal, detail: clean })
    : clean && clean.length <= 160
      ? clean
      : formatTemplate(descTpl, params);

  // Title-length guardrail: when the city-qualified title would exceed
  // PRODUCT_TITLE_HARD_MAX, truncate the product name so the " — {city} |
  // Presentail" suffix always fits. The ellipsis counts as one character.
  // No guardrail is applied to the no-city fallback (shorter by design).
  let title = formatTemplate(titleTpl, params);
  if (city && cleanVariant && title.length > PRODUCT_TITLE_HARD_MAX) {
    title = formatTemplate(titleTpl, { ...params, name });
  }
  if (city && title.length > PRODUCT_TITLE_HARD_MAX) {
    // Suffix that always follows the name in the city-qualified template.
    // Keep the qualifier as well as the city/brand suffix. Removing the
    // qualifier during truncation would recreate duplicate titles for
    // same-name product variants.
    const retainedVariantSuffix = title.includes(variantSuffix) ? variantSuffix : "";
    const suffix = `${retainedVariantSuffix} \u2014 ${cityVal} | Presentail`;
    const maxNameLen = PRODUCT_TITLE_HARD_MAX - suffix.length - 1; // -1 for ellipsis
    if (maxNameLen > 0 && name.length > maxNameLen) {
      const truncatedName = truncateProductNameForTitle(name, maxNameLen + 1);
      title = formatTemplate(titleTpl, {
        ...params,
        name: `${truncatedName}${retainedVariantSuffix}`,
      });
    }
  }

  return meta({
    title,
    h1: formatTemplate(ENTITY_H1.product[l], h1Params),
    description,
  });
}

export function buildBrandSeo({ lang, brandName, city, country } = {}) {
  const l = pickLang(lang);
  const name = brandName ?? "";
  const params = { name, city: city ?? "", country: country ?? "" };
  const titleTpl = city
    ? { en: "{name} Delivery in {city} | Presentail", ar: "توصيل {name} في {city} | Presentail", fr: "Livraison {name} à {city} | Presentail", el: "Αποστολή {name} στην πόλη {city} | Presentail" }[l]
    : { en: "Shop {name} Online | Presentail", ar: "تسوّق {name} أونلاين | Presentail", fr: "Acheter {name} en ligne | Presentail", el: "Αγοράστε {name} online | Presentail" }[l];
  const descTpl = city ? ENTITY_DESCRIPTIONS.brand[l] : ENTITY_DESCRIPTIONS_NO_CITY.brand[l];
  return meta({
    title: typeof titleTpl === "string" && titleTpl.includes("{") ? formatTemplate(titleTpl, params) : titleTpl ?? `${name} | Presentail`,
    h1: formatTemplate(ENTITY_H1.brand[l], params),
    description: formatTemplate(descTpl, params),
  });
}

export function buildBlogSeo({ lang, seoTitle, articleTitle, h1, description } = {}) {
  const l = pickLang(lang);
  const displayH1 = String(h1 ?? articleTitle ?? seoTitle ?? "").trim();
  const explicitTitle = String(seoTitle ?? articleTitle ?? "").trim();
  const fallbackSuffixes = {
    en: " — Gift Guide | Presentail",
    ar: " — دليل الهدايا | Presentail",
    fr: " — Guide cadeaux | Presentail",
    el: " — Οδηγός δώρων | Presentail",
  };
  const suffix = fallbackSuffixes[l];
  const maxNameLength = Math.max(1, 65 - suffix.length);
  const clippedName = displayH1.length > maxNameLength
    ? displayH1
        .slice(0, maxNameLength + 1)
        .replace(/\s+\S*$/u, "")
        .replace(/[\s,:;.!?—–-]+$/u, "")
    : displayH1;
  const title = explicitTitle && normalizeSeoText(explicitTitle) !== normalizeSeoText(displayH1)
    ? explicitTitle
    : `${clippedName || displayH1}${suffix}`;
  return meta({
    title: title || TITLES[l].blog,
    h1: displayH1 || ROUTE_H1[l].blog,
    description: String(description ?? "").trim() || DESCRIPTIONS[l].blog,
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
  el: "Συχνές ερωτήσεις αποστολής λουλουδιών στην {city} | Presentail",
};

const FAQS_TITLE_FALLBACK = {
  en: "Flower Delivery FAQs in {city}",
  ar: "أسئلة توصيل الزهور في {city}",
  fr: "FAQ livraison de fleurs à {city}",
  el: "Συχνές ερωτήσεις αποστολής λουλουδιών στην {city}",
};

const FAQS_TITLE_MEDIUM = {
  en: "Presentail FAQs in {city} | Gift Delivery Help",
  ar: "Presentail في {city} | أسئلة التوصيل الشائعة",
  fr: "Presentail FAQ livraison à {city} | Aide cadeaux",
  el: "Presentail στην {city} | Βοήθεια αποστολής δώρων",
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
    h1: params.city.trim()
      ? formatTemplate(ROUTE_H1[l].faqs, params)
      : {
          en: "Flower & Gift Delivery — Your Questions Answered",
          ar: "توصيل الزهور والهدايا — إجابات على أسئلتك",
          fr: "Livraison de fleurs et cadeaux — réponses à vos questions",
          el: "Παράδοση λουλουδιών και δώρων — απαντήσεις στις ερωτήσεις σας",
        }[l],
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
  el: "Επικοινωνία Presentail στην {city} | Υποστήριξη αποστολής",
};

const CONTACT_TITLE_FALLBACK = {
  en: "Contact Presentail in {city}",
  ar: "تواصل مع Presentail في {city}",
  fr: "Contacter Presentail à {city}",
  el: "Επικοινωνία Presentail στην {city}",
};

const CONTACT_TITLE_MEDIUM = {
  en: "Presentail Contact in {city} | Delivery Help",
  ar: "تواصل مع Presentail {city} | دعم التوصيل",
  fr: "Contact Presentail {city} | Aide livraison",
  el: "Presentail στην {city} | Βοήθεια αποστολής",
};

// Used when no city is selected — avoids a dangling preposition ("in", "في", "à").
const CONTACT_TITLE_NO_CITY = {
  en: "Contact Presentail | Gift Delivery Help",
  ar: "تواصل مع Presentail | دعم التوصيل",
  fr: "Contacter Presentail | Aide livraison",
  el: "Επικοινωνία Presentail | Υποστήριξη αποστολής δώρων",
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
      h1: {
        en: "Talk to Us — Order & Delivery Help",
        ar: "تواصل معنا — دعم الطلبات والتوصيل",
        fr: "Contactez-nous — aide aux commandes et livraisons",
        el: "Επικοινωνήστε μαζί μας — βοήθεια παραγγελιών και αποστολών",
      }[l],
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
    h1: formatTemplate(ROUTE_H1[l].contact, params),
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
  const h1Tpl = ROUTE_H1[l][key] ?? ROUTE_H1[l].home;
  return meta({
    title: formatTemplate(titleTpl, params),
    h1: formatTemplate(h1Tpl, params),
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

export function normalizeSeoText(value) {
  return String(value ?? "")
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|nbsp);/gi, (entity) => ({
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": "\"",
      "&apos;": "'",
      "&#39;": "'",
      "&#x27;": "'",
      "&nbsp;": " ",
    })[entity.toLowerCase()] ?? entity)
    .normalize("NFKC")
    .replace(/\s*(?:[|—–-]\s*)?presentail(?:['’]s)?\s*$/iu, "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Per-city home-page SEO overrides.
//
// Some city landing pages carry hand-written, high-intent title/description/H1
// copy instead of the generic "{routeKey} in {city}" templates. Keyed by the
// "{country}-{city}" cityKey, then language. Only cities listed here are
// affected — every other city keeps the template output unchanged.
//
// The override also feeds OG/Twitter copy (share cards must agree with the
// page title/description) and the server-injected visible H1 + hero intro.
// ---------------------------------------------------------------------------
/**
 * @type {Record<string, Partial<Record<"en" | "ar" | "fr" | "el", {
 *   title: string;
 *   description: string;
 *   h1: string;
 *   intro: string;
 *   whyHeading?: string;
 *   whyPoints?: string[];
 *   faqs?: Array<{ question: string; answer: string }>;
 * }>>>}
 */
export const CITY_HOME_SEO_OVERRIDES = {
  "lb-beirut": {
    en: {
      title: "Flower & Gift Delivery in Beirut | Presentail", // i18n-ignore — crawler-facing EN copy
      description:
        "Send flowers, cakes, balloons, plants, chocolates and gifts online in Beirut. Express same-day delivery available with Presentail.", // i18n-ignore — crawler-facing EN copy
      h1: "Flower & Gift Delivery in Beirut", // i18n-ignore — crawler-facing EN copy
      intro:
        "Presentail serves every corner of the Lebanese capital, delivering across Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, Ras Beirut, and the wider metropolitan area. Beirut's vibrant blend of historic neighbourhoods, waterfront promenades, and contemporary dining districts makes it a city in constant creative motion. From a surprise birthday bouquet in Sassine Square to a luxury hamper delivered to a Sodeco penthouse, our same-day service keeps pace with the capital's energy.", // i18n-ignore — crawler-facing EN copy
      whyHeading: "Why Presentail", // i18n-ignore — crawler-facing EN copy
      whyPoints: [
        "Same-day flower delivery in Beirut on eligible orders", // i18n-ignore — crawler-facing EN copy
        "Hand-arranged bouquets from trusted local florists", // i18n-ignore — crawler-facing EN copy
        "Free personalised card message with every order", // i18n-ignore — crawler-facing EN copy
        "Order from anywhere in the world and pay in your own currency", // i18n-ignore — crawler-facing EN copy
      ],
      // Shared FAQ source of truth: rendered visibly in the server-injected
      // body AND in the hydrated React page (SEOContentSection overrides),
      // and mirrored 1:1 into FAQPage JSON-LD — all three must stay identical.
      // i18n-ignore-block — crawler-facing EN copy for the Beirut landing page
      faqs: [
        {
          question: "Is same-day flower delivery available in Beirut?",
          answer: "Yes. Same-day flower delivery is available in Beirut on eligible orders placed early enough in the day. Orders placed later are delivered the next day.",
        },
        {
          question: "Which areas of Beirut does Presentail deliver to?",
          answer: "Presentail delivers across Beirut, including Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael and Ras Beirut.",
        },
        {
          question: "Can I schedule a flower delivery in Beirut for a future date?",
          answer: "Yes. During checkout you can choose a future delivery date, so your flowers arrive exactly on the birthday, anniversary or occasion you are celebrating.",
        },
        {
          question: "Can I include a personalised card message with my Beirut order?",
          answer: "Yes. Every order can include a free personalised card message — add it at checkout and it is delivered with your flowers.",
        },
        {
          question: "What payment methods are accepted for Beirut orders?",
          answer: `We accept ${LOCATION_DATA.lb.paymentAccepted} for all orders delivered in Beirut.`,
        },
        {
          question: "Can I order flowers for Beirut from outside Lebanon?",
          answer: "Yes. Presentail is built for sending gifts from abroad — order online from anywhere in the world, pay in your own currency, and we deliver to your recipient in Beirut.",
        },
        {
          question: "What happens if the recipient is unavailable at delivery time?",
          answer: "Our team will contact the recipient to arrange delivery. If they cannot be reached, we coordinate with you to redeliver or leave the order with someone at the address.",
        },
      ],
    },
    ar: {
      title: "توصيل هدايا في لبنان وبيروت | Presentail",
      description:
        "اطلب توصيل هدايا في لبنان وبيروت: ورد، كيك، بالونات، شوكولاتة ونباتات. توصيل سريع في نفس اليوم إلى جميع المناطق مع Presentail.",
      h1: "توصيل الزهور والهدايا في لبنان وبيروت",
      // TODO: ar intro/faqs not yet authored — client renders generic FAQ set for ar-lb/beirut
    },
    fr: {
      title: "Livraison de fleurs et cadeaux à Beyrouth | Presentail",
      description:
        "Envoyez fleurs, gâteaux, ballons, plantes, chocolats et cadeaux en ligne à Beyrouth. Livraison express le jour même disponible avec Presentail.",
      h1: "Livraison de fleurs et cadeaux à Beyrouth",
      intro:
        "Presentail dessert chaque recoin de la capitale libanaise, livrant à Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael, Ras Beirut et la grande région métropolitaine. Le mélange vibrant de Beyrouth entre quartiers historiques, promenades en bord de mer et districts gastronomiques contemporains en fait une ville en perpétuel mouvement créatif. D'un bouquet-surprise à Sassine à un luxueux panier livré dans un penthouse à Sodeco, notre service du jour suit l'énergie de la capitale.",
      whyHeading: "Pourquoi Presentail",
      whyPoints: [
        "Livraison de fleurs le jour même à Beyrouth pour les commandes éligibles",
        "Bouquets composés à la main par des fleuristes locaux de confiance",
        "Carte personnalisée gratuite avec chaque commande",
        "Commandez depuis le monde entier et payez dans votre propre devise",
      ],
      faqs: [
        {
          question: "La livraison de fleurs le jour même est-elle disponible à Beyrouth ?",
          answer: "Oui. La livraison de fleurs le jour même est disponible à Beyrouth pour les commandes éligibles passées suffisamment tôt. Les commandes passées plus tard sont livrées le lendemain.",
        },
        {
          question: "Dans quels quartiers de Beyrouth Presentail livre-t-il ?",
          answer: "Presentail livre dans tout Beyrouth, notamment à Hamra, Achrafieh, Gemmayzeh, Verdun, Badaro, Mar Mikhael et Ras Beirut.",
        },
        {
          question: "Puis-je programmer une livraison de fleurs à Beyrouth à une date ultérieure ?",
          answer: "Oui. Lors du paiement, vous pouvez choisir une date de livraison ultérieure afin que vos fleurs arrivent précisément le jour de l'anniversaire ou de l'occasion célébrée.",
        },
        {
          question: "Puis-je ajouter un message personnalisé à ma commande pour Beyrouth ?",
          answer: "Oui. Chaque commande peut inclure gratuitement un message personnalisé sur une carte — ajoutez-le lors du paiement et il sera livré avec vos fleurs.",
        },
        {
          question: "Quels moyens de paiement sont acceptés pour les commandes à Beyrouth ?",
          answer: `Nous acceptons ${LOCATION_DATA.lb.paymentAccepted} pour toutes les commandes livrées à Beyrouth.`,
        },
        {
          question: "Puis-je commander des fleurs pour Beyrouth depuis l'étranger ?",
          answer: "Oui. Presentail est conçu pour envoyer des cadeaux depuis l'étranger — commandez en ligne depuis n'importe où dans le monde, payez dans votre propre devise et nous livrons votre destinataire à Beyrouth.",
        },
        {
          question: "Que se passe-t-il si le destinataire est absent au moment de la livraison ?",
          answer: "Notre équipe contactera le destinataire pour organiser la livraison. S'il reste injoignable, nous nous coordonnerons avec vous pour effectuer une nouvelle livraison ou confier la commande à une personne présente à l'adresse.",
        },
      ],
    },
  },

  "lb-batroun": {
    en: {
      title: "Flower & Gift Delivery in Batroun | Presentail", // i18n-ignore — crawler-facing EN SEO copy
      description:
        "Order fresh flowers online for delivery in Batroun, Lebanon. Shop bouquets, roses and thoughtful gifts with same-day delivery available on eligible orders.", // i18n-ignore
      h1: "Flower & Gift Delivery in Batroun", // i18n-ignore
      intro:
        "Send fresh flowers to Batroun, Lebanon from anywhere in the world. Hand-arranged bouquets, roses and thoughtful gifts delivered across Batroun, Hamat, Douma, Tannourine and Rachkida, with same-day delivery available on eligible orders.", // i18n-ignore
      whyHeading: "Why Presentail", // i18n-ignore
      whyPoints: [
        "Same-day flower delivery in Batroun on eligible orders", // i18n-ignore
        "Hand-arranged bouquets from trusted local florists", // i18n-ignore
        "Free personalised card message with every order", // i18n-ignore
        "Order from anywhere in the world and pay in your own currency", // i18n-ignore
      ],
      // Shared FAQ source of truth: rendered visibly in the server-injected
      // body AND in the hydrated React page (SEOContentSection overrides),
      // and mirrored 1:1 into FAQPage JSON-LD — all three must stay identical.
      // i18n-ignore-block — crawler-facing EN copy for the Batroun landing page
      faqs: [
        {
          question: "Does Presentail deliver flowers in Batroun?",
          answer: "Yes. Presentail delivers fresh flowers, bouquets and curated gifts to Batroun, Lebanon, with same-day delivery available on eligible orders.",
        },
        {
          question: "Is same-day flower delivery available in Batroun?",
          answer: "Yes. Same-day flower delivery is available in Batroun on eligible orders placed early enough in the day. Orders placed later are delivered the next day.",
        },
        {
          question: "What is the same-day ordering cutoff?",
          answer: "The exact cutoff depends on the products in your order — checkout shows the delivery dates available for your address, so you always see before paying whether same-day is possible.",
        },
        {
          question: "Which Batroun areas do you deliver to?",
          answer: "Presentail delivers across Batroun and its surrounding areas, including Hamat, Douma, Tannourine and Rachkida.",
        },
        {
          question: "Can I schedule a future delivery date?",
          answer: "Yes. During checkout you can choose a future delivery date, so your flowers arrive exactly on the birthday, anniversary or occasion you are celebrating.",
        },
        {
          question: "Can I send flowers to Batroun from outside Lebanon?",
          answer: "Yes. Presentail is built for sending gifts from abroad — order online from anywhere in the world, pay in your own currency, and we deliver to your recipient in Batroun.",
        },
        {
          question: "Can I add a personalised card message?",
          answer: "Yes. Every order can include a free personalised card message — add it at checkout and it is delivered with your flowers.",
        },
        {
          question: "Which payment methods are accepted?",
          answer: `We accept ${LOCATION_DATA.lb.paymentAccepted} for all orders delivered in Batroun.`,
        },
        {
          question: "What happens if the recipient is unavailable?",
          answer: "Our team will contact the recipient to arrange delivery. If they cannot be reached, we coordinate with you to redeliver or leave the order with someone at the address.",
        },
      ],
    },
  },

  "lb-tripoli": {
    en: {
      title: "Flower & Gift Delivery in Tripoli | Presentail", // i18n-ignore — crawler-facing EN SEO copy
      description:
        "Order fresh flowers online for delivery in Tripoli, Lebanon. Shop bouquets, roses and thoughtful gifts with same-day delivery available on eligible orders.", // i18n-ignore
      h1: "Flower & Gift Delivery in Tripoli", // i18n-ignore
      intro:
        "Send fresh flowers to Tripoli, Lebanon from anywhere in the world. Hand-arranged bouquets, roses and thoughtful gifts delivered across El Mina, Bab El Tabbaneh, Qobbeh, Beddawi and Zahrieh, with same-day delivery available on eligible orders.", // i18n-ignore
      whyHeading: "Why Presentail", // i18n-ignore
      whyPoints: [
        "Same-day flower delivery in Tripoli on eligible orders", // i18n-ignore
        "Hand-arranged bouquets from trusted local florists", // i18n-ignore
        "Free personalised card message with every order", // i18n-ignore
        "Order from anywhere in the world and pay in your own currency", // i18n-ignore
      ],
      // Shared FAQ source of truth: rendered visibly in the server-injected
      // body AND in the hydrated React page (SEOContentSection overrides),
      // and mirrored 1:1 into FAQPage JSON-LD — all three must stay identical.
      // i18n-ignore-block — crawler-facing EN copy for the Tripoli landing page
      faqs: [
        {
          question: "Is same-day flower delivery available in Tripoli?",
          answer: "Yes. Same-day flower delivery is available in Tripoli, Lebanon on eligible orders placed early enough in the day. Orders placed later are delivered the next day.",
        },
        {
          question: "Which areas of Tripoli does Presentail deliver to?",
          answer: "Presentail delivers across Tripoli and its district, including El Mina, Bab El Tabbaneh, Qobbeh, Beddawi and Zahrieh.",
        },
        {
          question: "What is the cutoff time for same-day delivery in Tripoli?",
          answer: "Same-day delivery in Tripoli is available for orders placed early enough in the day. The exact cutoff depends on the products in your order — checkout shows the delivery dates available for your address, so you always see before paying whether same-day is possible.",
        },
        {
          question: "Can I schedule a flower delivery in Tripoli for a future date?",
          answer: "Yes. During checkout you can choose a future delivery date, so your flowers arrive exactly on the birthday, anniversary or occasion you are celebrating.",
        },
        {
          question: "Can I include a personalised card message with my Tripoli order?",
          answer: "Yes. Every order can include a free personalised card message — add it at checkout and it is delivered with your flowers.",
        },
        {
          question: "What payment methods are accepted for Tripoli orders?",
          answer: `We accept ${LOCATION_DATA.lb.paymentAccepted} for all orders delivered in Tripoli.`,
        },
        {
          question: "Can I order flowers for Tripoli from outside Lebanon?",
          answer: "Yes. Presentail is built for sending gifts from abroad — order online from anywhere in the world, pay in your own currency, and we deliver to your recipient in Tripoli.",
        },
        {
          question: "What happens if the recipient is unavailable at delivery time?",
          answer: "Our team will contact the recipient to arrange delivery. If they cannot be reached, we coordinate with you to redeliver or leave the order with someone at the address.",
        },
      ],
    },
  },
};

/**
 * Return the home-page SEO override for a cityKey + lang, or null when the
 * city has no override (the caller falls back to the generic templates).
 */
export function getCityHomeSeoOverride(cityKey, lang) {
  if (!cityKey) return null;
  const entry = CITY_HOME_SEO_OVERRIDES[cityKey];
  if (!entry) return null;
  return entry[lang] ?? null;
}

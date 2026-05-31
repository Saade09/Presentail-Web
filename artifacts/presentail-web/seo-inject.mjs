// Server-side SEO HTML injection. Used by the Vite dev plugin and the
// production Node serve script so locale-prefixed URLs return HTML with
// <title>, <meta description>, OG/Twitter tags, canonical and hreflang
// alternates already present in the initial document (no JS required).

const SUPPORTED_LANGS = ["en", "ar", "fr"];
const SUPPORTED_COUNTRY_SLUGS = ["ae", "lb", "cy"];

/**
 * Pick the best supported UI language from an HTTP Accept-Language header
 * value (e.g. "ar,en-US;q=0.9,fr;q=0.8"). Returns the first tag whose
 * primary subtag matches a SUPPORTED_LANGS entry, or null when none match.
 * Exported so callers (serve.mjs, vite.config.ts) can test it independently.
 */
export function pickLangFromAcceptLanguage(header) {
  if (!header) return null;
  const parts = String(header).split(",");
  for (const part of parts) {
    const tag = part.split(";")[0].trim().toLowerCase();
    const primary = tag.split("-")[0];
    if (SUPPORTED_LANGS.includes(primary)) return primary;
  }
  return null;
}

// Mirror of CITY_SLUGS_BY_COUNTRY in src/lib/locale-route.ts. Keep in sync
// with that file — both lists must agree or shoppers get an SEO-rendered
// page for a slug the SPA refuses to route to.
const CITY_SLUGS_BY_COUNTRY = {
  lb: [
    "akkar", "aley", "baabda", "baalbeck", "batroun", "bcharee", "beirut",
    "bent-jbeil", "chouf", "hasbaya", "hermel", "jbail", "jezzine",
    "kasserwan", "koura", "marjayoun", "metn", "minnieh-dennaya", "nabatieh",
    "rechaya", "saida", "tripoli", "tyre", "west-bekaa", "zahle", "zghorta",
  ],
  ae: [
    "abu-dhabi", "ajman", "dubai", "fujairah", "ras-al-khaimah", "sharjah",
    "umm-al-quwain",
  ],
  cy: ["larnaca", "limassol", "nicosia", "paphos"],
};

function isSupportedCity(country, city) {
  return CITY_SLUGS_BY_COUNTRY[country]?.includes(city) ?? false;
}

const COUNTRY_NAMES = {
  en: { ae: "the UAE", lb: "Lebanon", cy: "Cyprus" },
  ar: {
    ae: "الإمارات العربية المتحدة",
    lb: "لبنان",
    cy: "قبرص",
  },
  fr: { ae: "Émirats arabes unis", lb: "Liban", cy: "Chypre" },
};

const CITY_NAMES = {
  en: {
    "ae-dubai": "Dubai",
    "ae-abu-dhabi": "Abu Dhabi",
    "ae-sharjah": "Sharjah",
    "ae-ajman": "Ajman",
    "ae-ras-al-khaimah": "Ras Al Khaimah",
    "ae-fujairah": "Fujairah",
    "ae-umm-al-quwain": "Umm Al Quwain",
    "lb-beirut": "Beirut",
    "lb-jounieh": "Jounieh",
    "lb-tripoli": "Tripoli",
    "lb-saida": "Saida",
    "lb-tyre": "Tyre",
    "lb-zahle": "Zahle",
    "lb-byblos": "Byblos",
    "lb-baalbek": "Baalbek",
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
    "lb-beirut": "بيروت",
    "lb-jounieh": "جونيه",
    "lb-tripoli": "طرابلس",
    "lb-saida": "صيدا",
    "lb-tyre": "صور",
    "lb-zahle": "زحلة",
    "lb-byblos": "جبيل",
    "lb-baalbek": "بعلبك",
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
    "lb-beirut": "Beyrouth",
    "lb-jounieh": "Jounieh",
    "lb-tripoli": "Tripoli",
    "lb-saida": "Saïda",
    "lb-tyre": "Tyr",
    "lb-zahle": "Zahlé",
    "lb-byblos": "Byblos",
    "lb-baalbek": "Baalbek",
    "cy-nicosia": "Nicosie",
    "cy-limassol": "Limassol",
    "cy-larnaca": "Larnaca",
    "cy-paphos": "Paphos",
  },
};

const TITLES = {
  en: {
    landing: "Online Flower & Gift Delivery | Presentail | Express Delivery",
    home: "Flower & Gift Delivery in {city} | Presentail",
    shop: "Shop Flowers & Gifts in {city} | Presentail",
    product: "Gift Delivery in {city} | Presentail",
    brands: "Partner Brands in {city} | Presentail",
    brand: "Brand Collection in {city} | Presentail",
    cart: "Your Bag | Presentail",
    checkout: "Checkout | Presentail",
    orderConfirmed: "Order Confirmed | Presentail",
    auth: "Sign In | Presentail",
    account: "My Account | Presentail",
    careers: "Careers at Presentail",
    blog: "The Atelier Journal | Presentail",
    partner: "Partner With Presentail | Brand Collaborations",
    deliveryRates: "Delivery Rates & Coverage | Presentail",
    investor: "Investor Relations | Presentail",
    weddings: "Weddings & Florals by Presentail",
    corporate: "Corporate Gifting | Presentail",
    contact: "Contact Presentail | Concierge",
    faqs: "FAQs | Presentail",
    terms: "Terms of Use | Presentail",
    privacy: "Privacy Policy | Presentail",
  },
  ar: {
    landing: "توصيل الأزهار والهدايا أونلاين | Presentail | توصيل سريع",
    home: "توصيل الأزهار والهدايا في {city} | Presentail",
    shop: "تسوّق الأزهار والهدايا في {city} | Presentail",
    product: "توصيل الهدايا في {city} | Presentail",
    brands: "العلامات الشريكة في {city} | Presentail",
    brand: "مجموعة العلامة في {city} | Presentail",
    cart: "حقيبتك | Presentail",
    checkout: "الدفع | Presentail",
    orderConfirmed: "تم تأكيد الطلب | Presentail",
    auth: "تسجيل الدخول | Presentail",
    account: "حسابي | Presentail",
    about: "عن بريزانتيل | الأزهار والهدايا الفاخرة",
    careers: "الوظائف في بريزانتيل",
    blog: "يوميّات الأتيليه | Presentail",
    partner: "كن شريكاً مع Presentail | تعاون العلامات",
    deliveryRates: "أسعار التوصيل والتغطية | Presentail",
    investor: "علاقات المستثمرين | Presentail",
    weddings: "الأعراس والتنسيقات الزهرية | Presentail",
    corporate: "الإهداء للشركات | Presentail",
    contact: "تواصل مع Presentail | الكونسيرج",
    faqs: "الأسئلة الشائعة | Presentail",
    terms: "شروط الاستخدام | Presentail",
    privacy: "سياسة الخصوصية | Presentail",
  },
  fr: {
    landing: "Livraison de fleurs et cadeaux en ligne | Presentail | Livraison express",
    home: "Livraison de fleurs et cadeaux à {city} | Presentail",
    shop: "Boutique fleurs et cadeaux à {city} | Presentail",
    product: "Livraison de cadeaux à {city} | Presentail",
    brands: "Marques partenaires à {city} | Presentail",
    brand: "Collection de la marque à {city} | Presentail",
    cart: "Votre sac | Presentail",
    checkout: "Paiement | Presentail",
    orderConfirmed: "Commande confirmée | Presentail",
    auth: "Connexion | Presentail",
    account: "Mon compte | Presentail",
    about: "À propos de Presentail | Fleurs et cadeaux de luxe",
    careers: "Carrières chez Presentail",
    blog: "Le Journal de l'Atelier | Presentail",
    partner: "Devenir partenaire de Presentail | Collaborations de marques",
    deliveryRates: "Tarifs de livraison et couverture | Presentail",
    investor: "Relations investisseurs | Presentail",
    weddings: "Mariages et compositions florales | Presentail",
    corporate: "Cadeaux d'entreprise | Presentail",
    contact: "Contacter Presentail | Conciergerie",
    faqs: "FAQ | Presentail",
    terms: "Conditions d'utilisation | Presentail",
    privacy: "Politique de confidentialité | Presentail",
  },
};

const DESCRIPTIONS = {
  en: {
    landing:
      "Send luxury flowers, gifts, cakes, and curated arrangements across the GCC with Presentail. Same-day delivery available in selected cities.",
    home: "Send luxury flowers, cakes and gifts in {city}, {country} with same-day delivery from Presentail.",
    shop: "Browse Presentail's curated bouquets, cakes and luxury gifts for delivery in {city}, {country}.",
    product: "Order this gift for delivery in {city}, {country} with Presentail.",
    brands:
      "Discover Presentail's hand-picked partner brands available for delivery in {city}, {country}.",
    brand: "Shop this brand's full collection for delivery in {city}, {country} on Presentail.",
    cart: "Review your Presentail bag and proceed to a secure checkout.",
    checkout:
      "Complete your Presentail order with secure card, PayPal or Mamo payment.",
    orderConfirmed: "Thank you — your Presentail order has been confirmed.",
    auth: "Sign in or create a Presentail account to manage orders and addresses.",
    account: "Manage your Presentail profile, orders and saved addresses.",
    about: "Presentail is a luxury flower and gift atelier delivering across Lebanon, the UAE and Cyprus. Meet the team and the craft behind every send.",
    careers: "Join Presentail — we're hiring florists, designers, and engineers to build the most thoughtful gifting experience in the region.",
    blog: "Notes from the Presentail studio: seasonal sourcing, partner makers, and gifting guides for life's most meaningful moments.",
    partner: "Partner with Presentail to bring your brand to luxury gifting customers across Lebanon, the UAE and Cyprus.",
    deliveryRates: "Delivery rates, slots and coverage areas for Presentail flower and gift orders across Lebanon, the UAE and Cyprus.",
    investor: "Investor relations at Presentail — financials, growth plans and contact details for prospective partners.",
    weddings: "Bespoke floral design and styling for weddings and private events by the Presentail atelier.",
    corporate: "Corporate gifting programs from Presentail — curated client and team gifts at scale, delivered region-wide.",
    contact: "Get in touch with the Presentail concierge for orders, partnerships and support.",
    faqs: "Answers to the most common questions about Presentail orders, delivery, payment and accounts.",
    terms: "The Terms of Use that govern your purchase and use of the Presentail website, mobile apps and services.",
    privacy: "How Presentail collects, uses and protects your personal information across our website, mobile apps and social channels.",
  },
  ar: {
    landing:
      "أرسل أزهاراً وهدايا وكعكاً وتشكيلات منتقاة في دول الخليج مع Presentail. توصيل في اليوم ذاته متاح في مدن مختارة.",
    home: "أرسل الأزهار الفاخرة والكعك والهدايا في {city}، {country} مع توصيل في نفس اليوم من Presentail.",
    shop: "تصفّح باقات Presentail المنتقاة والكعك والهدايا الفاخرة للتوصيل في {city}، {country}.",
    product: "اطلب هذه الهدية للتوصيل في {city}، {country} مع Presentail.",
    brands:
      "اكتشف العلامات الشريكة المنتقاة من Presentail والمتاحة للتوصيل في {city}، {country}.",
    brand: "تسوّق المجموعة الكاملة لهذه العلامة للتوصيل في {city}، {country} عبر Presentail.",
    cart: "راجع حقيبة Presentail وتابع إلى الدفع الآمن.",
    checkout: "أكمل طلب Presentail عبر الدفع الآمن بالبطاقة أو PayPal أو Mamo.",
    orderConfirmed: "شكراً لك — تم تأكيد طلب Presentail الخاص بك.",
    auth: "سجّل الدخول أو أنشئ حساب Presentail لإدارة الطلبات والعناوين.",
    account: "أدر بيانات حساب Presentail والطلبات والعناوين المحفوظة.",
    about: "بريزانتيل أتيليه فاخر للأزهار والهدايا، يوصّل في لبنان والإمارات وقبرص. تعرّف على الفريق والحرفة وراء كل هدية.",
    careers: "انضم إلى بريزانتيل — نوظّف منسّقي أزهار ومصمّمين ومهندسين لبناء أكثر تجارب الإهداء عناية في المنطقة.",
    blog: "ملاحظات من استوديو بريزانتيل: مصادر موسمية، صنّاع شركاء، وأدلّة إهداء لأهمّ لحظات الحياة.",
    partner: "كن شريكاً مع بريزانتيل لتقديم علامتك إلى عملاء الإهداء الفاخر في لبنان والإمارات وقبرص.",
    deliveryRates: "أسعار التوصيل والمواعيد ومناطق التغطية لطلبات بريزانتيل في لبنان والإمارات وقبرص.",
    investor: "علاقات المستثمرين في بريزانتيل — البيانات المالية وخطط النموّ وتفاصيل التواصل للشركاء المحتملين.",
    weddings: "تصميم وتنسيق زهور بريزانتيل المخصّص للأعراس والمناسبات الخاصّة.",
    corporate: "برامج الإهداء للشركات من بريزانتيل — هدايا منتقاة للعملاء والفِرَق على نطاق واسع.",
    contact: "تواصل مع كونسيرج بريزانتيل للطلبات والشراكات والدعم.",
    faqs: "إجابات على أكثر الأسئلة شيوعاً حول طلبات بريزانتيل والتوصيل والدفع والحسابات.",
    terms: "شروط الاستخدام التي تحكم شراءك واستخدامك لموقع بريزانتيل وتطبيقاته وخدماته.",
    privacy: "كيف تجمع بريزانتيل معلوماتك الشخصية وتستخدمها وتحميها عبر الموقع والتطبيقات والقنوات الاجتماعية.",
  },
  fr: {
    landing:
      "Envoyez des fleurs, cadeaux, gâteaux et compositions florales à travers le Golfe avec Presentail. Livraison le jour même disponible dans certaines villes.",
    home: "Envoyez des fleurs de luxe, des gâteaux et des cadeaux à {city}, {country} avec la livraison le jour même par Presentail.",
    shop: "Parcourez les bouquets, gâteaux et cadeaux de luxe Presentail pour livraison à {city}, {country}.",
    product: "Commandez ce cadeau pour livraison à {city}, {country} avec Presentail.",
    brands:
      "Découvrez les marques partenaires sélectionnées par Presentail, disponibles à la livraison à {city}, {country}.",
    brand: "Achetez la collection complète de cette marque pour livraison à {city}, {country} sur Presentail.",
    cart: "Revoyez votre sac Presentail et passez au paiement sécurisé.",
    checkout:
      "Finalisez votre commande Presentail par carte, PayPal ou Mamo en toute sécurité.",
    orderConfirmed: "Merci — votre commande Presentail a été confirmée.",
    auth: "Connectez-vous ou créez un compte Presentail pour gérer vos commandes et adresses.",
    account: "Gérez votre profil Presentail, vos commandes et vos adresses enregistrées.",
    about: "Presentail est un atelier de fleurs et cadeaux de luxe livrant au Liban, aux Émirats arabes unis et à Chypre. Découvrez l'équipe et le savoir-faire derrière chaque envoi.",
    careers: "Rejoignez Presentail — nous recrutons fleuristes, designers et ingénieurs pour bâtir la plus belle expérience cadeau de la région.",
    blog: "Notes du studio Presentail : sourcing de saison, artisans partenaires et guides cadeaux pour les moments qui comptent.",
    partner: "Devenez partenaire de Presentail pour présenter votre marque aux clients du cadeau de luxe au Liban, aux Émirats arabes unis et à Chypre.",
    deliveryRates: "Tarifs de livraison, créneaux et zones de couverture pour les commandes Presentail au Liban, aux Émirats arabes unis et à Chypre.",
    investor: "Relations investisseurs Presentail — éléments financiers, plans de croissance et contacts pour les partenaires.",
    weddings: "Design et stylisme floraux sur mesure pour mariages et événements privés par l'atelier Presentail.",
    corporate: "Programmes de cadeaux d'entreprise Presentail — sélections raffinées pour clients et équipes, livrées dans toute la région.",
    contact: "Contactez la conciergerie Presentail pour vos commandes, partenariats et questions.",
    faqs: "Réponses aux questions les plus fréquentes sur les commandes, la livraison, le paiement et les comptes Presentail.",
    terms: "Les Conditions d'utilisation qui régissent vos achats et votre utilisation du site, des applications et des services Presentail.",
    privacy: "Comment Presentail collecte, utilise et protège vos informations personnelles sur le site, les applications et les canaux sociaux.",
  },
};

const OG_LOCALE = { en: "en_US", ar: "ar_AE", fr: "fr_FR" };

// Localised SEO strings for shared wishlist pages.
// The wishlist share path (/favorites/share/:token) has no locale prefix so
// these default to "en", but the dict is structured so a lang can be passed
// in future if a locale is ever derivable from the visitor context.
const WISHLIST_SEO = {
  en: {
    titleOne: "Gift Wishlist — 1 item on Presentail",
    titleMany: "Gift Wishlist — {count} items on Presentail",
    descriptionOne:
      "Someone shared a wishlist with you on Presentail — luxury flowers and gifts delivered across Lebanon, the UAE and Cyprus.",
    descriptionMany:
      "Someone shared a wishlist of {count} gifts with you on Presentail — luxury flowers and gifts delivered across Lebanon, the UAE and Cyprus.",
    imageAlt: "Presentail Gift Wishlist",
  },
  ar: {
    titleOne: "قائمة هدايا — هدية واحدة على Presentail",
    titleMany: "قائمة هدايا — {count} هدايا على Presentail",
    descriptionOne:
      "شارك شخص ما قائمة هدايا معك على Presentail — أزهار وهدايا فاخرة توصّل في لبنان والإمارات وقبرص.",
    descriptionMany:
      "شارك شخص ما قائمة بـ{count} هدايا معك على Presentail — أزهار وهدايا فاخرة توصّل في لبنان والإمارات وقبرص.",
    imageAlt: "قائمة هدايا Presentail",
  },
  fr: {
    titleOne: "Liste de souhaits — 1 article sur Presentail",
    titleMany: "Liste de souhaits — {count} articles sur Presentail",
    descriptionOne:
      "Quelqu'un a partagé une liste de souhaits avec vous sur Presentail — fleurs et cadeaux de luxe livrés au Liban, aux Émirats arabes unis et à Chypre.",
    descriptionMany:
      "Quelqu'un a partagé une liste de {count} cadeaux avec vous sur Presentail — fleurs et cadeaux de luxe livrés au Liban, aux Émirats arabes unis et à Chypre.",
    imageAlt: "Liste de souhaits Presentail",
  },
};

const ROUTE_KEYS = [
  { test: (r) => r === "" || r === "/", key: "home" },
  { test: (r) => r === "/shop", key: "shop" },
  { test: (r) => r.startsWith("/product"), key: "product" },
  { test: (r) => r === "/brands", key: "brands" },
  { test: (r) => r.startsWith("/brand/"), key: "brand" },
  { test: (r) => r === "/cart", key: "cart" },
  { test: (r) => r === "/checkout", key: "checkout" },
  { test: (r) => r === "/order-confirmed", key: "orderConfirmed" },
  { test: (r) => r === "/auth", key: "auth" },
  { test: (r) => r === "/account", key: "account" },
  { test: (r) => r === "/careers", key: "careers" },
  { test: (r) => r === "/blog", key: "blog" },
  { test: (r) => r === "/partner", key: "partner" },
  { test: (r) => r === "/delivery-rates", key: "deliveryRates" },
  { test: (r) => r === "/investor", key: "investor" },
  { test: (r) => r === "/weddings", key: "weddings" },
  { test: (r) => r === "/corporate", key: "corporate" },
  { test: (r) => r === "/contact", key: "contact" },
  { test: (r) => r === "/faqs", key: "faqs" },
  { test: (r) => r === "/terms", key: "terms" },
  { test: (r) => r === "/privacy", key: "privacy" },
];

function detectRouteKey(rest) {
  for (const r of ROUTE_KEYS) if (r.test(rest)) return r.key;
  return "home";
}

const LOCALE_RE = /^([a-z]{2})-([a-z]{2})$/;

function parseLocalePath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const m = first.match(LOCALE_RE);
  if (
    !m ||
    !SUPPORTED_LANGS.includes(m[1]) ||
    !SUPPORTED_COUNTRY_SLUGS.includes(m[2])
  ) {
    return {
      hasLocalePrefix: false,
      lang: null,
      country: null,
      city: null,
      rest: pathname || "/",
    };
  }
  const city = segments[1] ?? null;
  const restSegs = city ? segments.slice(2) : [];
  const rest = restSegs.length ? "/" + restSegs.join("/") : "";
  return { hasLocalePrefix: true, lang: m[1], country: m[2], city, rest };
}

function buildLocalePath({ lang, country, city, rest }) {
  let p = `/${lang}-${country}`;
  if (city) p += `/${city}`;
  if (rest && rest !== "/") p += rest.startsWith("/") ? rest : "/" + rest;
  return p;
}

function format(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cityLabelFromSlug(slug) {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Small in-process LRU+TTL cache for the generic locale-aware head snippet.
// `buildSeoHead` is invoked for every request that hits the SPA shell —
// including high-traffic non-entity routes like `/{lang}-{country}/{city}` and
// `/shop` — and its output is fully determined by (pathname, basePath, origin).
// Caching the result for ~60s makes repeat crawler / user hits essentially
// free without changing per-route content. Bounded with simple FIFO eviction
// (re-inserting on hit gives LRU-ish behaviour).
const GENERIC_SEO_CACHE_TTL_MS = 60_000;
const GENERIC_SEO_CACHE_MAX_ENTRIES = 500;
export const genericSeoCache = new Map();

function genericSeoCacheKey(pathname, basePath, origin) {
  return `${pathname}\u0000${basePath}\u0000${origin}`;
}

export function getCachedGenericSeo(key) {
  const entry = genericSeoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    genericSeoCache.delete(key);
    return null;
  }
  genericSeoCache.delete(key);
  genericSeoCache.set(key, entry);
  return entry.value;
}

export function setCachedGenericSeo(key, value) {
  if (genericSeoCache.size >= GENERIC_SEO_CACHE_MAX_ENTRIES) {
    const oldest = genericSeoCache.keys().next().value;
    if (oldest !== undefined) genericSeoCache.delete(oldest);
  }
  genericSeoCache.set(key, {
    value,
    expiresAt: Date.now() + GENERIC_SEO_CACHE_TTL_MS,
  });
}

/**
 * Build the SEO `<head>` snippet for the given pathname. `basePath` is the
 * artifact base prefix (e.g. "" or "/app"). `origin` is the site origin used
 * for absolute canonical / hreflang URLs.
 */
export function buildSeoHead(pathname, { origin = "", basePath = "" } = {}) {
  const cacheKey = genericSeoCacheKey(pathname, basePath, origin);
  const cached = getCachedGenericSeo(cacheKey);
  if (cached) return cached;
  const value = computeSeoHead(pathname, { origin, basePath });
  setCachedGenericSeo(cacheKey, value);
  return value;
}

function computeSeoHead(pathname, { origin = "", basePath = "" } = {}) {
  const parsed = parseLocalePath(pathname);
  const hasValidCity =
    parsed.hasLocalePrefix &&
    parsed.country &&
    parsed.city &&
    isSupportedCity(parsed.country, parsed.city);
  // Treat unsupported city slugs (e.g. /en-ae/al-ain/...) as out-of-locale
  // so we don't emit a localized canonical/hreflang for a route the SPA
  // will redirect away from.
  const inLocale =
    parsed.hasLocalePrefix && parsed.country && (!parsed.city || hasValidCity);
  const lang = parsed.lang ?? "en";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const routeKey = inLocale ? detectRouteKey(parsed.rest) : "landing";

  const cityKey =
    hasValidCity ? `${parsed.country}-${parsed.city}` : null;
  const cityLabel = cityKey
    ? CITY_NAMES[lang]?.[cityKey] ?? CITY_NAMES.en[cityKey] ?? cityLabelFromSlug(parsed.city)
    : "";
  const countryLabel = parsed.country
    ? COUNTRY_NAMES[lang]?.[parsed.country] ?? COUNTRY_NAMES.en[parsed.country]
    : "";

  const params = { city: cityLabel, country: countryLabel };
  const title = format(
    TITLES[lang]?.[routeKey] ?? TITLES.en[routeKey] ?? TITLES.en.landing,
    params,
  );
  const description = format(
    DESCRIPTIONS[lang]?.[routeKey] ??
      DESCRIPTIONS.en[routeKey] ??
      DESCRIPTIONS.en.landing,
    params,
  );

  const cleanBase = basePath.replace(/\/$/, "");
  const canonicalPath = inLocale ? pathname : "/";
  const canonicalHref = origin + cleanBase + canonicalPath;

  const lines = [];
  lines.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}" />`);
  lines.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:site_name" content="Presentail" />`);
  lines.push(
    `<meta property="og:locale" content="${escapeAttr(OG_LOCALE[lang] ?? "en_US")}" />`,
  );
  lines.push(`<meta property="og:url" content="${escapeAttr(canonicalHref)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  // Default OG / Twitter image for generic (non-entity) pages.
  const defaultImage = `${origin}${cleanBase}/opengraph.jpg`;
  const defaultImageAlt = "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta property="og:image:width" content="1200" />`);
  lines.push(`<meta property="og:image:height" content="630" />`);
  lines.push(`<meta property="og:image:alt" content="${escapeAttr(defaultImageAlt)}" />`);
  lines.push(`<meta name="twitter:image" content="${escapeAttr(defaultImage)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escapeAttr(defaultImageAlt)}" />`);
  // Organization JSON-LD on every generic page.
  lines.push(jsonLdTag(buildOrganizationSchema(`${origin}${cleanBase}`)));

  if (inLocale) {
    for (const altLang of SUPPORTED_LANGS) {
      const altPath = buildLocalePath({
        lang: altLang,
        country: parsed.country,
        city: parsed.city,
        rest: parsed.rest,
      });
      const href = origin + cleanBase + altPath;
      const code = `${altLang}-${parsed.country.toUpperCase()}`;
      lines.push(
        `<link rel="alternate" hreflang="${escapeAttr(code)}" href="${escapeAttr(href)}" />`,
      );
    }
    const xDefaultPath = buildLocalePath({
      lang: "en",
      country: parsed.country,
      city: parsed.city,
      rest: parsed.rest,
    });
    lines.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(origin + cleanBase + xDefaultPath)}" />`,
    );
  }

  return {
    lang,
    dir,
    title,
    headSnippet: lines.join("\n    "),
    titleTag: `<title>${escapeHtml(title)}</title>`,
    cityLabel,
    countryLabel,
  };
}

/**
 * Inject locale-aware tags into a raw index.html string. Replaces the existing
 * <title> and <html lang="..."> attributes, and inserts the head snippet
 * immediately before </head>.
 */
export function injectSeoTags(html, pathname, opts = {}) {
  const { lang, dir, headSnippet, titleTag } = buildSeoHead(pathname, opts);
  return assembleHtml(html, { lang, dir, headSnippet, titleTag });
}

function assembleHtml(html, { lang, dir, headSnippet, titleTag }) {
  let out = html;
  out = out.replace(
    /<html[^>]*>/i,
    `<html lang="${escapeAttr(lang)}" dir="${escapeAttr(dir)}">`,
  );
  if (/<title>[\s\S]*?<\/title>/i.test(out)) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, titleTag);
  } else {
    out = out.replace(/<head>/i, `<head>\n    ${titleTag}`);
  }
  out = out.replace(/<\/head>/i, `    ${headSnippet}\n  </head>`);
  return out;
}

// ---------------------------------------------------------------------------
// Per-product / brand / category Open Graph / Twitter Card injection
//
// WhatsApp, iMessage, Slack, Facebook, X, etc. only honour static meta tags in
// the initial HTML response — they do not execute the JS bundle. The generic
// SEO injector above produces site-wide previews; for `/product/<slug>`,
// `/brand/<slug>`, and `/shop?n=<slug>` (category landing) paths we
// additionally fetch the matching record server-side and override
// og:title / og:description / og:image / og:url / twitter:* with real data so
// shared links render with the entity's name, blurb, and primary image. Any
// failure (404, network error, slow upstream) falls back silently to the
// generic locale-aware preview.
// ---------------------------------------------------------------------------

const ENTITY_FETCH_TIMEOUT_MS = 2500;
const ENTITY_CACHE_TTL_MS = 60_000;
const ENTITY_CACHE_MAX_ENTRIES = 500;

// Small in-process LRU+TTL cache for the per-entity SEO lookup. WhatsApp /
// iMessage / Slack crawlers retry aggressively on shared product, brand, and
// category links, so caching the upstream lookup for ~60s makes repeat shares
// essentially free and protects the head-snippet renderer against transient
// upstream slowdowns. Negative results (404 / timeout / network error) are
// intentionally NOT cached so a transient blip can't pin an entity to the
// generic fallback for the full TTL.
const entitySeoCache = new Map();

function entityCacheKey({ kind, slug, lang, countryCode, cityId }) {
  return `${kind}\u0000${slug}\u0000${lang ?? ""}\u0000${countryCode ?? ""}\u0000${cityId ?? ""}`;
}

function getCachedEntity(key) {
  const entry = entitySeoCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entitySeoCache.delete(key);
    return null;
  }
  entitySeoCache.delete(key);
  entitySeoCache.set(key, entry);
  return entry.value;
}

// Returns the raw cache entry whether or not it has expired, so the caller
// can use stored ETag/Last-Modified headers to send a conditional request.
// Returns null only when the key is absent from the map entirely.
function getRawEntityCacheEntry(key) {
  return entitySeoCache.get(key) ?? null;
}

function setCachedEntity(key, value, etag = null, lastModified = null) {
  if (!value) return;
  if (entitySeoCache.size >= ENTITY_CACHE_MAX_ENTRIES) {
    const oldest = entitySeoCache.keys().next().value;
    if (oldest !== undefined) entitySeoCache.delete(oldest);
  }
  entitySeoCache.delete(key);
  entitySeoCache.set(key, {
    value,
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
    etag,
    lastModified,
  });
}

async function fetchEntityForSeoCached(kind, fetcher, opts, out = {}) {
  const key = entityCacheKey({
    kind,
    slug: opts.slug,
    lang: opts.lang,
    countryCode: opts.countryCode,
    cityId: opts.cityId,
  });

  const rawEntry = getRawEntityCacheEntry(key);
  const now = Date.now();
  const isFresh = rawEntry !== null && rawEntry.expiresAt > now;

  // When we have a cached entry that carries an ETag or Last-Modified header,
  // always send a conditional request — even within the cache TTL — so an
  // image swap at an unchanged CDN URL is detected on the very next crawler
  // hit rather than waiting up to 60 s for the entity TTL to expire. A 304
  // response is cheap (no body) and lets us serve the cached value unchanged;
  // a 200 tells us the entity changed so we evict dims and update the entry.
  //
  // When the upstream provided no validation headers (e.g. the API does not
  // yet emit ETag/Last-Modified), fall back to pure TTL-based caching so the
  // existing repeat-crawler protection remains in effect.
  const conditionalHeaders = {};
  if (rawEntry) {
    if (rawEntry.etag) conditionalHeaders["If-None-Match"] = rawEntry.etag;
    if (rawEntry.lastModified) conditionalHeaders["If-Modified-Since"] = rawEntry.lastModified;
  }
  const hasConditional = Object.keys(conditionalHeaders).length > 0;

  // No validation headers and still within TTL → serve cached value immediately.
  if (isFresh && !hasConditional) {
    entitySeoCache.delete(key);
    entitySeoCache.set(key, rawEntry);
    out.freshlyFetched = false;
    return rawEntry.value;
  }

  // Either the entry is stale OR we have validation headers: hit upstream.
  const fetchOpts = hasConditional ? { ...opts, conditionalHeaders } : opts;
  const result = await fetcher(fetchOpts);

  // 304 Not Modified: entity is unchanged. Restore the entry with a fresh TTL.
  // Image dims are NOT evicted — the entity's image URL(s) have not changed
  // so the cached dimensions remain accurate.
  if (result && result.notModified) {
    if (rawEntry) {
      const refreshed = { ...rawEntry, expiresAt: now + ENTITY_CACHE_TTL_MS };
      entitySeoCache.delete(key);
      if (entitySeoCache.size >= ENTITY_CACHE_MAX_ENTRIES) {
        const oldest = entitySeoCache.keys().next().value;
        if (oldest !== undefined) entitySeoCache.delete(oldest);
      }
      entitySeoCache.set(key, refreshed);
      out.freshlyFetched = false;
      return rawEntry.value;
    }
    out.freshlyFetched = false;
    return null;
  }

  // 200 (new or changed entity): evict image-dims cache entries so the fresh
  // entity always gets freshly measured dimensions. This prevents stale dims
  // surviving up to 1 hour when the CDN replaces an image at an unchanged URL.
  if (result && result.value) {
    for (const url of extractEntityImageUrls(result.value)) evictImageDims(url);
    setCachedEntity(key, result.value, result.etag, result.lastModified);
    out.freshlyFetched = true;
    return result.value;
  }

  // Fetch failed (network error, 4xx, timeout). If we were revalidating a
  // fresh cached entry (conditional request within TTL), serve the cached
  // value rather than degrading to the generic fallback — the entity content
  // has not been confirmed changed, so staleness is preferable to a broken
  // preview.
  if (isFresh && rawEntry) {
    out.freshlyFetched = false;
    return rawEntry.value;
  }

  out.freshlyFetched = false;
  return null;
}

// ---------------------------------------------------------------------------
// Image dimension cache + fetcher
//
// Crawlers that receive og:image without og:image:width / og:image:height may
// downgrade the preview card to a thumbnail rather than a banner. We resolve
// the actual pixel dimensions of entity images by fetching the first 4 KiB
// (Range: bytes=0-4095) and parsing the format header — enough for PNG (24 B),
// JPEG (scan SOF markers, typically within 2 KB), and WebP VP8X/VP8L.
//
// Results are cached for 1 hour so repeated crawler retries are free.
// Null (parsed but couldn't determine dims) IS cached; network errors are NOT
// (transient failures should be retried on the next crawler hit).
// ---------------------------------------------------------------------------

const IMAGE_DIMS_CACHE_TTL_MS = 3_600_000; // 1 hour
const IMAGE_DIMS_CACHE_MAX_ENTRIES = 1_000;
const IMAGE_DIM_FETCH_TIMEOUT_MS = 2_000;
const imageDimsCache = new Map();

// ---------------------------------------------------------------------------
// L2 durable store for image dims (injected by the production server at boot).
//
// Adapter interface: { get(url), set(url, dims), del(url) }
//   get  → Promise<{width,height}|null|undefined>
//           undefined = not in L2 (cache miss)
//           null      = URL was probed but no parseable dims were found
//           {width,height} = valid dimensions
//   set  → Promise<void>  (dims is {width,height} or null)
//   del  → Promise<void>
// ---------------------------------------------------------------------------
let imageDimsL2 = null;

/**
 * Inject a durable L2 backend for image dimensions (e.g. a PostgreSQL adapter).
 * Must be called once at server startup before any requests are served. The
 * in-process Map remains the L1; the adapter is consulted on an L1 miss and
 * written to whenever a new network fetch produces a result.
 * Pass null to disable L2 (the default; used in dev and tests).
 */
export function initImageDimsDb(adapter) {
  imageDimsL2 = adapter;
}

function _setCachedImageDimsL1(url, value) {
  if (imageDimsCache.size >= IMAGE_DIMS_CACHE_MAX_ENTRIES) {
    const oldest = imageDimsCache.keys().next().value;
    if (oldest !== undefined) imageDimsCache.delete(oldest);
  }
  imageDimsCache.set(url, {
    value,
    expiresAt: Date.now() + IMAGE_DIMS_CACHE_TTL_MS,
  });
}

async function getCachedImageDims(url) {
  const entry = imageDimsCache.get(url);
  if (entry !== undefined) {
    if (entry.expiresAt > Date.now()) {
      // L1 hit — move to tail for LRU behaviour and return.
      imageDimsCache.delete(url);
      imageDimsCache.set(url, entry);
      return entry.value;
    }
    // L1 expired — evict and fall through to L2.
    imageDimsCache.delete(url);
  }
  // L1 miss: consult L2 (if configured).
  if (imageDimsL2) {
    try {
      const l2val = await imageDimsL2.get(url);
      if (l2val !== undefined) {
        // L2 hit — warm L1 and return.
        _setCachedImageDimsL1(url, l2val);
        return l2val;
      }
    } catch {
      // L2 errors are non-fatal; fall through to a fresh network fetch.
    }
  }
  return undefined;
}

function setCachedImageDims(url, value) {
  _setCachedImageDimsL1(url, value);
  // Fire-and-forget L2 write — errors are intentionally swallowed so a DB
  // hiccup never blocks the SEO response.
  if (imageDimsL2) {
    imageDimsL2.set(url, value).catch(() => {});
  }
}

// Evict the L1 image-dims cache entry for a given URL. Called when an entity
// is freshly fetched (entity cache miss) so the image dimensions are
// re-measured on the very next request rather than waiting up to 1 hour for
// the L1 TTL to expire. This handles cases where the CDN serves a new image
// at an unchanged URL (e.g. a product photo update).
//
// NOTE: Only the L1 in-process Map is evicted here. The L2 durable store
// keeps its own TTL (default 24 h) and is intentionally NOT evicted on
// routine entity cache misses — its purpose is to survive server restarts.
// Evicting L2 here would mean that every post-restart entity fetch deletes
// the persisted dims entry before measuring, defeating the whole point of L2.
function evictImageDims(url) {
  if (url && typeof url === "string") {
    imageDimsCache.delete(url);
    // L2 is NOT evicted here — see note above.
  }
}

// Extract all image URLs an entity may carry. Handles both the product shape
// (entity.image.uri / entity.images[].uri) and the simpler brand/category/
// occasion shape (entity.image as a plain string).
function extractEntityImageUrls(entity) {
  if (!entity || typeof entity !== "object") return [];
  const urls = new Set();
  // Product: { image: { uri: "..." }, images: [{ uri: "..." }, ...] }
  if (entity.image && typeof entity.image.uri === "string" && entity.image.uri) {
    urls.add(entity.image.uri);
  }
  if (Array.isArray(entity.images)) {
    for (const img of entity.images) {
      if (img && typeof img.uri === "string" && img.uri) urls.add(img.uri);
    }
  }
  // Brand / category / occasion: { image: "https://..." }
  if (typeof entity.image === "string" && entity.image) {
    urls.add(entity.image);
  }
  return [...urls];
}

function parsePngDims(b) {
  if (b.length < 24) return null;
  const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

function parseJpegDims(b) {
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xFF) break;
    const marker = b[i + 1];
    if (marker === 0xFF) { i++; continue; }
    const segLen = (b[i + 2] << 8) | b[i + 3];
    if (
      (marker >= 0xC0 && marker <= 0xC3) ||
      (marker >= 0xC5 && marker <= 0xC7) ||
      (marker >= 0xC9 && marker <= 0xCB) ||
      (marker >= 0xCD && marker <= 0xCF)
    ) {
      if (i + 8 < b.length) {
        const h = ((b[i + 5] << 8) | b[i + 6]) >>> 0;
        const w = ((b[i + 7] << 8) | b[i + 8]) >>> 0;
        return w > 0 && h > 0 ? { width: w, height: h } : null;
      }
    }
    if (segLen < 2) break;
    i += 2 + segLen;
  }
  return null;
}

function parseWebpDims(b) {
  if (b.length < 16) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X" && b.length >= 30) {
    const w = ((b[24] | (b[25] << 8) | (b[26] << 16)) >>> 0) + 1;
    const h = ((b[27] | (b[28] << 8) | (b[29] << 16)) >>> 0) + 1;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2F) {
    const bits =
      b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const w = (bits & 0x3FFF) + 1;
    const h = ((bits >>> 14) & 0x3FFF) + 1;
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }
  return null;
}

export function parseDimsFromBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 4) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return parsePngDims(b);
  }
  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8) {
    return parseJpegDims(b);
  }
  // WebP (RIFF....WEBP)
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return parseWebpDims(b);
  }
  return null;
}

async function fetchImageDimensions(url) {
  if (!url) return null;
  const cached = await getCachedImageDims(url);
  if (cached !== undefined) return cached;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), IMAGE_DIM_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-4095" },
      signal: ac.signal,
    });
    if (!res.ok && res.status !== 206) {
      setCachedImageDims(url, null);
      return null;
    }
    const buf = await res.arrayBuffer();
    const dims = parseDimsFromBuffer(buf);
    setCachedImageDims(url, dims);
    return dims;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractSlugFor(prefix, rest) {
  if (!rest || !rest.startsWith(prefix)) return null;
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/([^/?#]+)`);
  const m = rest.match(re);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

function extractProductSlug(rest) {
  return extractSlugFor("/product", rest);
}

function extractBrandSlug(rest) {
  return extractSlugFor("/brand", rest);
}

function extractCategorySlugFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  // The live storefront uses `?category=<slug>` (see Shop.tsx and the
  // homepage CategoriesGrid / MainNavbar links). `?n=<slug>` is kept as a
  // backward-compatible alias in case older shared links surface.
  const raw = params.get("category") ?? params.get("n");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function extractBrandsFilterFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  // The Brands page can additionally be filtered (or eventually be filtered)
  // by category or occasion via `?category=<slug>` / `?occasion=<slug>`. We
  // accept the same `?n=<slug>` alias the shop page does for parity.
  const rawCategory = (params.get("category") ?? params.get("n") ?? "").trim();
  if (rawCategory) return { kind: "category", slug: rawCategory };
  const rawOccasion = (params.get("occasion") ?? "").trim();
  if (rawOccasion) return { kind: "occasion", slug: rawOccasion };
  return null;
}

function extractOccasionSlugFromSearch(search) {
  if (!search) return null;
  const s = search.startsWith("?") ? search.slice(1) : search;
  if (!s) return null;
  const params = new URLSearchParams(s);
  const raw = params.get("occasion");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// Matches /favorites/share/<token>
const SHARE_TOKEN_RE = /^\/favorites\/share\/([A-Za-z0-9_-]{8,})(?:\/)?$/;

function extractShareToken(pathname) {
  const m = pathname.match(SHARE_TOKEN_RE);
  return m ? m[1] : null;
}

async function fetchSharedFavoritesForSeo({ token, apiBaseUrl }) {
  if (!token) return null;
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/favorites/share/${encodeURIComponent(token)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true || !Array.isArray(body.favorites)) return null;
    return body.favorites;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildWishlistHead({
  count,
  imageUrl,
  imageWidth,
  imageHeight,
  basePath,
  origin,
  pathname,
  lang,
}) {
  const seo = WISHLIST_SEO[lang ?? "en"] ?? WISHLIST_SEO.en;
  const title =
    count === 1 ? seo.titleOne : format(seo.titleMany, { count });
  const description =
    count === 1
      ? seo.descriptionOne
      : format(seo.descriptionMany, { count });
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl: imageUrl ?? null,
    imageAlt: seo.imageAlt,
    imageWidth,
    imageHeight,
    basePath,
    origin,
    pathname,
    search: "",
    lang: lang ?? "en",
  });
}

/**
 * Fire-and-forget: emit a `seo_entity_fetch_failed` analytics event so ops
 * can query the `analytics_events` table and detect systematic SEO-preview
 * outages (broken API route, upstream down) before social previews silently
 * degrade across all product and brand pages without anyone noticing.
 *
 * `entityKind` is a fixed server-side value (e.g. "product", "brand",
 * "category", "occasion") stored in the `error_code` column for filtering.
 */
function reportSeoFetchFailure(apiBaseUrl, entityKind) {
  if (!apiBaseUrl) return;
  const base = apiBaseUrl.replace(/\/$/, "");
  try {
    void fetch(`${base}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "seo_entity_fetch_failed",
        platform: "web",
        errorCode: String(entityKind).slice(0, 64),
      }),
    }).catch(() => {});
  } catch {
    // Best-effort — never let failure reporting block or throw.
  }
}

// Returns one of:
//   { value, etag, lastModified }  — successful 200 fetch
//   { notModified: true }          — 304 Not Modified (only when conditionalHeaders were sent)
//   null                           — error / entity not found
async function fetchEntityForSeo({
  endpoint,
  responseKey,
  slug,
  lang,
  countryCode,
  cityId,
  apiBaseUrl,
  conditionalHeaders,
}) {
  if (!slug) return null;
  const params = new URLSearchParams({ slug });
  if (lang) params.set("lang", lang);
  if (countryCode) params.set("countryCode", countryCode);
  if (cityId) params.set("cityId", cityId);
  const url = `${apiBaseUrl.replace(/\/$/, "")}${endpoint}?${params.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENTITY_FETCH_TIMEOUT_MS);
  try {
    const reqOptions = { signal: ac.signal };
    if (conditionalHeaders && Object.keys(conditionalHeaders).length > 0) {
      reqOptions.headers = { ...conditionalHeaders };
    }
    const res = await fetch(url, reqOptions);
    // 304: upstream confirms entity is unchanged — no body to parse.
    if (res.status === 304) return { notModified: true };
    if (!res.ok) {
      reportSeoFetchFailure(apiBaseUrl, responseKey);
      return null;
    }
    const body = await res.json();
    if (!body || body.ok !== true) {
      reportSeoFetchFailure(apiBaseUrl, responseKey);
      return null;
    }
    const value = body[responseKey] ?? null;
    if (!value) return null;
    // Capture validation headers so subsequent requests can use them for
    // conditional fetches, avoiding a full round-trip when nothing changed.
    const etag = res.headers?.get?.("etag") ?? null;
    const lastModified = res.headers?.get?.("last-modified") ?? null;
    return { value, etag, lastModified };
  } catch {
    reportSeoFetchFailure(apiBaseUrl, responseKey);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchProductForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/product",
    responseKey: "product",
    ...opts,
  });
}

function fetchBrandForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/brand",
    responseKey: "brand",
    ...opts,
  });
}

function fetchCategoryForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/category",
    responseKey: "category",
    ...opts,
  });
}

function fetchOccasionForSeo(opts) {
  return fetchEntityForSeo({
    endpoint: "/api/woo/occasion",
    responseKey: "occasion",
    ...opts,
  });
}

// Strip basic HTML tags and collapse whitespace. WooCommerce category and
// brand `description` fields commonly contain HTML (paragraphs, links).
// Plain text is what social previews want.
function stripHtml(s) {
  return String(s)
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function clampDescription(s, max = 300) {
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// JSON-LD (Schema.org) helpers
// ---------------------------------------------------------------------------

/**
 * Safely serialise a schema.org object as an inline <script> tag.
 * Escapes </script> sequences in the JSON to prevent XSS.
 */
function jsonLdTag(schema) {
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/<\/script>/gi, "<\\/script>")}</script>`;
}

function buildOrganizationSchema(siteUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Presentail",
    url: siteUrl,
    logo: `${siteUrl}/opengraph.jpg`,
  };
}

/**
 * Build a BreadcrumbList JSON-LD from an ordered array of { name, url? }
 * items. The last item should omit `url` — it is the current page.
 */
function buildBreadcrumbListSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, url }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      ...(url != null ? { item: url } : {}),
    })),
  };
}

/**
 * Extract the locale+city base URL from a pathname like `/en-lb/beirut/...`
 * for use in breadcrumb item URLs.
 */
function localeBaseUrl(pathname, origin, basePath) {
  const cleanBase = basePath.replace(/\/$/, "");
  const parsed = parseLocalePath(pathname);
  if (!parsed.hasLocalePrefix) return `${origin}${cleanBase}`;
  let pfx = `/${parsed.lang}-${parsed.country}`;
  if (parsed.city) pfx += `/${parsed.city}`;
  return `${origin}${cleanBase}${pfx}`;
}

function buildEntityHead({
  ogType,
  title,
  description,
  imageUrl,
  imageAlt,
  imageWidth,
  imageHeight,
  basePath,
  origin,
  pathname,
  search,
  lang,
  extraLines = [],
}) {
  const cleanBase = basePath.replace(/\/$/, "");
  const canonicalHref = origin + cleanBase + pathname + (search || "");
  const lines = [];
  lines.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}" />`);
  lines.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta property="og:type" content="${escapeAttr(ogType)}" />`);
  lines.push(`<meta property="og:site_name" content="Presentail" />`);
  lines.push(
    `<meta property="og:locale" content="${escapeAttr(OG_LOCALE[lang] ?? "en_US")}" />`,
  );
  lines.push(`<meta property="og:url" content="${escapeAttr(canonicalHref)}" />`);
  const effectiveImageUrl = imageUrl || `${origin}${cleanBase}/opengraph.jpg`;
  const effectiveImageAlt = imageAlt || "Presentail — Luxury Flower & Gift Delivery"; // i18n-ignore — brand tagline used as OG image alt fallback
  lines.push(`<meta property="og:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  if (!imageUrl) {
    lines.push(`<meta property="og:image:width" content="1200" />`);
    lines.push(`<meta property="og:image:height" content="630" />`);
  } else if (imageWidth && imageHeight) {
    lines.push(`<meta property="og:image:width" content="${escapeAttr(String(imageWidth))}" />`);
    lines.push(`<meta property="og:image:height" content="${escapeAttr(String(imageHeight))}" />`);
  }
  lines.push(`<meta property="og:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  lines.push(`<meta name="twitter:image" content="${escapeAttr(effectiveImageUrl)}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escapeAttr(effectiveImageAlt)}" />`);
  // Organization JSON-LD on every entity page.
  lines.push(jsonLdTag(buildOrganizationSchema(`${origin}${cleanBase}`)));
  for (const extra of extraLines) lines.push(extra);
  return { title, headSnippet: lines.join("\n    ") };
}

function genericFallbackDescription(lang, key) {
  const tpl = DESCRIPTIONS[lang]?.[key] ?? DESCRIPTIONS.en[key] ?? "";
  return tpl.replace(/\{(?:city|country)\}/g, "").replace(/\s+/g, " ").trim();
}

function buildProductHead({
  product,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
}) {
  const rawName = typeof product.name === "string" ? product.name.trim() : "";
  const title = rawName ? `${rawName} | Presentail` : "Presentail";
  const rawDesc =
    typeof product.description === "string" ? product.description.trim() : "";
  const description =
    clampDescription(rawDesc) || genericFallbackDescription(lang, "product");
  const imageUrl =
    (product.image && typeof product.image.uri === "string" && product.image.uri) ||
    (Array.isArray(product.images) &&
      product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
    null;

  const extraLines = [];
  if (
    typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0
  ) {
    extraLines.push(
      `<meta property="product:price:amount" content="${escapeAttr(product.priceValue.toFixed(2))}" />`,
    );
    extraLines.push(`<meta property="product:price:currency" content="USD" />`);
  }

  // Schema.org Product JSON-LD for Google rich results.
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: rawName || "Presentail",
    ...(rawDesc ? { description: clampDescription(stripHtml(rawDesc), 300) } : {}),
    ...(imageUrl ? { image: imageUrl } : {}),
    brand: { "@type": "Brand", name: "Presentail" },
    ...(typeof product.priceValue === "number" &&
    Number.isFinite(product.priceValue) &&
    product.priceValue > 0
      ? {
          offers: {
            "@type": "Offer",
            price: product.priceValue.toFixed(2),
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
  };
  extraLines.push(jsonLdTag(productSchema));

  // BreadcrumbList JSON-LD — Home > Shop > Product Name.
  const locBase = localeBaseUrl(pathname, origin, basePath);
  extraLines.push(
    jsonLdTag(
      buildBreadcrumbListSchema([
        { name: "Home", url: locBase },
        { name: "Shop", url: `${locBase}/shop` },
        { name: rawName || "Product" },
      ]),
    ),
  );

  return buildEntityHead({
    ogType: "product",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail product", // i18n-ignore — brand+type label used as OG image alt fallback
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    basePath,
    origin,
    pathname,
    search: "",
    lang,
    extraLines,
  });
}

const BRANDS_FILTER_TITLES = {
  en: "{name} Brands in {city} | Presentail",
  ar: "علامات {name} في {city} | Presentail",
  fr: "Marques {name} à {city} | Presentail",
};

const BRANDS_FILTER_DESCRIPTIONS = {
  en: "Discover Presentail's hand-picked partner brands offering {name} for delivery in {city}, {country}.",
  ar: "اكتشف العلامات الشريكة المنتقاة من Presentail والتي تقدّم {name} للتوصيل في {city}، {country}.",
  fr: "Découvrez les marques partenaires sélectionnées par Presentail proposant {name} pour livraison à {city}, {country}.",
};

function buildBrandsFilterHead({
  entity,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
  cityLabel,
  countryLabel,
}) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  const params = {
    name: rawName || "",
    city: cityLabel || "",
    country: countryLabel || "",
  };
  const titleTpl =
    BRANDS_FILTER_TITLES[lang] ?? BRANDS_FILTER_TITLES.en;
  const descTpl =
    BRANDS_FILTER_DESCRIPTIONS[lang] ?? BRANDS_FILTER_DESCRIPTIONS.en;
  const title = rawName
    ? format(titleTpl, params).replace(/\s+/g, " ").trim()
    : format(TITLES[lang]?.brands ?? TITLES.en.brands, params);
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const description =
    clampDescription(rawDesc) ||
    format(descTpl, params).replace(/\s+/g, " ").trim();
  const imageUrl =
    typeof entity.image === "string" && entity.image ? entity.image : null;
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail brands", // i18n-ignore — brand+type label used as OG image alt fallback
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    basePath,
    origin,
    pathname,
    search,
    lang,
  });
}

function buildBrandHead({ brand, imageDimensions, lang, basePath, origin, pathname }) {
  const rawName = typeof brand.name === "string" ? brand.name.trim() : "";
  const title = rawName ? `${rawName} | Presentail` : "Presentail";
  const rawDesc = brand.description ? stripHtml(brand.description) : "";
  const description =
    clampDescription(rawDesc) || genericFallbackDescription(lang, "brand");
  const imageUrl =
    typeof brand.image === "string" && brand.image ? brand.image : null;
  // BreadcrumbList JSON-LD — Home > Brands > Brand Name.
  const locBase = localeBaseUrl(pathname, origin, basePath);
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail brand", // i18n-ignore — brand+type label used as OG image alt fallback
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    basePath,
    origin,
    pathname,
    search: "",
    lang,
    extraLines: [
      jsonLdTag(
        buildBreadcrumbListSchema([
          { name: "Home", url: locBase },
          { name: "Brands", url: `${locBase}/brands` },
          { name: rawName || "Brand" },
        ]),
      ),
    ],
  });
}

function buildCategoryHead({
  category,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
}) {
  return buildShopEntityHead({
    entity: category,
    altText: "Presentail category",
    imageDimensions,
    lang,
    basePath,
    origin,
    pathname,
    search,
  });
}

function buildOccasionHead({
  occasion,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
}) {
  return buildShopEntityHead({
    entity: occasion,
    altText: "Presentail occasion",
    imageDimensions,
    lang,
    basePath,
    origin,
    pathname,
    search,
  });
}

function buildShopEntityHead({
  entity,
  altText,
  imageDimensions,
  lang,
  basePath,
  origin,
  pathname,
  search,
}) {
  const rawName = typeof entity.name === "string" ? entity.name.trim() : "";
  const title = rawName ? `${rawName} | Presentail` : "Presentail";
  const rawDesc = entity.description ? stripHtml(entity.description) : "";
  const description =
    clampDescription(rawDesc) || genericFallbackDescription(lang, "shop");
  const imageUrl =
    typeof entity.image === "string" && entity.image ? entity.image : null;
  // BreadcrumbList JSON-LD — Home > Shop > Category/Occasion Name.
  const locBase = localeBaseUrl(pathname, origin, basePath);
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || altText,
    imageWidth: imageDimensions?.width,
    imageHeight: imageDimensions?.height,
    basePath,
    origin,
    pathname,
    search,
    lang,
    extraLines: [
      jsonLdTag(
        buildBreadcrumbListSchema([
          { name: "Home", url: locBase },
          { name: "Shop", url: `${locBase}/shop` },
          { name: rawName || altText },
        ]),
      ),
    ],
  });
}

/**
 * Async variant of injectSeoTags that, for `/product/<slug>`, `/brand/<slug>`,
 * `/shop?category=<slug>`, and `/shop?occasion=<slug>` routes, fetches the
 * matching record from the API and emits entity-specific OG/Twitter Card
 * meta so shared links show a rich preview. Falls back to the generic
 * locale-aware injector on any failure.
 */
export async function injectSeoTagsAsync(html, pathname, opts = {}) {
  const { apiBaseUrl, search, hintLang, acceptLanguage, ...rest } = opts;
  const generic = buildSeoHead(pathname, rest);
  const parsed = parseLocalePath(pathname);
  if (!apiBaseUrl) {
    return assembleHtml(html, generic);
  }
  if (!parsed.hasLocalePrefix) {
    // Handle shared wishlist links: /favorites/share/:token
    const shareToken = extractShareToken(pathname);
    if (shareToken) {
      // Resolve language for the preview: explicit hint → ?lang= query param →
      // Accept-Language header → English fallback. This ensures Arabic and
      // French visitors see a localised social preview even though the wishlist
      // share path (/favorites/share/:token) carries no locale prefix.
      const langFromQuery = (() => {
        if (!search) return null;
        const s = search.startsWith("?") ? search.slice(1) : search;
        const v = new URLSearchParams(s).get("lang")?.trim().toLowerCase();
        return v && SUPPORTED_LANGS.includes(v) ? v : null;
      })();
      const wishlistLang =
        hintLang ??
        langFromQuery ??
        pickLangFromAcceptLanguage(acceptLanguage) ??
        "en";

      const cacheKey = entityCacheKey({ kind: "wishlist", slug: shareToken, lang: wishlistLang, countryCode: "", cityId: "" });
      let wishlistResult = getCachedEntity(cacheKey);
      if (!wishlistResult) {
        const favorites = await fetchSharedFavoritesForSeo({ token: shareToken, apiBaseUrl });
        if (favorites) {
          const count = favorites.length;
          let imageUrl = null;
          const productOut = {};
          if (count > 0 && favorites[0]?.productSlug) {
            const countryCode = favorites[0].countryCode ?? "LB";
            const product = await fetchEntityForSeoCached(
              "product",
              fetchProductForSeo,
              {
                slug: favorites[0].productSlug,
                lang: wishlistLang,
                countryCode,
                cityId: `${countryCode.toLowerCase()}-beirut`,
                apiBaseUrl,
              },
              productOut,
            );
            if (product) {
              imageUrl =
                (product.image && typeof product.image.uri === "string" && product.image.uri) ||
                (Array.isArray(product.images) &&
                  product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
                null;
            }
          }
          wishlistResult = { count, imageUrl };
          // Evict image-dims only when the hero product was freshly fetched
          // (200 response). When the product came back 304 (unchanged), its
          // image URL has not changed so the cached dimensions remain accurate
          // — no need to waste a CDN Range-request re-measuring them.
          if (productOut.freshlyFetched) evictImageDims(imageUrl);
          setCachedEntity(cacheKey, wishlistResult);
        }
      }
      if (wishlistResult) {
        const wishlistImageDims = await fetchImageDimensions(wishlistResult.imageUrl);
        const result = buildWishlistHead({
          count: wishlistResult.count,
          imageUrl: wishlistResult.imageUrl,
          imageWidth: wishlistImageDims?.width,
          imageHeight: wishlistImageDims?.height,
          basePath: rest.basePath ?? "",
          origin: rest.origin ?? "",
          pathname,
          lang: wishlistLang,
        });
        return assembleHtml(html, {
          lang: wishlistLang,
          dir: wishlistLang === "ar" ? "rtl" : "ltr",
          headSnippet: result.headSnippet,
          titleTag: `<title>${escapeHtml(result.title)}</title>`,
        });
      }
    }

    // Fallback: handle bare /product/<slug> paths (e.g. links shared before
    // the locale-prefix fix, or external integrations, or mobile app shares).
    // Resolve the language from ?lang=, Accept-Language, or hintLang so that
    // Arabic and French social previews work the same as the wishlist path.
    const bareProductSlug = extractProductSlug(pathname);
    if (bareProductSlug) {
      const bareProductLangFromQuery = (() => {
        if (!search) return null;
        const s = search.startsWith("?") ? search.slice(1) : search;
        const v = new URLSearchParams(s).get("lang")?.trim().toLowerCase();
        return v && SUPPORTED_LANGS.includes(v) ? v : null;
      })();
      const bareProductLang =
        hintLang ??
        bareProductLangFromQuery ??
        pickLangFromAcceptLanguage(acceptLanguage) ??
        "en";
      const product = await fetchEntityForSeoCached(
        "product",
        fetchProductForSeo,
        {
          slug: bareProductSlug,
          lang: bareProductLang,
          countryCode: "LB",
          cityId: "lb-beirut",
          apiBaseUrl,
        },
      );
      if (product) {
        const bareImageUrl =
          (product.image && typeof product.image.uri === "string" && product.image.uri) ||
          (Array.isArray(product.images) &&
            product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
          null;
        const bareImageDims = await fetchImageDimensions(bareImageUrl);
        const result = buildProductHead({
          product,
          imageDimensions: bareImageDims,
          lang: bareProductLang,
          basePath: rest.basePath ?? "",
          origin: rest.origin ?? "",
          pathname,
        });
        return assembleHtml(html, {
          lang: bareProductLang,
          dir: bareProductLang === "ar" ? "rtl" : "ltr",
          headSnippet: result.headSnippet,
          titleTag: `<title>${escapeHtml(result.title)}</title>`,
        });
      }
    }
    return assembleHtml(html, generic);
  }

  const productSlug = extractProductSlug(parsed.rest);
  const brandSlug = extractBrandSlug(parsed.rest);
  const categorySlug =
    parsed.rest === "/shop" ? extractCategorySlugFromSearch(search) : null;
  const occasionSlug =
    parsed.rest === "/shop" && !categorySlug
      ? extractOccasionSlugFromSearch(search)
      : null;
  const brandsFilter =
    parsed.rest === "/brands" ? extractBrandsFilterFromSearch(search) : null;

  if (
    !productSlug &&
    !brandSlug &&
    !categorySlug &&
    !occasionSlug &&
    !brandsFilter
  ) {
    return assembleHtml(html, generic);
  }

  const countryCode = parsed.country ? parsed.country.toUpperCase() : undefined;
  const cityId = parsed.city
    ? parsed.city.startsWith(`${parsed.country}-`)
      ? parsed.city
      : `${parsed.country}-${parsed.city}`
    : undefined;
  const fetchOpts = {
    lang: generic.lang,
    countryCode,
    cityId,
    apiBaseUrl,
  };
  const headOpts = {
    lang: generic.lang,
    basePath: rest.basePath ?? "",
    origin: rest.origin ?? "",
    pathname,
  };

  let result = null;
  if (productSlug) {
    const product = await fetchEntityForSeoCached("product", fetchProductForSeo, {
      slug: productSlug,
      ...fetchOpts,
    });
    if (product) {
      const productImageUrl =
        (product.image && typeof product.image.uri === "string" && product.image.uri) ||
        (Array.isArray(product.images) &&
          product.images.find((i) => i && typeof i.uri === "string" && i.uri)?.uri) ||
        null;
      const productImageDims = await fetchImageDimensions(productImageUrl);
      result = buildProductHead({ product, imageDimensions: productImageDims, ...headOpts });
    }
  } else if (brandSlug) {
    const brand = await fetchEntityForSeoCached("brand", fetchBrandForSeo, {
      slug: brandSlug,
      ...fetchOpts,
    });
    if (brand) {
      const brandImageUrl = typeof brand.image === "string" && brand.image ? brand.image : null;
      const brandImageDims = await fetchImageDimensions(brandImageUrl);
      result = buildBrandHead({ brand, imageDimensions: brandImageDims, ...headOpts });
    }
  } else if (categorySlug) {
    const category = await fetchEntityForSeoCached(
      "category",
      fetchCategoryForSeo,
      { slug: categorySlug, ...fetchOpts },
    );
    if (category) {
      const catImageUrl = typeof category.image === "string" && category.image ? category.image : null;
      const catImageDims = await fetchImageDimensions(catImageUrl);
      result = buildCategoryHead({ category, imageDimensions: catImageDims, search, ...headOpts });
    }
  } else if (occasionSlug) {
    const occasion = await fetchEntityForSeoCached("occasion", fetchOccasionForSeo, {
      slug: occasionSlug,
      ...fetchOpts,
    });
    if (occasion) {
      const occImageUrl = typeof occasion.image === "string" && occasion.image ? occasion.image : null;
      const occImageDims = await fetchImageDimensions(occImageUrl);
      result = buildOccasionHead({ occasion, imageDimensions: occImageDims, search, ...headOpts });
    }
  } else if (brandsFilter) {
    const fetcher =
      brandsFilter.kind === "category"
        ? fetchCategoryForSeo
        : fetchOccasionForSeo;
    const entity = await fetchEntityForSeoCached(
      brandsFilter.kind,
      fetcher,
      { slug: brandsFilter.slug, ...fetchOpts },
    );
    if (entity) {
      const bfImageUrl = typeof entity.image === "string" && entity.image ? entity.image : null;
      const bfImageDims = await fetchImageDimensions(bfImageUrl);
      result = buildBrandsFilterHead({
        entity,
        imageDimensions: bfImageDims,
        search,
        cityLabel: generic.cityLabel,
        countryLabel: generic.countryLabel,
        ...headOpts,
      });
    }
  }

  if (!result) {
    return assembleHtml(html, generic);
  }
  return assembleHtml(html, {
    lang: generic.lang,
    dir: generic.dir,
    headSnippet: result.headSnippet,
    titleTag: `<title>${escapeHtml(result.title)}</title>`,
  });
}

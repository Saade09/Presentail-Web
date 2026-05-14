// Server-side SEO HTML injection. Used by the Vite dev plugin and the
// production Node serve script so locale-prefixed URLs return HTML with
// <title>, <meta description>, OG/Twitter tags, canonical and hreflang
// alternates already present in the initial document (no JS required).

const SUPPORTED_LANGS = ["en", "ar", "fr"];
const SUPPORTED_COUNTRY_SLUGS = ["ae", "lb", "cy"];

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
    "ae-al-ain": "Al Ain",
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
    "ae-al-ain": "العين",
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
    "ae-al-ain": "Al-Aïn",
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
    landing: "Presentail | Luxury Flower & Gift Delivery Across the GCC",
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
    about: "About Presentail | Luxury Flowers & Gifts",
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
    landing: "Presentail | توصيل الأزهار والهدايا الفاخرة في الخليج",
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
    landing: "Presentail | Livraison de fleurs et cadeaux de luxe dans le Golfe",
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
      "Presentail delivers signature bouquets, cakes and luxury gifts across Lebanon, the UAE and Cyprus.",
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
      "تقدّم Presentail باقات وكعك وهدايا فاخرة في لبنان والإمارات وقبرص.",
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
      "Presentail livre des bouquets, gâteaux et cadeaux de luxe au Liban, aux Émirats arabes unis et à Chypre.",
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
  { test: (r) => r === "/about", key: "about" },
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
const genericSeoCache = new Map();

function genericSeoCacheKey(pathname, basePath, origin) {
  return `${pathname}\u0000${basePath}\u0000${origin}`;
}

function getCachedGenericSeo(key) {
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

function setCachedGenericSeo(key, value) {
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
  const inLocale = parsed.hasLocalePrefix && parsed.country;
  const lang = parsed.lang ?? "en";
  const dir = lang === "ar" ? "rtl" : "ltr";
  const routeKey = inLocale ? detectRouteKey(parsed.rest) : "landing";

  const cityKey =
    parsed.country && parsed.city ? `${parsed.country}-${parsed.city}` : null;
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

function setCachedEntity(key, value) {
  if (!value) return;
  if (entitySeoCache.size >= ENTITY_CACHE_MAX_ENTRIES) {
    const oldest = entitySeoCache.keys().next().value;
    if (oldest !== undefined) entitySeoCache.delete(oldest);
  }
  entitySeoCache.set(key, {
    value,
    expiresAt: Date.now() + ENTITY_CACHE_TTL_MS,
  });
}

async function fetchEntityForSeoCached(kind, fetcher, opts) {
  const key = entityCacheKey({
    kind,
    slug: opts.slug,
    lang: opts.lang,
    countryCode: opts.countryCode,
    cityId: opts.cityId,
  });
  const hit = getCachedEntity(key);
  if (hit) return hit;
  const value = await fetcher(opts);
  if (value) setCachedEntity(key, value);
  return value;
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

async function fetchEntityForSeo({
  endpoint,
  responseKey,
  slug,
  lang,
  countryCode,
  cityId,
  apiBaseUrl,
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
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body || body.ok !== true) return null;
    return body[responseKey] ?? null;
  } catch {
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

function buildEntityHead({
  ogType,
  title,
  description,
  imageUrl,
  imageAlt,
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
  if (imageUrl) {
    lines.push(`<meta property="og:image" content="${escapeAttr(imageUrl)}" />`);
    lines.push(
      `<meta property="og:image:alt" content="${escapeAttr(imageAlt)}" />`,
    );
    lines.push(`<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`);
  }
  lines.push(
    `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />`,
  );
  lines.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  lines.push(
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
  );
  for (const extra of extraLines) lines.push(extra);
  return { title, headSnippet: lines.join("\n    ") };
}

function genericFallbackDescription(lang, key) {
  const tpl = DESCRIPTIONS[lang]?.[key] ?? DESCRIPTIONS.en[key] ?? "";
  return tpl.replace(/\{(?:city|country)\}/g, "").replace(/\s+/g, " ").trim();
}

function buildProductHead({
  product,
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
  return buildEntityHead({
    ogType: "product",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail product",
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
    imageAlt: rawName || "Presentail brands",
    basePath,
    origin,
    pathname,
    search,
    lang,
  });
}

function buildBrandHead({ brand, lang, basePath, origin, pathname }) {
  const rawName = typeof brand.name === "string" ? brand.name.trim() : "";
  const title = rawName ? `${rawName} | Presentail` : "Presentail";
  const rawDesc = brand.description ? stripHtml(brand.description) : "";
  const description =
    clampDescription(rawDesc) || genericFallbackDescription(lang, "brand");
  const imageUrl =
    typeof brand.image === "string" && brand.image ? brand.image : null;
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || "Presentail brand",
    basePath,
    origin,
    pathname,
    search: "",
    lang,
  });
}

function buildCategoryHead({
  category,
  lang,
  basePath,
  origin,
  pathname,
  search,
}) {
  return buildShopEntityHead({
    entity: category,
    altText: "Presentail category",
    lang,
    basePath,
    origin,
    pathname,
    search,
  });
}

function buildOccasionHead({
  occasion,
  lang,
  basePath,
  origin,
  pathname,
  search,
}) {
  return buildShopEntityHead({
    entity: occasion,
    altText: "Presentail occasion",
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
  return buildEntityHead({
    ogType: "website",
    title,
    description,
    imageUrl,
    imageAlt: rawName || altText,
    basePath,
    origin,
    pathname,
    search,
    lang,
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
  const { apiBaseUrl, search, ...rest } = opts;
  const generic = buildSeoHead(pathname, rest);
  const parsed = parseLocalePath(pathname);
  if (!apiBaseUrl || !parsed.hasLocalePrefix) {
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
    if (product) result = buildProductHead({ product, ...headOpts });
  } else if (brandSlug) {
    const brand = await fetchEntityForSeoCached("brand", fetchBrandForSeo, {
      slug: brandSlug,
      ...fetchOpts,
    });
    if (brand) result = buildBrandHead({ brand, ...headOpts });
  } else if (categorySlug) {
    const category = await fetchEntityForSeoCached(
      "category",
      fetchCategoryForSeo,
      { slug: categorySlug, ...fetchOpts },
    );
    if (category)
      result = buildCategoryHead({ category, search, ...headOpts });
  } else if (occasionSlug) {
    const occasion = await fetchOccasionForSeo({
      slug: occasionSlug,
      ...fetchOpts,
    });
    if (occasion)
      result = buildOccasionHead({ occasion, search, ...headOpts });
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
    if (entity)
      result = buildBrandsFilterHead({
        entity,
        search,
        cityLabel: generic.cityLabel,
        countryLabel: generic.countryLabel,
        ...headOpts,
      });
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

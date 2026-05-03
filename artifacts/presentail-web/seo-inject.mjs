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

/**
 * Build the SEO `<head>` snippet for the given pathname. `basePath` is the
 * artifact base prefix (e.g. "" or "/app"). `origin` is the site origin used
 * for absolute canonical / hreflang URLs.
 */
export function buildSeoHead(pathname, { origin = "", basePath = "" } = {}) {
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

  return { lang, dir, title, headSnippet: lines.join("\n    "), titleTag: `<title>${escapeHtml(title)}</title>` };
}

/**
 * Inject locale-aware tags into a raw index.html string. Replaces the existing
 * <title> and <html lang="..."> attributes, and inserts the head snippet
 * immediately before </head>.
 */
export function injectSeoTags(html, pathname, opts = {}) {
  const { lang, dir, headSnippet, titleTag } = buildSeoHead(pathname, opts);
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

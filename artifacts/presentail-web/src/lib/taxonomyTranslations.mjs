/**
 * Translated labels for category and occasion taxonomy slugs.
 * Used by seo-inject.mjs to replace the English OS entity name with the
 * locale-specific label when rendering ar/fr pages, so that {name} template
 * interpolation in headings, FAQs, and intro paragraphs is fully translated.
 *
 * Must stay in sync with the locale keys in src/locales/shop.ts.
 * EN values are provided for reference only — seo-inject.mjs uses rawName
 * (from the OS API) for the en locale and only looks up ar/fr here.
 *
 * @typedef {{ en: string; ar: string; fr: string; el?: string }} TaxLabel
 */

/** @type {Record<string, TaxLabel>} */
export const CATEGORY_TRANSLATIONS = {
  "flowers":              { en: "Flowers",              ar: "ورد",                    fr: "Fleurs" },
  "roses":                { en: "Roses",                ar: "ورد جوري",               fr: "Roses" },
  "hand-bouquets":        { en: "Hand Bouquets",        ar: "بوكيه ورد",              fr: "Bouquets de fleurs", el: "Χειροποίητα μπουκέτα" },
  "flower-boxes":         { en: "Flower Boxes",         ar: "بوكس ورد",               fr: "Boîtes de fleurs", el: "Κουτιά με λουλούδια" },
  "cakes":                { en: "Cakes",                ar: "كاتو",                   fr: "Gâteaux", el: "Τούρτες" },
  "chocolate":            { en: "Chocolate",            ar: "شوكولا",                 fr: "Chocolats", el: "Σοκολάτα" },
  "gift-baskets":         { en: "Gift Baskets",         ar: "سلال هدايا",             fr: "Paniers cadeaux" },
  "plants":               { en: "Plants",               ar: "نباتات",                 fr: "Plantes", el: "Φυτά" },
  "balloons":             { en: "Balloons",             ar: "بالونات",                fr: "Ballons", el: "Μπαλόνια" },
  "preserved-flowers":    { en: "Preserved Flowers",    ar: "ورد محفوظ",              fr: "Fleurs éternelles" },
  "flower-baskets":       { en: "Flower Baskets",       ar: "سلال ورد",               fr: "Paniers de fleurs" },
  "flower-vases":         { en: "Flower Vases",         ar: "ورد بفازة",              fr: "Vases de fleurs" },
  "dried-flowers":        { en: "Dried Flowers",        ar: "ورد مجفف",               fr: "Fleurs séchées" },
  "table-arrangements":   { en: "Table Arrangements",   ar: "تنسيقات طاولة",          fr: "Compositions de table" },
  "lux-arrangements":     { en: "Lux Arrangements",     ar: "تنسيقات ورد فخمة",       fr: "Compositions de luxe" },
  "luxury":               { en: "Luxury",               ar: "هدايا فخمة",             fr: "Cadeaux de luxe" },
  "candles":              { en: "Candles",              ar: "شموع",                   fr: "Bougies" },
  "stuffed-animals":      { en: "Stuffed Animals",      ar: "دباديب",                 fr: "Peluches" },
  "balloon-arrangements": { en: "Balloon Arrangements", ar: "تنسيقات بالونات",        fr: "Compositions de ballons" },
  "birthday-bundles":     { en: "Birthday Bundles",     ar: "عروض عيد ميلاد",         fr: "Coffrets anniversaire" },
  "bundles":              { en: "Bundles",              ar: "عروض الهدايا",           fr: "Coffrets cadeaux" },
  "religious-gifts":      { en: "Religious Gifts",      ar: "هدايا دينية",            fr: "Cadeaux religieux" },
  "electronics":          { en: "Electronics",          ar: "إلكترونيات",             fr: "Électronique" },
  "red":                  { en: "Red Flowers",          ar: "ورد أحمر",               fr: "Fleurs rouges" },
  "pink":                 { en: "Pink Flowers",         ar: "ورد زهري",               fr: "Fleurs roses" },
  "yellow":               { en: "Yellow Flowers",       ar: "ورد أصفر",               fr: "Fleurs jaunes" },
  "friend":               { en: "Gifts for Friends",    ar: "هدايا للصديق",           fr: "Cadeaux pour ami" },
  "colleague":            { en: "Gifts for Colleagues", ar: "هدايا للزميل",           fr: "Cadeaux pour collègue" },
  // fathers-day and im-sorry each appear as both a category and an occasion
  // with different label text — do not merge these entries.
  "fathers-day":          { en: "Father's Day Gifts",   ar: "هدايا عيد الأب",         fr: "Cadeaux fête des pères" },
  "im-sorry":             { en: "I'm Sorry Gifts",      ar: "هدايا اعتذار",           fr: "Cadeaux d'excuses" },
};

/** @type {Record<string, TaxLabel>} */
export const OCCASION_TRANSLATIONS = {
  "birthday":        { en: "Birthday",        ar: "عيد ميلاد",    fr: "Anniversaire", el: "Γενέθλια" },
  "wedding":         { en: "Wedding",         ar: "عرس",           fr: "Mariage" },
  "valentines-day":  { en: "Valentine's Day", ar: "عيد الحب",      fr: "Saint-Valentin" },
  "mothers-day":     { en: "Mother's Day",    ar: "عيد الأم",      fr: "Fête des mères" },
  "funeral":         { en: "Condolences",     ar: "عزاء",          fr: "Condoléances" },
  "anniversary":     { en: "Anniversary",     ar: "ذكرى الزواج",   fr: "Anniversaire de mariage", el: "Επέτειος" },
  "new-born":        { en: "New Born",        ar: "مولود جديد",    fr: "Nouveau-né" },
  "graduation":      { en: "Graduation",      ar: "تخرج",          fr: "Remise de diplôme" },
  "christmas":       { en: "Christmas",       ar: "الكريسماس",    fr: "Noël" },
  "eid":             { en: "Eid Mubarak",     ar: "العيد",         fr: "Aïd" },
  "ramadan":         { en: "Ramadan",         ar: "رمضان",         fr: "Ramadan" },
  "congratulations": { en: "Congratulations", ar: "مبروك",         fr: "Félicitations", el: "Συγχαρητήρια" },
  "get-well-soon":   { en: "Get Well Soon",   ar: "سلامتك",        fr: "Prompt rétablissement" },
  "thank-you":       { en: "Thank You",       ar: "شكراً",         fr: "Merci", el: "Ευχαριστώ" },
  "love-romance":    { en: "Love & Romance",  ar: "حب ورومانسية",  fr: "Amour & Romance", el: "Αγάπη & Ρομαντισμός" },
  "housewarming":    { en: "Housewarming",    ar: "بيت جديد",      fr: "Pendaison de crémaillère" },
  "katb-kitab":      { en: "Katb Kitab",      ar: "كتب كتاب",      fr: "Katb el-Kitab" },
  // fathers-day exists as both a category and an occasion with different labels.
  "fathers-day":     { en: "Father's Day",    ar: "عيد الأب",      fr: "Fête des pères" },
  "womens-day":      { en: "Women's Day",     ar: "عيد المرأة",    fr: "Journée de la femme" },
  "new-job":         { en: "New Job",         ar: "وظيفة جديدة",   fr: "Nouvel emploi" },
  "promotion":       { en: "Job Promotion",   ar: "ترقية",         fr: "Promotion" },
  "siblings":        { en: "Siblings",        ar: "هدايا للإخوة",  fr: "Frères et sœurs" },
  "summer":          { en: "Summer",          ar: "الصيف",         fr: "Été" },
  "thinking-of-you": { en: "Thinking of You", ar: "بفكر فيك",      fr: "Je pense à toi" },
  // im-sorry exists as both a category and an occasion with different labels.
  "im-sorry":        { en: "I'm Sorry",       ar: "اعتذار",        fr: "Excuses" },
};

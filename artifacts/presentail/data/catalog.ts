export type Product = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: any;
  tag?: string;
  category: string;
  description?: string;
};

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  count: string;
  image: any;
  category?: string;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  image: any;
};

export type Occasion = {
  id: string;
  name: string;
  icon: string;
  image: any;
  category: string;
};

const img = {
  sweetScarlet: require("@/assets/products/sweet-scarlet-affair.avif"),
  roseWhisper: require("@/assets/products/rose-whisper.avif"),
  redRosesBox: require("@/assets/products/red-roses-box.webp"),
  chocoRocher: require("@/assets/products/chocolate-rocher-cake.avif"),
  superYou: require("@/assets/products/super-you.webp"),
  birthdayBear: require("@/assets/products/birthday-bear.avif"),
  whiteRoses25: require("@/assets/products/25-white-roses-arrangement.webp"),
  purpleRoses50: require("@/assets/products/50-purple-roses-arrangement.webp"),
  pastelBliss: require("@/assets/products/pastel-bliss-bouquet.avif"),
  redRoses50: require("@/assets/products/50-red-roses-arrangement.webp"),
  glowingHue: require("@/assets/products/glowing-hue.webp"),
  largeYellowHeart: require("@/assets/products/large-yellow-heart-box.webp"),
  cheryBreeze: require("@/assets/products/chery-breeze.webp"),
  fierceLove: require("@/assets/products/fierce-love.webp"),
  ruralLove: require("@/assets/products/rural-love.avif"),
  flowerBreeze: require("@/assets/products/flower-breeze.webp"),
  largeRedHeart: require("@/assets/products/large-red-heart-box.webp"),
  blackEternalRose: require("@/assets/products/black-eternal-rose.webp"),
  redRoses25: require("@/assets/products/25-red-roses-arrangement.webp"),
  hallabMaamoul: require("@/assets/products/hallab-maamoul-mini-mixed.avif"),
  littleTenderness: require("@/assets/products/a-little-tenderness.webp"),
  yellowRosesBox: require("@/assets/products/yellow-roses-box.webp"),
  thrivingHeart: require("@/assets/products/the-thriving-heart-bundle.avif"),
  tributeToHer: require("@/assets/products/a-tribute-to-her.avif"),
  s26Ultra: require("@/assets/products/samsung-galaxy-s26-ultra.avif"),
  zFold: require("@/assets/products/samsung-galaxy-z-fold-blue.avif"),
  galaxyWatch8: require("@/assets/products/samsung-galaxy-watch-8.avif"),
  galaxyRing: require("@/assets/products/samsung-galaxy-ring-in-gold.avif"),
  appleWatch11: require("@/assets/products/apple-watch-series-11-rose-gold.avif"),
  mixedTulipVase: require("@/assets/products/mixed-tulip-vase-arrangement.avif"),
  timelessTulip: require("@/assets/products/timeless-tulip-charm.avif"),
  snowfallTulip: require("@/assets/products/snowfall-tulip-bouquet.avif"),
  sunsetTulip: require("@/assets/products/sunset-tulip-embrace.avif"),
  tulipFerreroBundle: require("@/assets/products/mixed-tulip-vase-ferrero-rocher-chocolate-bundle.avif"),
  pinkIndulgence: require("@/assets/products/pink-indulgence-bundle.avif"),
};

export const products: Product[] = [
  { id: "sweet-scarlet-affair", name: "Sweet Scarlet Affair", price: "$160", priceValue: 160, image: img.sweetScarlet, tag: "Bestseller", category: "lux-arrangements", description: "An opulent tribute of velvety scarlet roses, hand-tied with seasonal foliage." },
  { id: "rose-whisper", name: "Rosé Whisper", price: "$70", priceValue: 70, image: img.roseWhisper, tag: "Signature", category: "hand-bouquets", description: "Soft pink roses arranged with airy greens — a quiet love note." },
  { id: "red-roses-box", name: "Red Roses Box", price: "$85", priceValue: 85, image: img.redRosesBox, tag: "New", category: "flower-boxes", description: "Classic red roses presented in our signature black box." },
  { id: "chocolate-rocher-cake", name: "Chocolate Rocher Cake", price: "$48", priceValue: 48, image: img.chocoRocher, category: "cakes", description: "Decadent chocolate cake topped with Ferrero Rocher." },
  { id: "super-you", name: "Super You", price: "$85", priceValue: 85, image: img.superYou, tag: "Loved", category: "flower-boxes", description: "A cheerful pop of mixed blooms in our boutique box." },
  { id: "birthday-bear", name: "Birthday Bear", price: "$27", priceValue: 27, image: img.birthdayBear, category: "stuffed-animals", description: "Plush birthday bear — the sweetest hello." },
  { id: "25-white-roses-arrangement", name: "25 White Roses Arrangement", price: "$90", priceValue: 90, image: img.whiteRoses25, category: "lux-arrangements" },
  { id: "50-purple-roses-arrangement", name: "50 Purple Roses Arrangement", price: "$175", priceValue: 175, image: img.purpleRoses50, category: "lux-arrangements" },
  { id: "pastel-bliss-bouquet", name: "Pastel Bliss Bouquet", price: "$164", priceValue: 164, image: img.pastelBliss, category: "hand-bouquets" },
  { id: "50-red-roses-arrangement", name: "50 Red Roses Arrangement", price: "$175", priceValue: 175, image: img.redRoses50, category: "lux-arrangements" },
  { id: "glowing-hue", name: "Glowing Hue", price: "$95", priceValue: 95, image: img.glowingHue, category: "flower-boxes" },
  { id: "large-yellow-heart-box", name: "Large Yellow Heart Box", price: "$320", priceValue: 320, image: img.largeYellowHeart, category: "flower-boxes", tag: "Lux" },
  { id: "chery-breeze", name: "Chery Breeze", price: "$74", priceValue: 74, image: img.cheryBreeze, category: "flower-boxes" },
  { id: "fierce-love", name: "Fierce Love", price: "$80", priceValue: 80, image: img.fierceLove, category: "hand-bouquets" },
  { id: "rural-love", name: "Rural Love", price: "$42", priceValue: 42, image: img.ruralLove, category: "hand-bouquets" },
  { id: "flower-breeze", name: "Flower Breeze", price: "$95", priceValue: 95, image: img.flowerBreeze, category: "flower-boxes" },
  { id: "large-red-heart-box", name: "Large Red Heart Box", price: "$320", priceValue: 320, image: img.largeRedHeart, category: "flower-boxes", tag: "Lux" },
  { id: "black-eternal-rose", name: "Black Eternal Rose", price: "$51", priceValue: 51, image: img.blackEternalRose, category: "preserved-flowers" },
  { id: "25-red-roses-arrangement", name: "25 Red Roses Arrangement", price: "$90", priceValue: 90, image: img.redRoses25, category: "lux-arrangements" },
  { id: "hallab-maamoul-mini-mixed", name: "Hallab Maamoul Mini Mixed", price: "$95", priceValue: 95, image: img.hallabMaamoul, category: "arabic-sweets" },
  { id: "a-little-tenderness", name: "A Little Tenderness", price: "$95", priceValue: 95, image: img.littleTenderness, category: "hand-bouquets" },
  { id: "yellow-roses-box", name: "Yellow Roses Box", price: "$85", priceValue: 85, image: img.yellowRosesBox, category: "flower-boxes" },
  { id: "the-thriving-heart-bundle", name: "The Thriving Heart Bundle", price: "$106", priceValue: 106, image: img.thrivingHeart, category: "bundles" },
  { id: "a-tribute-to-her", name: "A Tribute to Her", price: "$130", priceValue: 130, image: img.tributeToHer, category: "flower-vases" },
  { id: "samsung-galaxy-s26-ultra", name: "Samsung Galaxy S26 Ultra", price: "$1,750", priceValue: 1750, image: img.s26Ultra, category: "electronics" },
  { id: "samsung-galaxy-z-fold-blue", name: "Samsung Galaxy Z Fold Blue", price: "$1,800", priceValue: 1800, image: img.zFold, category: "electronics" },
  { id: "samsung-galaxy-watch-8", name: "Samsung Galaxy Watch 8", price: "$350", priceValue: 350, image: img.galaxyWatch8, category: "electronics" },
  { id: "samsung-galaxy-ring-in-gold", name: "Samsung Galaxy Ring in Gold", price: "$570", priceValue: 570, image: img.galaxyRing, category: "electronics" },
  { id: "apple-watch-series-11-rose-gold", name: "Apple Watch Series 11 Rose Gold 42mm", price: "$584", priceValue: 584, image: img.appleWatch11, category: "electronics" },
  { id: "mixed-tulip-vase-arrangement", name: "Mixed Tulip Vase Arrangement", price: "$117", priceValue: 117, image: img.mixedTulipVase, category: "flower-vases", tag: "Tulips" },
  { id: "timeless-tulip-charm", name: "Timeless Tulip Charm", price: "$117", priceValue: 117, image: img.timelessTulip, category: "flower-vases" },
  { id: "snowfall-tulip-bouquet", name: "Snowfall Tulip Bouquet", price: "$117", priceValue: 117, image: img.snowfallTulip, category: "hand-bouquets" },
  { id: "sunset-tulip-embrace", name: "Sunset Tulip Embrace", price: "$117", priceValue: 117, image: img.sunsetTulip, category: "hand-bouquets" },
  { id: "mixed-tulip-vase-ferrero-rocher-chocolate-bundle", name: "Tulip & Ferrero Bundle", price: "$150", priceValue: 150, image: img.tulipFerreroBundle, category: "bundles" },
  { id: "pink-indulgence-bundle", name: "Pink Indulgence Bundle", price: "$160", priceValue: 160, image: img.pinkIndulgence, category: "bundles" },
];

export const bestSellerIds = [
  "sweet-scarlet-affair",
  "rose-whisper",
  "red-roses-box",
  "chocolate-rocher-cake",
  "super-you",
  "birthday-bear",
];
export const bestSellers: Product[] = bestSellerIds
  .map((id) => products.find((p) => p.id === id)!)
  .filter(Boolean);

export const categories: Category[] = [
  { id: "lux-arrangements", name: "Lux Arrangements", icon: "flower-tulip", image: img.sweetScarlet },
  { id: "hand-bouquets", name: "Flower Bouquets", icon: "flower", image: img.pastelBliss },
  { id: "flower-boxes", name: "Flower Boxes", icon: "package-variant", image: img.redRosesBox },
  { id: "flower-vases", name: "Flower Vases", icon: "vase", image: img.mixedTulipVase },
  { id: "preserved-flowers", name: "Preserved Flowers", icon: "flower-poppy", image: img.blackEternalRose },
  { id: "stuffed-animals", name: "Bears", icon: "teddy-bear", image: img.birthdayBear },
  { id: "cakes", name: "Cakes", icon: "cake-variant", image: img.chocoRocher },
  { id: "arabic-sweets", name: "Arabic Sweets", icon: "candy", image: img.hallabMaamoul },
  { id: "bundles", name: "Bundles", icon: "gift", image: img.thrivingHeart },
  { id: "electronics", name: "Electronics", icon: "cellphone", image: img.s26Ultra },
];

export const collections: Collection[] = [
  {
    id: "lux-arrangements",
    title: "Lux Arrangements",
    subtitle: "Sculptural roses for the most important moments",
    count: `${products.filter((p) => p.category === "lux-arrangements").length} pieces`,
    image: img.sweetScarlet,
    category: "lux-arrangements",
  },
  {
    id: "bundles",
    title: "Curated Bundles",
    subtitle: "Flowers paired with chocolate, cakes & boutique gifts",
    count: `${products.filter((p) => p.category === "bundles").length} pieces`,
    image: img.thrivingHeart,
    category: "bundles",
  },
  {
    id: "tulip-season",
    title: "Tulip Season",
    subtitle: "A limited spring edition direct from Holland",
    count: "4 pieces",
    image: img.snowfallTulip,
    category: "flower-vases",
  },
];

export const occasions: Occasion[] = [
  { id: "love", name: "Love & Romance", icon: "heart", image: img.sweetScarlet, category: "love-romance" },
  { id: "birthday", name: "Birthday", icon: "cake", image: img.birthdayBear, category: "birthday-gifts" },
  { id: "housewarming", name: "Housewarming", icon: "home", image: img.glowingHue, category: "housewarming" },
  { id: "new-job", name: "New Job", icon: "briefcase", image: img.flowerBreeze, category: "new-job" },
  { id: "thank-you", name: "Thank You", icon: "hand-heart", image: img.pastelBliss, category: "thank-you" },
  { id: "promotion", name: "Promotion", icon: "trophy", image: img.purpleRoses50, category: "promotion" },
  { id: "farewell", name: "Farewell", icon: "airplane", image: img.ruralLove, category: "farewell" },
  { id: "condolences", name: "Condolences", icon: "flower", image: img.whiteRoses25, category: "condolences" },
];

export const brands = [
  "Sablé Gourmet",
  "Halab 1881",
  "Samsung",
  "Apple",
  "Patchi",
  "Godiva",
  "Ferrero",
];

export const reviews = [
  { id: "1", name: "Sarah K.", text: "A truly wonderful experience — the bouquet arrived exactly as pictured.", rating: 5 },
  { id: "2", name: "Zahra A.", text: "Even in times of war, they proved their excellence and reliability.", rating: 5 },
  { id: "3", name: "Roula R.", text: "Thank you for great service and hospitality. Truly above and beyond.", rating: 5 },
  { id: "4", name: "Sami A.", text: "Awesome service. The recipient was delighted from the first glance.", rating: 5 },
];

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getProductsByCategory(catId: string): Product[] {
  return products.filter((p) => p.category === catId);
}

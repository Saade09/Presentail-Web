export type Product = {
  id: string;
  name: string;
  price: string;
  priceValue: number;
  image: any;
  tag?: string;
  category: string;
  occasions?: string[];
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
  description?: string;
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

const cat = {
  "lux-arrangements": require("@/assets/categories/lux-arrangements.avif"),
  "hand-bouquets": require("@/assets/categories/hand-bouquets.webp"),
  "flower-boxes": require("@/assets/categories/flower-boxes.avif"),
  "flower-vases": require("@/assets/categories/flower-vases.avif"),
  "preserved-flowers": require("@/assets/categories/preserved-flowers.avif"),
  "stuffed-animals": require("@/assets/categories/stuffed-animals.webp"),
  "balloons": require("@/assets/categories/balloons.webp"),
  "cakes": require("@/assets/categories/cakes.webp"),
  "chocolate": require("@/assets/categories/chocolate.webp"),
  "arabic-sweets": require("@/assets/categories/arabic-sweets.webp"),
  "coffee": require("@/assets/categories/coffee.webp"),
  "plants": require("@/assets/categories/plants.webp"),
  "bundles": require("@/assets/categories/bundles.webp"),
  "gift-cards": require("@/assets/categories/gift-cards.webp"),
  "electronics": require("@/assets/categories/electronics.webp"),
  "board-games": require("@/assets/categories/board-games.webp"),
};

const occ = {
  "love-romance": require("@/assets/occasions/love-romance.webp"),
  "birthday": require("@/assets/occasions/birthday.webp"),
  "housewarming": require("@/assets/occasions/housewarming.avif"),
  "new-job": require("@/assets/occasions/new-job.avif"),
  "promotion": require("@/assets/occasions/promotion.avif"),
  "thank-you": require("@/assets/occasions/thank-you.webp"),
  "farewell": require("@/assets/occasions/farewell.avif"),
  "condolences": require("@/assets/occasions/condolences.webp"),
};

export const products: Product[] = [
  { id: "sweet-scarlet-affair", name: "Sweet Scarlet Affair", price: "$160", priceValue: 160, image: img.sweetScarlet, tag: "Bestseller", category: "lux-arrangements", occasions: ["love-romance", "birthday"], description: "An opulent tribute of velvety scarlet roses, hand-tied with seasonal foliage." },
  { id: "rose-whisper", name: "Rosé Whisper", price: "$70", priceValue: 70, image: img.roseWhisper, tag: "Signature", category: "hand-bouquets", occasions: ["love-romance", "thank-you"], description: "Soft pink roses arranged with airy greens — a quiet love note." },
  { id: "red-roses-box", name: "Red Roses Box", price: "$85", priceValue: 85, image: img.redRosesBox, tag: "New", category: "flower-boxes", occasions: ["love-romance", "birthday"], description: "Classic red roses presented in our signature black box." },
  { id: "chocolate-rocher-cake", name: "Chocolate Rocher Cake", price: "$48", priceValue: 48, image: img.chocoRocher, category: "cakes", occasions: ["birthday", "thank-you"], description: "Decadent chocolate cake topped with Ferrero Rocher." },
  { id: "super-you", name: "Super You", price: "$85", priceValue: 85, image: img.superYou, tag: "Loved", category: "flower-boxes", occasions: ["thank-you", "promotion", "new-job"], description: "A cheerful pop of mixed blooms in our boutique box." },
  { id: "birthday-bear", name: "Birthday Bear", price: "$27", priceValue: 27, image: img.birthdayBear, category: "stuffed-animals", occasions: ["birthday"], description: "Plush birthday bear — the sweetest hello." },
  { id: "25-white-roses-arrangement", name: "25 White Roses Arrangement", price: "$90", priceValue: 90, image: img.whiteRoses25, category: "lux-arrangements", occasions: ["condolences", "thank-you"] },
  { id: "50-purple-roses-arrangement", name: "50 Purple Roses Arrangement", price: "$175", priceValue: 175, image: img.purpleRoses50, category: "lux-arrangements", occasions: ["promotion", "birthday"] },
  { id: "pastel-bliss-bouquet", name: "Pastel Bliss Bouquet", price: "$164", priceValue: 164, image: img.pastelBliss, category: "hand-bouquets", occasions: ["thank-you", "birthday"] },
  { id: "50-red-roses-arrangement", name: "50 Red Roses Arrangement", price: "$175", priceValue: 175, image: img.redRoses50, category: "lux-arrangements", occasions: ["love-romance"] },
  { id: "glowing-hue", name: "Glowing Hue", price: "$95", priceValue: 95, image: img.glowingHue, category: "flower-boxes", occasions: ["housewarming", "thank-you"] },
  { id: "large-yellow-heart-box", name: "Large Yellow Heart Box", price: "$320", priceValue: 320, image: img.largeYellowHeart, category: "flower-boxes", tag: "Lux", occasions: ["love-romance"] },
  { id: "chery-breeze", name: "Chery Breeze", price: "$74", priceValue: 74, image: img.cheryBreeze, category: "flower-boxes", occasions: ["birthday"] },
  { id: "fierce-love", name: "Fierce Love", price: "$80", priceValue: 80, image: img.fierceLove, category: "hand-bouquets", occasions: ["love-romance", "farewell"] },
  { id: "rural-love", name: "Rural Love", price: "$42", priceValue: 42, image: img.ruralLove, category: "hand-bouquets", occasions: ["farewell", "thank-you"] },
  { id: "flower-breeze", name: "Flower Breeze", price: "$95", priceValue: 95, image: img.flowerBreeze, category: "flower-boxes", occasions: ["new-job", "promotion"] },
  { id: "large-red-heart-box", name: "Large Red Heart Box", price: "$320", priceValue: 320, image: img.largeRedHeart, category: "flower-boxes", tag: "Lux", occasions: ["love-romance"] },
  { id: "black-eternal-rose", name: "Black Eternal Rose", price: "$51", priceValue: 51, image: img.blackEternalRose, category: "preserved-flowers", occasions: ["love-romance"] },
  { id: "25-red-roses-arrangement", name: "25 Red Roses Arrangement", price: "$90", priceValue: 90, image: img.redRoses25, category: "lux-arrangements", occasions: ["love-romance", "birthday"] },
  { id: "hallab-maamoul-mini-mixed", name: "Hallab Maamoul Mini Mixed", price: "$95", priceValue: 95, image: img.hallabMaamoul, category: "arabic-sweets", occasions: ["thank-you", "housewarming"] },
  { id: "a-little-tenderness", name: "A Little Tenderness", price: "$95", priceValue: 95, image: img.littleTenderness, category: "hand-bouquets", occasions: ["condolences", "thank-you"] },
  { id: "yellow-roses-box", name: "Yellow Roses Box", price: "$85", priceValue: 85, image: img.yellowRosesBox, category: "flower-boxes", occasions: ["new-job", "thank-you"] },
  { id: "the-thriving-heart-bundle", name: "The Thriving Heart Bundle", price: "$106", priceValue: 106, image: img.thrivingHeart, category: "bundles", occasions: ["love-romance", "birthday"] },
  { id: "a-tribute-to-her", name: "A Tribute to Her", price: "$130", priceValue: 130, image: img.tributeToHer, category: "flower-vases", occasions: ["thank-you", "love-romance"] },
  { id: "samsung-galaxy-s26-ultra", name: "Samsung Galaxy S26 Ultra", price: "$1,750", priceValue: 1750, image: img.s26Ultra, category: "electronics", occasions: ["birthday", "promotion"] },
  { id: "samsung-galaxy-z-fold-blue", name: "Samsung Galaxy Z Fold Blue", price: "$1,800", priceValue: 1800, image: img.zFold, category: "electronics", occasions: ["promotion"] },
  { id: "samsung-galaxy-watch-8", name: "Samsung Galaxy Watch 8", price: "$350", priceValue: 350, image: img.galaxyWatch8, category: "electronics", occasions: ["birthday", "new-job"] },
  { id: "samsung-galaxy-ring-in-gold", name: "Samsung Galaxy Ring in Gold", price: "$570", priceValue: 570, image: img.galaxyRing, category: "electronics", occasions: ["promotion"] },
  { id: "apple-watch-series-11-rose-gold", name: "Apple Watch Series 11 Rose Gold 42mm", price: "$584", priceValue: 584, image: img.appleWatch11, category: "electronics", occasions: ["birthday", "love-romance"] },
  { id: "mixed-tulip-vase-arrangement", name: "Mixed Tulip Vase Arrangement", price: "$117", priceValue: 117, image: img.mixedTulipVase, category: "flower-vases", tag: "Tulips", occasions: ["housewarming", "thank-you"] },
  { id: "timeless-tulip-charm", name: "Timeless Tulip Charm", price: "$117", priceValue: 117, image: img.timelessTulip, category: "flower-vases", occasions: ["housewarming"] },
  { id: "snowfall-tulip-bouquet", name: "Snowfall Tulip Bouquet", price: "$117", priceValue: 117, image: img.snowfallTulip, category: "hand-bouquets", occasions: ["condolences", "thank-you"] },
  { id: "sunset-tulip-embrace", name: "Sunset Tulip Embrace", price: "$117", priceValue: 117, image: img.sunsetTulip, category: "hand-bouquets", occasions: ["farewell"] },
  { id: "mixed-tulip-vase-ferrero-rocher-chocolate-bundle", name: "Tulip & Ferrero Bundle", price: "$150", priceValue: 150, image: img.tulipFerreroBundle, category: "bundles", occasions: ["birthday", "thank-you"] },
  { id: "pink-indulgence-bundle", name: "Pink Indulgence Bundle", price: "$160", priceValue: 160, image: img.pinkIndulgence, category: "bundles", occasions: ["love-romance", "birthday"] },
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
  { id: "lux-arrangements", name: "Lux Arrangements", icon: "flower-tulip", image: cat["lux-arrangements"] },
  { id: "hand-bouquets", name: "Flower Bouquets", icon: "flower", image: cat["hand-bouquets"] },
  { id: "flower-boxes", name: "Flower Boxes", icon: "package-variant", image: cat["flower-boxes"] },
  { id: "flower-vases", name: "Flower Vases", icon: "vase", image: cat["flower-vases"] },
  { id: "preserved-flowers", name: "Preserved Flowers", icon: "flower-poppy", image: cat["preserved-flowers"] },
  { id: "stuffed-animals", name: "Bears", icon: "teddy-bear", image: cat["stuffed-animals"] },
  { id: "balloons", name: "Balloons", icon: "balloon", image: cat["balloons"] },
  { id: "cakes", name: "Cakes", icon: "cake-variant", image: cat["cakes"] },
  { id: "chocolate", name: "Chocolate", icon: "candy", image: cat["chocolate"] },
  { id: "arabic-sweets", name: "Arabic Sweets", icon: "candy-outline", image: cat["arabic-sweets"] },
  { id: "coffee", name: "Coffee", icon: "coffee", image: cat["coffee"] },
  { id: "plants", name: "Plants", icon: "leaf", image: cat["plants"] },
  { id: "bundles", name: "Bundles", icon: "gift", image: cat["bundles"] },
  { id: "gift-cards", name: "Gift Cards", icon: "card-giftcard", image: cat["gift-cards"] },
  { id: "electronics", name: "Electronics", icon: "cellphone", image: cat["electronics"] },
  { id: "board-games", name: "Board Games", icon: "chess-knight", image: cat["board-games"] },
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
  { id: "housewarming", name: "Housewarming", icon: "home", image: occ["housewarming"], description: "Welcome them to a new chapter with blooms and home pieces." },
  { id: "birthday", name: "Birthday", icon: "cake", image: occ["birthday"], description: "Make their birthday unforgettable with cakes, bears and bouquets." },
  { id: "new-job", name: "New Job", icon: "briefcase", image: occ["new-job"], description: "Celebrate a new beginning with elegant, bright arrangements." },
  { id: "promotion", name: "Job Promotion", icon: "trophy", image: occ["promotion"], description: "Recognise their success with luxury statement pieces." },
  { id: "thank-you", name: "Thank You", icon: "hand-heart", image: occ["thank-you"], description: "A graceful way to say thank you, hand-tied in Beirut." },
  { id: "love-romance", name: "Love & Romance", icon: "heart", image: occ["love-romance"], description: "Romantic roses, eternal blooms and decadent bundles." },
  { id: "farewell", name: "Farewell", icon: "airplane", image: occ["farewell"], description: "Send a tender goodbye with our most heartfelt arrangements." },
  { id: "condolences", name: "Condolences", icon: "flower", image: occ["condolences"], description: "White and pastel arrangements to express quiet sympathy." },
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

export function getOccasion(id: string): Occasion | undefined {
  return occasions.find((o) => o.id === id);
}

export function getProductsByCategory(catId: string): Product[] {
  return products.filter((p) => p.category === catId);
}

export function getProductsByOccasion(occId: string): Product[] {
  return products.filter((p) => p.occasions?.includes(occId));
}

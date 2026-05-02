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
  wcId?: number;
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
  "baskets": { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/08/Birthday-Basket-copy.webp" },
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

const occFallback = {
  anniversary: require("@/assets/occasions/love-romance.webp"),
  wedding: require("@/assets/occasions/love-romance.webp"),
  graduation: require("@/assets/occasions/promotion.avif"),
  "get-well-soon": require("@/assets/occasions/thank-you.webp"),
  newborn: require("@/assets/categories/flower-boxes.avif"),
  eid: require("@/assets/categories/arabic-sweets.webp"),
  congratulations: require("@/assets/occasions/promotion.avif"),
  "thinking-of-you": require("@/assets/occasions/condolences.webp"),
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
  { id: "white-orchids-mom", name: "White Orchids", price: "$80", priceValue: 80, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant5.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "peaceful-bonsai", name: "Peaceful Bonsai", price: "$74", priceValue: 74, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant8.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "large-bonsai", name: "Large Bonsai", price: "$170", priceValue: 170, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant9.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "areca-palm", name: "Areca Palm", price: "$138", priceValue: 138, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant11.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "money-tree", name: "Money Tree", price: "$148", priceValue: 148, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant10.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "large-white-orchids", name: "Large White Orchids", price: "$191", priceValue: 191, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/09/plant6.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "cacti-in-a-pot", name: "Cacti in a Pot", price: "$37", priceValue: 37, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant2.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "vriesea", name: "Vriesea", price: "$42", priceValue: 42, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant4.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "guzmania", name: "Guzmania", price: "$53", priceValue: 53, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant4.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "zz-plant", name: "ZZ Plant", price: "$53", priceValue: 53, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant7.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "snake-plant", name: "Snake Plant", price: "$37", priceValue: 37, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant1.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "spikes", name: "Spikes", price: "$42", priceValue: 42, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/plant3.avif" }, category: "plants", occasions: ["housewarming","thank-you"] },
  { id: "carre-mix-sables-box", name: "Carré Mix Sablés Box", price: "$80", priceValue: 80, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/08/item-21.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "carre-mix-sables-chocolate-box", name: "Carré Mix Sablés + Chocolate Box", price: "$90", priceValue: 90, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/08/item-7.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "the-fierce-bundle", name: "The Fierce Bundle", price: "$111", priceValue: 111, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2020/12/20.webp" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "pretty-in-pink", name: "Pretty In Pink", price: "$145", priceValue: 145, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/06/Pink-Bundle.webp" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "small-mix-sables-box", name: "Small Mix Sablés Box", price: "$48", priceValue: 48, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/08/item-9.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "a-vous", name: "A-Vous", price: "$133", priceValue: 133, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/06/Chocolate-Box-Bundle.webp" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "classic-chocolate-box", name: "Classic Chocolate Box", price: "$53", priceValue: 53, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/02/White-Generic-Chocolate-Box.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "box-of-petit-four-mix", name: "Box Of Petit Four Mix", price: "$80", priceValue: 80, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/10/item-12.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "white-harmony-gift-set", name: "White Harmony Gift Set", price: "$154", priceValue: 154, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/White-Harmony-Gift-Set.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "sweet-scarlet-affair", name: "Sweet Scarlet Affair", price: "$160", priceValue: 160, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Sweet-Scarlet-Affair.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "pink-indulgence-bundle", name: "Pink Indulgence Bundle", price: "$160", priceValue: 160, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Pink-Indulgence-Bundle.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "mixed-tulip-vase-ferrero-rocher-chocolate-bundle", name: "Mixed Tulip Vase & Ferrero Rocher Chocolate Bundle", price: "$150", priceValue: 150, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Mixed-Tulip-Vase-Ferrero-Rocher-Chocolate-Bundle.avif" }, category: "chocolate", occasions: ["birthday","thank-you","love-romance"] },
  { id: "pink-balloons", name: "6 Pink Balloons", price: "$24", priceValue: 24, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Pink-Balloons.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "4-heart-balloon", name: "4 Red Heart Balloons", price: "$30", priceValue: 30, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/4-Red-Heart-Balloons.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "red-balloons", name: "6 Red Balloons", price: "$24", priceValue: 24, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Red-Balloons.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "vibrant-balloon-mix", name: "Vibrant Balloon Mix", price: "$24", priceValue: 24, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Mix-Bundle.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "get-well-soon-balloon-bundle", name: "Get Well Soon Bundle", price: "$31", priceValue: 31, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/get-well-soon-balloon-bundle.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "best-mom-ever-balloon", name: "Best Mom Ever Balloon", price: "$18", priceValue: 18, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/50.webp" }, category: "balloons", occasions: ["birthday"] },
  { id: "happy-birthday-balloon", name: "Happy Birthday Balloon", price: "$13", priceValue: 13, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/bday-2-bal.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "pink-heart-balloon-bouquet", name: "4 Pink Heart Balloon Bouquet", price: "$32", priceValue: 32, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/4-Pink-Heart-Balloon-Bouquet.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "gold-chrome-balloons", name: "6 Gold Chrome Balloons", price: "$27", priceValue: 27, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Gold-Chrome-Balloons.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "i-love-you-balloon-2", name: "I Love You Balloon", price: "$13", priceValue: 13, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/luv-bal.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "red-heart-balloon", name: "Red Heart Balloon", price: "$11", priceValue: 11, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Red-Heart-Balloon.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "get-well-balloon", name: "Get Well Balloon", price: "$13", priceValue: 13, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/item-2.avif" }, category: "balloons", occasions: ["birthday"] },
  { id: "hitster", name: "Hitster", price: "$30", priceValue: 30, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/09/hitsterr.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "kluster", name: "Kluster", price: "$33", priceValue: 33, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/kluster.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "le3beh-aa-krouteh", name: "Le3beh Aa Krouteh", price: "$41", priceValue: 41, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/cah.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "exploding-kittens-red", name: "Exploding Kittens Red", price: "$24", priceValue: 24, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/meow.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "123-cups-ar-en-fr", name: "123 cups Ar/En/Fr", price: "$29", priceValue: 29, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/123cupps.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "ubongo", name: "Ubongo!", price: "$53", priceValue: 53, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/09/ubunfo.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "risk", name: "Risk", price: "$69", priceValue: 69, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/riskk.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "yogi-guru-en", name: "Yogi Guru En", price: "$27", priceValue: 27, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/yugi.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "stratego-original", name: "Stratego Original", price: "$65", priceValue: 65, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/stategy.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "terraforming-mars-ar-en", name: "Terraforming Mars Ar/En", price: "$80", priceValue: 80, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/mars.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "sheriff-of-nottingham-en-ar-fr", name: "Sheriff of Nottingham En/Ar/Fr", price: "$59", priceValue: 59, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/sherif.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "machrou3-ra2is-a-game-of-corruption", name: "Machrou3 Ra2is &#8211; A Game of Corruption", price: "$50", priceValue: 50, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/mashrou3.avif" }, category: "board-games", occasions: ["birthday","thank-you"] },
  { id: "chocolate-rocher-cake", name: "Chocolate Rocher Cake", price: "$48", priceValue: 48, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/ferrero.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "nutella-cake", name: "Nutella Cake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/nutella-2.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "choco-fraisier-cake", name: "Choco Fraisier Cake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/nutella.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "fraisier", name: "Fraisier Cake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/strawberry.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "strawberry-cheesecake-2", name: "Strawberry Cheesecake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/1.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "redvelvet-cake", name: "Red Velvet Cake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/3.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "tiramisu-cake", name: "Tiramisu Cake", price: "$40", priceValue: 40, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/07/tiramissu.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "lotus-cheesecake", name: "Lotus Cheesecake", price: "$35", priceValue: 35, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/10/10.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "red-happy-birthday-candle", name: "Red Happy Birthday Candle", price: "$10", priceValue: 10, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/02/red-happy-birthday-candle-copy.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "yellow-happy-birthday-candle", name: "Yellow Happy Birthday Candle", price: "$10", priceValue: 10, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/04/happy-birthday-yellow-candle.avif" }, category: "cakes", occasions: ["birthday","thank-you"] },
  { id: "the-care-basket-for-her", name: "The Care Basket &#8211; For Her", price: "$148", priceValue: 148, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Basket-for-her_care-basket-copy.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "rise-shine-breakfast-basket", name: "Rise & Shine Breakfast Basket", price: "$85", priceValue: 85, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Rise-Shine-Breakfast-Basket-copy-scaled-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "50-shades-of-love", name: "50 Shades of Love", price: "$120", priceValue: 120, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/50-shades-of-love-copy-scaled-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "fruit-basket", name: "Fruit Basket", price: "$100", priceValue: 100, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Fruit-Basket-copy-scaled-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "bonjour-breakfast-basket", name: "Bonjour Breakfast Basket", price: "$85", priceValue: 85, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Bonjour-Breakfast-basket-copy-scaled-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "the-care-basket-for-him", name: "The Care Basket &#8211; For Him", price: "$143", priceValue: 143, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Basket-for-him-copy.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "royal-gift-basket", name: "Royal Gift Basket", price: "$180", priceValue: 180, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Royal-gift-basket-copy-scaled-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "haircare-must-haves", name: "Haircare Must-Haves", price: "$191", priceValue: 191, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Haircare-Must-Haves-copy.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "cheese-and-wine-basket-2", name: "Cheese and Wine Basket", price: "$254", priceValue: 254, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Cheese-Wine-Basket-1.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "home-sanctuary-bundle", name: "Home Sanctuary Bundle", price: "$122", priceValue: 122, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Home-Sanctuary-bundle-copy.avif" }, category: "bundles", occasions: ["housewarming","thank-you","condolences"] },
  { id: "bouquets-seches", name: "Bouquets Seches", price: "$64", priceValue: 64, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-37.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "rural-love", name: "Rural Love", price: "$42", priceValue: 42, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-10.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "awesome-blossom", name: "Awesome Blossom", price: "$69", priceValue: 69, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-5.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "hallab-baklava-extra", name: "Hallab Baklava Extra", price: "$90", priceValue: 90, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/10/item-28.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "natural-admiration", name: "Natural Admiration", price: "$69", priceValue: 69, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-27.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "symphony-in-bloom", name: "Symphony in Bloom", price: "$58", priceValue: 58, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-18.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "whimsical-affection", name: "Whimsical Affection", price: "$85", priceValue: 85, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-32.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "brown-sugar", name: "Brown Sugar", price: "$61", priceValue: 61, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-31.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "the-bohemian-vases", name: "The Bohemian Vases", price: "$58", priceValue: 58, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/09/vas9.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "amethyst-bouquet", name: "Amethyst Bouquet", price: "$42", priceValue: 42, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2023/09/item-8.avif" }, category: "dried-flowers", occasions: ["housewarming","thank-you"] },
  { id: "red-eternal-rose", name: "Red Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/red-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "white-eternal-rose", name: "White Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/white-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "pink-eternal-rose", name: "Pink Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/pink-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "blue-eternal-rose", name: "Blue Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/blue-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "heart-shaped-eternal-rose", name: "Red Heart-Shaped Eternal Rose", price: "$127", priceValue: 127, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/red-heart-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "yellow-eternal-rose", name: "Yellow Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/yellow-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "forever-fiery", name: "Forever Fiery", price: "$41", priceValue: 41, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/01/Forever-Fiery.avif" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "black-eternal-rose", name: "Black Eternal Rose", price: "$51", priceValue: 51, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/black-eternal.webp" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "eternal-crush", name: "Eternal Crush", price: "$41", priceValue: 41, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/01/Eternal-Crush.avif" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "the-eternity-bundle", name: "The Eternity Bundle", price: "$118", priceValue: 118, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/01/The-Eternity-Bundle.avif" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "pure-eternity", name: "Pure Eternity", price: "$41", priceValue: 41, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2026/01/Pure-Eternity.avif" }, category: "preserved-flowers", occasions: ["love-romance","thank-you"] },
  { id: "birthday-basket", name: "Birthday Basket", price: "$90", priceValue: 90, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/08/Birthday-Basket-copy.webp" }, category: "baskets", occasions: ["birthday","thank-you"] },
  { id: "the-single-roses-basket", name: "The Single Roses Basket", price: "$138", priceValue: 138, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/08/The-single-roses-basket-copy.webp" }, category: "baskets", occasions: ["love-romance","thank-you"] },
  { id: "cheese-and-wine-basket-2", name: "Cheese & Wine Basket", price: "$254", priceValue: 254, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Cheese-Wine-Basket-1.avif" }, category: "baskets", occasions: ["housewarming","thank-you"] },
  { id: "cheese-and-juice-basket", name: "Cheese & Juice Basket", price: "$191", priceValue: 191, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/12/Cheese-Juice-Basket.avif" }, category: "baskets", occasions: ["housewarming","thank-you"] },
  { id: "the-ritual", name: "The Ritual", price: "$122", priceValue: 122, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/The-ritual-copy.avif" }, category: "baskets", occasions: ["housewarming","thank-you","condolences"] },
  { id: "best-of-best", name: "Best of Best", price: "$106", priceValue: 106, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Best-of-best-copy.avif" }, category: "baskets", occasions: ["birthday","thank-you"] },
  { id: "care-basket-her", name: "The Care Basket — For Her", price: "$148", priceValue: 148, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Basket-for-her_care-basket-copy.avif" }, category: "baskets", occasions: ["housewarming","thank-you","condolences"] },
  { id: "care-basket-him", name: "The Care Basket — For Him", price: "$143", priceValue: 143, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Basket-for-him-copy.avif" }, category: "baskets", occasions: ["housewarming","thank-you","condolences"] },
  { id: "rise-shine-basket", name: "Rise & Shine Breakfast Basket", price: "$85", priceValue: 85, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Rise-Shine-Breakfast-Basket-copy-scaled-1.avif" }, category: "baskets", occasions: ["housewarming","thank-you"] },
  { id: "bonjour-basket", name: "Bonjour Breakfast Basket", price: "$85", priceValue: 85, image: { uri: "https://presentail.com/lebanon/wp-content/uploads/2025/03/Bonjour-Breakfast-basket-copy-scaled-1.avif" }, category: "baskets", occasions: ["housewarming","thank-you"] },
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
  { id: "baskets", name: "Gift Baskets", icon: "basket", image: cat["baskets"] },
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
  { id: "birthday", name: "Birthday", icon: "cake", image: occ["birthday"], description: "Make their birthday unforgettable with cakes, bears and bouquets." },
  { id: "love-romance", name: "Love & Romance", icon: "heart", image: occ["love-romance"], description: "Romantic roses, eternal blooms and decadent bundles." },
  { id: "housewarming", name: "Housewarming", icon: "home", image: occ["housewarming"], description: "Welcome them to a new chapter with blooms and home pieces." },
  { id: "anniversary", name: "Anniversary", icon: "heart-circle", image: occFallback.anniversary, description: "Celebrate years of love with romantic flowers and special gifts." },
  { id: "new-job", name: "New Job", icon: "briefcase", image: occ["new-job"], description: "Celebrate a new beginning with elegant, bright arrangements." },
  { id: "promotion", name: "Job Promotion", icon: "trophy", image: occ["promotion"], description: "Recognise their success with luxury statement pieces." },
  { id: "graduation", name: "Graduation", icon: "school", image: occFallback.graduation, description: "Celebrate academic achievement with vibrant blooms and gifts." },
  { id: "congratulations", name: "Congratulations", icon: "party-popper", image: occFallback.congratulations, description: "Mark their milestone with celebratory blooms and luxurious gifts." },
  { id: "thank-you", name: "Thank You", icon: "hand-heart", image: occ["thank-you"], description: "A graceful way to say thank you, hand-tied in Beirut." },
  { id: "get-well-soon", name: "Get Well Soon", icon: "emoticon-happy", image: occFallback["get-well-soon"], description: "Brighten their recovery with cheery blooms and heartfelt gifts." },
  { id: "newborn", name: "New Baby", icon: "baby-carriage", image: occFallback.newborn, description: "Welcome a precious new arrival with pastel blooms and sweet gifts." },
  { id: "eid", name: "Eid Mubarak", icon: "star-crescent", image: occFallback.eid, description: "Celebrate the spirit of Eid with premium treats and elegant arrangements." },
  { id: "wedding", name: "Wedding", icon: "ring", image: occFallback.wedding, description: "Mark the most special day with breathtaking floral arrangements." },
  { id: "thinking-of-you", name: "Thinking of You", icon: "cards-heart", image: occFallback["thinking-of-you"], description: "Let someone know they are in your thoughts with a heartfelt gift." },
  { id: "farewell", name: "Farewell", icon: "airplane", image: occ["farewell"], description: "Send a tender goodbye with our most heartfelt arrangements." },
  { id: "condolences", name: "Condolences", icon: "flower", image: occ["condolences"], description: "White and pastel arrangements to express quiet sympathy." },
];

export type Brand = { name: string; slug: string };

export const brands: Brand[] = [
  { name: "Apple", slug: "apple" },
  { name: "SuperHeated Neurons", slug: "superheated-neurons" },
  { name: "Salma", slug: "salma" },
  { name: "Hallab 1881", slug: "hallab" },
  { name: "Rifai", slug: "rifai" },
  { name: "Fujifilm", slug: "fujifilm" },
  { name: "Samsung", slug: "samsung" },
  { name: "Nintendo", slug: "nintendo" },
  { name: "PlayStation", slug: "playstation-gifts-lebanon" },
  { name: "Sablés Gourmets", slug: "sables-gourmets" },
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

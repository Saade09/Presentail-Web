import type {
  Brand,
  CatalogReview,
  Category,
  Occasion,
} from "./types";

const cat = {
  baskets: { uri: "https://presentail.com/lebanon/wp-content/uploads/2024/08/Birthday-Basket-copy.webp" },
  "lux-arrangements": { asset: "categories/lux-arrangements.avif" },
  "hand-bouquets": { asset: "categories/hand-bouquets.webp" },
  "flower-boxes": { asset: "categories/flower-boxes.avif" },
  "flower-vases": { asset: "categories/flower-vases.avif" },
  "preserved-flowers": { asset: "categories/preserved-flowers.avif" },
  "stuffed-animals": { asset: "categories/stuffed-animals.webp" },
  balloons: { asset: "categories/balloons.webp" },
  cakes: { asset: "categories/cakes.webp" },
  chocolate: { asset: "categories/chocolate.webp" },
  "arabic-sweets": { asset: "categories/arabic-sweets.webp" },
  plants: { asset: "categories/plants.webp" },
  bundles: { asset: "categories/bundles.webp" },
  "gift-cards": { asset: "categories/gift-cards.webp" },
} as const;

const occ = {
  "love-romance": { asset: "occasions/love-romance.webp" },
  birthday: { asset: "occasions/birthday.webp" },
  housewarming: { asset: "occasions/housewarming.avif" },
  "new-job": { asset: "occasions/new-job.avif" },
  promotion: { asset: "occasions/promotion.avif" },
  "thank-you": { asset: "occasions/thank-you.webp" },
  farewell: { asset: "occasions/farewell.avif" },
  condolences: { asset: "occasions/condolences.webp" },
} as const;

const occFallback = {
  anniversary: { asset: "occasions/love-romance.webp" },
  wedding: { asset: "occasions/love-romance.webp" },
  graduation: { asset: "occasions/promotion.avif" },
  "get-well-soon": { asset: "occasions/thank-you.webp" },
  newborn: { asset: "categories/flower-boxes.avif" },
  eid: { asset: "categories/arabic-sweets.webp" },
  congratulations: { asset: "occasions/promotion.avif" },
  "thinking-of-you": { asset: "occasions/condolences.webp" },
  colleague: { asset: "occasions/thank-you.webp" },
  friend: { asset: "occasions/love-romance.webp" },
  "im-sorry": { asset: "occasions/condolences.webp" },
  children: { asset: "occasions/birthday.webp" },
} as const;

export const categories: Category[] = [
  { id: "lux-arrangements", name: "Lux Arrangements", icon: "flower-tulip", image: cat["lux-arrangements"] },
  { id: "baskets", name: "Gift Baskets", icon: "basket", image: cat.baskets },
  { id: "hand-bouquets", name: "Flower Bouquets", icon: "flower", image: cat["hand-bouquets"] },
  { id: "flower-boxes", name: "Flower Boxes", icon: "package-variant", image: cat["flower-boxes"] },
  { id: "flower-vases", name: "Flower Vases", icon: "vase", image: cat["flower-vases"] },
  { id: "preserved-flowers", name: "Preserved Flowers", icon: "flower-poppy", image: cat["preserved-flowers"] },
  { id: "stuffed-animals", name: "Bears", icon: "teddy-bear", image: cat["stuffed-animals"] },
  { id: "balloons", name: "Balloons", icon: "balloon", image: cat.balloons },
  { id: "cakes", name: "Cakes", icon: "cake-variant", image: cat.cakes },
  { id: "chocolate", name: "Chocolate", icon: "candy", image: cat.chocolate },
  { id: "arabic-sweets", name: "Arabic Sweets", icon: "candy-outline", image: cat["arabic-sweets"] },
  { id: "plants", name: "Plants", icon: "leaf", image: cat.plants },
  { id: "bundles", name: "Bundles", icon: "gift", image: cat.bundles },
  { id: "gift-cards", name: "Gift Cards", icon: "card-giftcard", image: cat["gift-cards"] },
];

export const occasions: Occasion[] = [
  { id: "birthday", name: "Birthday", icon: "cake", image: occ.birthday, description: "Make their birthday unforgettable with cakes, bears and bouquets." },
  { id: "love-romance", name: "Love & Romance", icon: "heart", image: occ["love-romance"], description: "Romantic roses, eternal blooms and decadent bundles." },
  { id: "housewarming", name: "Housewarming", icon: "home", image: occ.housewarming, description: "Welcome them to a new chapter with blooms and home pieces." },
  { id: "anniversary", name: "Anniversary", icon: "heart-circle", image: occFallback.anniversary, description: "Celebrate years of love with romantic flowers and special gifts." },
  { id: "new-job", name: "New Job", icon: "briefcase", image: occ["new-job"], description: "Celebrate a new beginning with elegant, bright arrangements." },
  { id: "promotion", name: "Job Promotion", icon: "trophy", image: occ.promotion, description: "Recognise their success with luxury statement pieces." },
  { id: "graduation", name: "Graduation", icon: "school", image: occFallback.graduation, description: "Celebrate academic achievement with vibrant blooms and gifts." },
  { id: "congratulations", name: "Congratulations", icon: "party-popper", image: occFallback.congratulations, description: "Mark their milestone with celebratory blooms and luxurious gifts." },
  { id: "thank-you", name: "Thank You", icon: "hand-heart", image: occ["thank-you"], description: "A graceful way to say thank you, hand-tied in Beirut." },
  { id: "get-well-soon", name: "Get Well Soon", icon: "emoticon-happy", image: occFallback["get-well-soon"], description: "Brighten their recovery with cheery blooms and heartfelt gifts." },
  { id: "newborn", name: "New Baby", icon: "baby-carriage", image: occFallback.newborn, description: "Welcome a precious new arrival with pastel blooms and sweet gifts." },
  { id: "eid", name: "Eid Mubarak", icon: "star-crescent", image: occFallback.eid, description: "Celebrate the spirit of Eid with premium treats and elegant arrangements." },
  { id: "wedding", name: "Wedding", icon: "ring", image: occFallback.wedding, description: "Mark the most special day with breathtaking floral arrangements." },
  { id: "thinking-of-you", name: "Thinking of You", icon: "cards-heart", image: occFallback["thinking-of-you"], description: "Let someone know they are in your thoughts with a heartfelt gift." },
  { id: "farewell", name: "Farewell", icon: "airplane", image: occ.farewell, description: "Send a tender goodbye with our most heartfelt arrangements." },
  { id: "condolences", name: "Condolences", icon: "flower", image: occ.condolences, description: "White and pastel arrangements to express quiet sympathy." },
  { id: "colleague", name: "Colleague", icon: "briefcase-account", image: occFallback.colleague, description: "Thoughtful gifts for a valued colleague or work milestone." },
  { id: "friend", name: "Friend", icon: "account-heart", image: occFallback.friend, description: "Show your friends how much you care with a heartfelt gift." },
  { id: "im-sorry", name: "I'm Sorry", icon: "hand-heart", image: occFallback["im-sorry"], description: "A sincere apology, expressed through flowers and care." },
  { id: "children", name: "Children", icon: "star", image: occFallback.children, description: "Bright and joyful gifts to delight the little ones." },
  { id: "valentine", name: "Valentine's Day", icon: "heart", image: occ["love-romance"], description: "Red roses and romantic gifts for the most loving day of the year." },
  { id: "mothers-day", name: "Mother's Day", icon: "flower-2", image: occ["thank-you"], description: "Celebrate mum with beautiful blooms and heartfelt gifts." },
  { id: "womens-day", name: "Women's Day", icon: "sparkles", image: occ["love-romance"], description: "Honour the special women in your life with elegant flowers and gifts." },
  { id: "fathers-day", name: "Father's Day", icon: "user", image: occ.promotion, description: "Show dad how much he means to you with a thoughtful gift." },
  { id: "christmas", name: "Christmas", icon: "gift", image: occFallback.congratulations, description: "Spread festive joy with seasonal blooms and luxury gift sets." },
];

// Brands are served from Presentail OS via `GET /api/woo/brands`.
// Do NOT add brands here — add them in Presentail OS instead.
export const brands: Brand[] = [];

export const reviews: CatalogReview[] = [
  { id: "1", name: "Sarah K.", text: "A truly wonderful experience — the bouquet arrived exactly as pictured.", rating: 5 },
  { id: "2", name: "Zahra A.", text: "Even in times of war, they proved their excellence and reliability.", rating: 5 },
  { id: "3", name: "Roula R.", text: "Thank you for great service and hospitality. Truly above and beyond.", rating: 5 },
  { id: "4", name: "Sami A.", text: "Awesome service. The recipient was delighted from the first glance.", rating: 5 },
];

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getOccasion(id: string): Occasion | undefined {
  return occasions.find((o) => o.id === id);
}

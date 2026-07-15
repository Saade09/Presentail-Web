import type { Product } from "./queries";

export type BirthdayRecipient = {
  key: string;
  labelKey: string;
  preferredCategories: string[];
  excludeNameKeywords: string[];
};

export const BIRTHDAY_RECIPIENTS: BirthdayRecipient[] = [
  {
    key: "mom",
    labelKey: "shop.birthdayFor.mom",
    preferredCategories: ["hand-bouquets", "flower-boxes", "flower-baskets", "cakes", "chocolate", "bundles"],
    excludeNameKeywords: [],
  },
  {
    key: "wife",
    labelKey: "shop.birthdayFor.wife",
    preferredCategories: ["hand-bouquets", "flower-boxes", "flower-baskets", "chocolate", "bundles"],
    excludeNameKeywords: [],
  },
  {
    key: "girlfriend",
    labelKey: "shop.birthdayFor.girlfriend",
    preferredCategories: ["hand-bouquets", "flower-boxes", "chocolate", "cakes", "bundles"],
    excludeNameKeywords: [],
  },
  {
    key: "dad",
    labelKey: "shop.birthdayFor.dad",
    preferredCategories: ["chocolate", "spirits", "plants", "bundles", "gift-baskets", "flower-boxes"],
    excludeNameKeywords: ["pink", "rose gold", "rosé", "blush", "lilac", "lavender", "fuchsia", "magenta", "plum", "heart", "hearts", "love", "romance", "romantic", "passionate", "promise", "her"],
  },
  {
    key: "husband",
    labelKey: "shop.birthdayFor.husband",
    preferredCategories: ["plants", "chocolate", "bundles", "gift-baskets", "hand-bouquets", "flower-boxes"],
    excludeNameKeywords: ["pink", "rose gold", "rosé", "blush", "lilac", "lavender", "fuchsia", "magenta", "plum", "heart", "hearts", "love", "romance", "romantic", "passionate", "promise", "her"],
  },
  {
    key: "boyfriend",
    labelKey: "shop.birthdayFor.boyfriend",
    preferredCategories: ["plants", "chocolate", "bundles", "cakes", "gift-baskets"],
    excludeNameKeywords: ["pink", "rose gold", "rosé", "blush", "lilac", "lavender", "fuchsia", "magenta", "plum", "heart", "hearts", "love", "romance", "romantic", "passionate", "promise", "her"],
  },
  {
    key: "kids",
    labelKey: "shop.birthdayFor.kids",
    preferredCategories: ["cakes", "chocolate", "bundles"],
    excludeNameKeywords: [],
  },
  {
    key: "teta",
    labelKey: "shop.birthdayFor.teta",
    preferredCategories: ["hand-bouquets", "flower-baskets", "flower-boxes", "plants", "cakes"],
    excludeNameKeywords: [],
  },
  {
    key: "jedo",
    labelKey: "shop.birthdayFor.jedo",
    preferredCategories: ["plants", "chocolate", "bundles", "gift-baskets", "flower-boxes"],
    excludeNameKeywords: ["pink", "rose gold", "rosé", "blush", "lilac", "lavender", "fuchsia", "magenta", "plum", "heart", "hearts", "love", "romance", "romantic", "passionate", "promise", "her"],
  },
];

export function applyRecipientFilter(products: Product[], recipientKey: string): Product[] {
  if (!recipientKey || recipientKey === "all") return products;

  const recipient = BIRTHDAY_RECIPIENTS.find((r) => r.key === recipientKey);
  if (!recipient) return products;

  const { preferredCategories, excludeNameKeywords } = recipient;
  const preferredSet = new Set(preferredCategories);

  const filtered = products.filter((p) => {
    const productCategories = p.categories ?? [p.category];
    if (!productCategories.some((c) => preferredSet.has(c))) return false;
    if (excludeNameKeywords.length > 0) {
      const lower = p.name.toLowerCase();
      if (excludeNameKeywords.some((kw) => lower.includes(kw))) return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : products;
}

import type { Product } from "./queries";

export type BirthdayRecipient = {
  key: string;
  labelKey: string;
  preferredCategories: string[];
  excludeColorKeywords: string[];
};

export const BIRTHDAY_RECIPIENTS: BirthdayRecipient[] = [
  {
    key: "mom",
    labelKey: "shop.birthdayFor.mom",
    preferredCategories: ["hand-bouquets", "flower-boxes", "flower-baskets", "cakes", "chocolate", "bundles"],
    excludeColorKeywords: [],
  },
  {
    key: "dad",
    labelKey: "shop.birthdayFor.dad",
    preferredCategories: ["plants", "chocolate", "bundles", "gift-baskets", "hand-bouquets"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta"],
  },
  {
    key: "teta",
    labelKey: "shop.birthdayFor.teta",
    preferredCategories: ["hand-bouquets", "flower-baskets", "flower-boxes", "plants", "cakes"],
    excludeColorKeywords: [],
  },
  {
    key: "jedo",
    labelKey: "shop.birthdayFor.jedo",
    preferredCategories: ["plants", "chocolate", "bundles", "gift-baskets"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta"],
  },
  {
    key: "girlfriend",
    labelKey: "shop.birthdayFor.girlfriend",
    preferredCategories: ["hand-bouquets", "flower-boxes", "chocolate", "cakes", "bundles"],
    excludeColorKeywords: [],
  },
  {
    key: "boyfriend",
    labelKey: "shop.birthdayFor.boyfriend",
    preferredCategories: ["plants", "chocolate", "bundles", "cakes", "gift-baskets"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta"],
  },
  {
    key: "wife",
    labelKey: "shop.birthdayFor.wife",
    preferredCategories: ["hand-bouquets", "flower-boxes", "flower-baskets", "chocolate", "bundles"],
    excludeColorKeywords: [],
  },
  {
    key: "husband",
    labelKey: "shop.birthdayFor.husband",
    preferredCategories: ["plants", "chocolate", "bundles", "gift-baskets", "hand-bouquets"],
    excludeColorKeywords: ["pink", "rose gold", "blush", "lilac", "lavender", "fuchsia", "magenta"],
  },
  {
    key: "kids",
    labelKey: "shop.birthdayFor.kids",
    preferredCategories: ["cakes", "chocolate", "flower-boxes", "bundles", "hand-bouquets"],
    excludeColorKeywords: [],
  },
];

export function applyRecipientFilter(products: Product[], recipientKey: string): Product[] {
  if (!recipientKey || recipientKey === "all") return products;

  const recipient = BIRTHDAY_RECIPIENTS.find((r) => r.key === recipientKey);
  if (!recipient) return products;

  const { preferredCategories, excludeColorKeywords } = recipient;
  const preferredSet = new Set(preferredCategories);

  const filtered = products.filter((p) => {
    const productCategories = p.categories ?? [p.category];
    if (!productCategories.some((c) => preferredSet.has(c))) return false;
    if (excludeColorKeywords.length > 0) {
      const lower = p.name.toLowerCase();
      if (excludeColorKeywords.some((kw) => lower.includes(kw))) return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : products;
}

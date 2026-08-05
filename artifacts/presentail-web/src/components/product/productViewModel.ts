import { calcRewardPoints } from "@workspace/display-currency";
import { CATEGORY_CARE_GROUP, CATEGORY_CARE_ICON } from "@workspace/catalog-data";
import type { Product } from "@/lib/queries";

export type ProductViewModel = {
  galleryImages: { uri: string }[];
  bouquetIncludes: string[];
  description: string;
  careGroup: string;
  careIconName: string;
  rewardPoints: number;
  inStock: boolean;
};

const DEFAULT_INCLUDES = [
  "Hand-arranged seasonal stems",
  "Signature Presentail wrapping",
  "Personal note card",
  "Curated by our Beirut atelier",
];

function parseDescriptionParts(desc: string): {
  intro: string;
  items: string[];
} {
  const match = desc.match(/[•\u2022\n\r]/);

  if (!match || match.index === undefined) {
    return { intro: desc.trim(), items: [] };
  }

  const intro = desc.slice(0, match.index).trim();
  const rest = desc.slice(match.index);
  const items = rest
    .split(/\n|•|\u2022|\r/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 140)
    .slice(0, 8);

  return { intro, items: items.length >= 2 ? items : [] };
}

export function buildProductViewModel(product: Product): ProductViewModel {
  const fromImages = (product.images ?? []).filter((i) => i?.uri);
  const galleryImages =
    fromImages.length > 0
      ? fromImages
      : product.image?.uri
        ? [product.image]
        : [];

  const rawDescription = product.description?.trim() ?? "";
  const fallbackDescription = `The "${product.name}" is a captivating Presentail piece — hand-arranged in our atelier with the freshest seasonal blooms, finished with our boutique wrapping and a personal note card.`;

  const { intro, items } = parseDescriptionParts(rawDescription);

  // If the intro is just a bare label ("Bundle includes:", "Flower box includes:"),
  // fall back to the full rawDescription so no content is lost — the BOUQUET INCLUDES
  // section will be hidden automatically when description already contains bullet chars.
  const isBareLabel = intro.endsWith(":") && intro.length <= 40;
  const effectiveIntro = isBareLabel ? rawDescription : intro;
  const description = effectiveIntro !== "" ? effectiveIntro : items.length === 0 ? (rawDescription || fallbackDescription) : "";
  const bouquetIncludes = items.length ? items : DEFAULT_INCLUDES;

  const rewardPoints = calcRewardPoints(product.priceValue);

  const categorySlug = product.category ?? "";
  const careGroup = CATEGORY_CARE_GROUP[categorySlug] ?? "flowers";
  const careIconName = CATEGORY_CARE_ICON[categorySlug] ?? "flower-tulip";

  return {
    galleryImages,
    bouquetIncludes,
    description,
    careGroup,
    careIconName,
    rewardPoints,
    inStock: product.inStock,
  };
}

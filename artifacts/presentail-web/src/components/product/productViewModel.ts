import { calcRewardPoints } from "@workspace/display-currency";
import type { Product } from "@/lib/queries";

export type ProductViewModel = {
  galleryImages: { uri: string }[];
  bouquetIncludes: string[];
  description: string;
  careTips: string[];
  rewardPoints: number;
  inStock: boolean;
};

const DEFAULT_CARE_TIPS = [
  "Trim 2cm off stems at a 45° angle every 2–3 days.",
  "Refresh the water daily; keep away from direct sunlight.",
  "Remove any leaves below the waterline to prevent bacteria.",
  "Display in a cool spot, away from fruit bowls and AC vents.",
];

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
  // Only bullet characters and newlines are recognised as list delimiters.
  // Semicolons and other punctuation are treated as ordinary prose.
  const match = desc.match(/[•\u2022\n\r]/);

  if (!match || match.index === undefined) {
    // No bullets or newlines — pure prose, behaviour unchanged.
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

  const description = intro !== "" ? intro : items.length === 0 ? (rawDescription || fallbackDescription) : "";
  const bouquetIncludes = items.length ? items : DEFAULT_INCLUDES;

  const rewardPoints = calcRewardPoints(product.priceValue);

  return {
    galleryImages,
    bouquetIncludes,
    description,
    careTips: DEFAULT_CARE_TIPS,
    rewardPoints,
    inStock: product.inStock,
  };
}

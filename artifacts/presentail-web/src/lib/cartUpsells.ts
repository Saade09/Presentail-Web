import type { Product } from "@/lib/queries";

export type UpsellTabId =
  | "recommended"
  | "single_balloons"
  | "balloon_bundles"
  | "chocolate"
  | "plants"
  | "bears"
  | "candles";

export type UpsellTabDef = {
  id: UpsellTabId;
  /**
   * Hardcoded product names to include in this tab. Matched
   * case-insensitively with whitespace normalised.
   */
  productNames?: string[];
  /**
   * Optional catalog category slug. All products whose `category` matches
   * this value are included in the tab. Results are merged with any
   * `productNames` matches and deduplicated by product id.
   */
  categoryId?: string;
  /**
   * Optional list of product names within this tab that do NOT support
   * express delivery (e.g. items that need lead time to prepare). Names
   * are matched case-insensitively, same as `productNames`. Anything not
   * listed here is assumed to support express.
   */
  noExpressNames?: string[];
};

export type ResolvedUpsellProduct = Product & {
  /** True when the curated entry supports express delivery. */
  supportsExpress: boolean;
};

export type ResolvedUpsellTab = {
  id: UpsellTabId;
  products: ResolvedUpsellProduct[];
};

export const UPSELL_TABS: UpsellTabDef[] = [
  {
    id: "recommended",
    productNames: [
      "Red Heart Balloon",
      "Classic Chocolate Box",
      "Birthday Bear",
      "Red Happy Birthday Candle",
      "Happy Birthday! Balloon",
      "6 Pink Balloons",
    ],
  },
  {
    id: "single_balloons",
    productNames: [
      "Red Heart Balloon",
      "Gold Heart Balloon",
      "Silver Heart Balloon",
      "Pink Heart Balloon",
      "Happy Birthday! Balloon",
      "I Love You Balloon",
    ],
  },
  {
    id: "balloon_bundles",
    productNames: [
      "6 Pink Balloons",
      "6 Red Balloons",
      "Rose Gold and Silver Heart Balloons",
      "Baby Girl Bundle",
      "Baby Boy Bundle",
      "Pink Happy Birthday Bundle",
      "Vibrant Mix",
    ],
  },
  {
    id: "chocolate",
    categoryId: "chocolate",
  },
  {
    id: "plants",
    productNames: [
      "Snake Plant",
      "Cacti in a Pot",
      "White Orchids",
      "Peaceful Bonsai",
    ],
  },
  {
    id: "bears",
    productNames: [
      "Love Bear",
      "Birthday Bear",
      "Marmalade Bear",
      "Red Bear",
      "Rosy the Bear",
    ],
  },
  {
    id: "candles",
    productNames: [
      "Red Happy Birthday Candle",
      "Yellow Happy Birthday Candle",
    ],
  },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolves curated upsell tabs against the live store catalog. Names are
 * matched case-insensitively with whitespace normalised. Names that don't
 * resolve are silently dropped, and tabs that end up empty are removed
 * entirely. Each resolved product carries a `supportsExpress` flag derived
 * from the curated tab's `noExpressNames` opt-out list.
 */
export function resolveUpsellTabs(
  catalog: readonly Product[],
): ResolvedUpsellTab[] {
  const byName = new Map<string, Product>();
  for (const p of catalog) {
    if (!p?.name) continue;
    const key = normalizeName(p.name);
    if (!byName.has(key)) byName.set(key, p);
  }

  const result: ResolvedUpsellTab[] = [];
  for (const tab of UPSELL_TABS) {
    const noExpress = new Set(
      (tab.noExpressNames ?? []).map((n) => normalizeName(n)),
    );
    const seen = new Set<string>();
    const products: ResolvedUpsellProduct[] = [];

    for (const name of tab.productNames ?? []) {
      const key = normalizeName(name);
      const found = byName.get(key);
      if (!found) continue;
      if (seen.has(found.id)) continue;
      seen.add(found.id);
      products.push({ ...found, supportsExpress: !noExpress.has(key) });
    }

    if (tab.categoryId) {
      for (const p of catalog) {
        if (!p?.id) continue;
        if (p.category !== tab.categoryId) continue;
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        products.push({ ...p, supportsExpress: true });
      }
    }

    if (products.length > 0) result.push({ id: tab.id, products });
  }
  return result;
}

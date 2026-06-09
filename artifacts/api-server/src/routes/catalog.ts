import { Router, type IRouter } from "express";
import {
  GetCatalogMetadataResponse,
  GetCurrenciesResponse,
} from "@workspace/api-zod";
import {
  categories,
  COUNTRY_TO_CURRENCY_MAP,
  CURRENCIES,
  FALLBACK_CURRENCY_CODE,
  occasions,
} from "@workspace/catalog-data";
import { getOsBrands, getOsOccasions, getOsProducts } from "../lib/osProductsCache";

const router: IRouter = Router();

const STORE_KEYS = ["lebanon", "dubai", "abudhabi", "cyprus"] as const;

router.get("/currencies", (_req, res) => {
  const data = GetCurrenciesResponse.parse({
    currencies: CURRENCIES,
    fallbackCode: FALLBACK_CURRENCY_CODE,
    countryToCurrency: COUNTRY_TO_CURRENCY_MAP,
  });
  res.json(data);
});

router.get("/catalog/occasions", (_req, res) => {
  const osOccasions = getOsOccasions();
  const featured = osOccasions
    ? osOccasions
        .filter((o) => o.featured === true)
        .map((o) => ({ slug: o.slug, name: o.name, image: o.image ?? null }))
    : [];
  res.json({ occasions: featured });
});

router.get("/catalog/metadata", (_req, res) => {
  const osBrands = getOsBrands();

  // Compute per-brand in-stock product count across all stores,
  // deduplicating by product id so a product deliverable to multiple
  // regions is only counted once.
  const brandCountMap = new Map<string, number>();
  const seenProductIds = new Set<string>();
  for (const key of STORE_KEYS) {
    const products = getOsProducts(key) ?? [];
    for (const p of products) {
      if (!p.inStock || seenProductIds.has(p.id)) continue;
      seenProductIds.add(p.id);
      for (const b of p.brands ?? []) {
        brandCountMap.set(b.slug, (brandCountMap.get(b.slug) ?? 0) + 1);
      }
    }
  }

  const brands = osBrands
    ? osBrands.map((b) => ({
        name: b.name,
        slug: b.slug,
        image: b.image ?? null,
        count: brandCountMap.get(b.slug) ?? 0,
      }))
    : [];

  const data = GetCatalogMetadataResponse.parse({
    categories,
    occasions,
    brands,
  });
  res.json(data);
});

export default router;

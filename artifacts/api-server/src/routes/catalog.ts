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
import { getOsBrands } from "../lib/osProductsCache";

const router: IRouter = Router();

router.get("/currencies", (_req, res) => {
  const data = GetCurrenciesResponse.parse({
    currencies: CURRENCIES,
    fallbackCode: FALLBACK_CURRENCY_CODE,
    countryToCurrency: COUNTRY_TO_CURRENCY_MAP,
  });
  res.json(data);
});

router.get("/catalog/metadata", (_req, res) => {
  const osBrands = getOsBrands();
  const brands = osBrands
    ? osBrands.map((b) => ({ name: b.name, slug: b.slug }))
    : [];

  const data = GetCatalogMetadataResponse.parse({
    categories,
    occasions,
    brands,
  });
  res.json(data);
});

export default router;

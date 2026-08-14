import { useProducts, useCategoryProducts, useOccasionProducts, useBrandProducts, useCatalogMetadata, useCatalogOccasions, useFxRates, usePageDescription, type Product } from "@/lib/queries";
import { setOccasionRef } from "@/lib/occasionAttribution";
import { buildRichClientDescription } from "@/lib/pageDescriptionClient";
import { applyRecipientFilter, BIRTHDAY_RECIPIENTS } from "@/lib/birthdayRecipients";
import { applyAnniversaryGenderFilter } from "@/lib/anniversaryGender";
import { applyLoveRomanceGenderFilter } from "@/lib/loveRomanceGender";
import { applyNewbornGenderFilter, useNewbornGenderMap, VALID_NEWBORN_GENDER_KEYS } from "@/lib/newbornGender";
import { BirthdayRecipientTabs } from "@/components/BirthdayRecipientTabs";
import { AnniversaryGenderTabs } from "@/components/AnniversaryGenderTabs";
import { LoveRomanceGenderTabs } from "@/components/LoveRomanceGenderTabs";
import { NewbornGenderTabs } from "@/components/NewbornGenderTabs";
import { BearSizeTabs } from "@/components/BearSizeTabs";
import { VALID_BEAR_SIZE_KEYS, applyBearSizeFilter, useBearSizeMap } from "@/lib/bearSizes";
import { usePlantClassificationMap } from "@/lib/plantClassifications";
import { SEOContentSection } from "@/components/SEOContentSection";
import { ProductCard } from "@/components/ProductCard";
import { useSearch, useLocation, useParams, Link } from "wouter";
import { useEffect, useRef } from "react";
import { useLcpImagePreload } from "@/hooks/useLcpImagePreload";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Filter, MapPin, SlidersHorizontal, X } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { buildCategorySeo, buildOccasionSeo } from "@/lib/seo";
import { getOccasionSeoContent } from "@/data/occasionSeoContent.mjs";
import { getCategorySeoContent } from "@/data/categorySeoContent.mjs";
import { cityIdToSlug } from "@/lib/locale-route";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { ShopFilters, type PriceBucket, type PriceBucketDef, type ColorFacet } from "@/components/ShopFilters";

import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { buildFeeNode } from "@/lib/feeNode";
import { roundToNearestFive } from "@workspace/display-currency";
import { extractColor, useProductColorHints } from "@/lib/colorExtractor";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

const SEO_ATTR = "data-seo-managed";

const VALID_BIRTHDAY_RECIPIENT_KEYS = new Set([
  "all", "mom", "dad", "teta", "jedo", "girlfriend", "boyfriend", "wife", "husband", "kids",
]);

const VALID_ANNIVERSARY_GENDER_KEYS = new Set(["all", "her", "him"]);
const VALID_LOVE_ROMANCE_GENDER_KEYS = new Set(["all", "her", "him"]);
const NEW_BORN_OCCASION_SLUG = "new-born";

const STUFFED_ANIMALS_SLUG = "stuffed-animals";
const PLANTS_SLUG = "plants";

function setMeta(selector: string, attrs: Record<string, string>, parent: HTMLElement) {
  let el = parent.querySelector<HTMLElement>(`${selector}[${SEO_ATTR}]`);
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    el.setAttribute(SEO_ATTR, "true");
    parent.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

const CATEGORIES = [
  { slug: "hand-bouquets", labelKey: "shop.cat.handBouquets" },
  { slug: "flower-boxes", labelKey: "shop.cat.flowerBoxes" },
  { slug: "flower-baskets", labelKey: "shop.cat.flowerBaskets" },
  { slug: "plants", labelKey: "shop.cat.plants" },
  { slug: "cakes", labelKey: "shop.cat.cakes" },
  { slug: "chocolate", labelKey: "shop.cat.chocolate" },
  { slug: "bundles", labelKey: "shop.cat.bundles" },
  { slug: "gift-baskets", labelKey: "shop.cat.baskets" },
];

const OCCASIONS = [
  { slug: "birthday", labelKey: "shop.occ.birthday" },
  { slug: "love-romance", labelKey: "shop.occ.loveRomance" },
  { slug: "housewarming", labelKey: "shop.occ.housewarming" },
  { slug: "anniversary", labelKey: "shop.occ.anniversary" },
  { slug: "new-job", labelKey: "shop.occ.newJob" },
  { slug: "promotion", labelKey: "shop.occ.promotion" },
  { slug: "graduation", labelKey: "shop.occ.graduation" },
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
  { slug: "get-well-soon", labelKey: "shop.occ.getWellSoon" },
  { slug: "new-born", labelKey: "shop.occ.newborn" },
  { slug: "eid", labelKey: "shop.occ.eid" },
  { slug: "ramadan", labelKey: "shop.occ.ramadan" },
  { slug: "wedding", labelKey: "shop.occ.wedding" },
  { slug: "thinking-of-you", labelKey: "shop.occ.thinkingOfYou" },
  { slug: "farewell", labelKey: "shop.occ.farewell" },
  { slug: "condolences", labelKey: "shop.occ.condolences" },
  { slug: "colleague", labelKey: "shop.occ.colleague" },
  { slug: "friend", labelKey: "shop.occ.friend" },
  { slug: "im-sorry", labelKey: "shop.occ.imSorry" },
  { slug: "children", labelKey: "shop.occ.children" },
  { slug: "valentines-day", labelKey: "shop.occ.valentine" },
  { slug: "mothers-day", labelKey: "shop.occ.mothersDay" },
  { slug: "womens-day", labelKey: "shop.occ.womensDay" },
  { slug: "fathers-day", labelKey: "shop.occ.fathersDay" },
  { slug: "christmas", labelKey: "shop.occ.christmas" },
  { slug: "katb-kitab", labelKey: "shop.occ.katbKitab" },
];

// Possessive occasion slugs lose their apostrophe when split on hyphens.
// Override the known cases so the fallback heading is grammatically correct.
const POSSESSIVE_SLUG_OVERRIDES: Record<string, string> = {
  "mothers-day": "Mother's Day",
  "fathers-day": "Father's Day",
  "valentines-day": "Valentine's Day",
  "womens-day": "Women's Day",
  "st-patricks-day": "St. Patrick's Day",
};
const slugToTitle = (slug: string) =>
  POSSESSIVE_SLUG_OVERRIDES[slug] ??
  slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const USD_BUCKET_THRESHOLDS = [50, 100, 200] as const;

export default function Shop() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const { t, language, cityName, countryName } = useLocale();
  const { currencyCode } = useDisplayCurrency();
  const { data: fxData } = useFxRates();

  // Exchange rate for the active display currency (1 for USD or when unavailable).
  const currencyRate = useMemo(() => {
    if (currencyCode === "USD") return 1;
    const r = Number(((fxData?.rates ?? {}) as Record<string, number>)[currencyCode] ?? 0);
    return r > 0 ? r : 1;
  }, [currencyCode, fxData]);

  // Converted thresholds using roundToNearestFive — must match what formatPrice() displays.
  const [cT50, cT100, cT200] = useMemo(
    () => USD_BUCKET_THRESHOLDS.map((usd) => roundToNearestFive(usd * currencyRate, currencyCode)),
    [currencyRate, currencyCode],
  );

  // Bucket definitions: stable key + rate-aware test + human-readable label.
  // Product rounding mirrors formatPrice() — roundToNearestFive keeps thresholds consistent.
  const convertedBucketDefs = useMemo(
    () => [
      {
        key: "under50" as PriceBucket,
        test: (p: Product) => roundToNearestFive(p.priceValue * currencyRate, currencyCode) < cT50,
        label: buildFeeNode(t("shop.filter.priceUnderAmount"), { amount: 50 }),
      },
      {
        key: "50to100" as PriceBucket,
        test: (p: Product) => { const cv = roundToNearestFive(p.priceValue * currencyRate, currencyCode); return cv >= cT50 && cv < cT100; },
        label: buildFeeNode(t("shop.filter.priceRange"), { from: 50, to: 100 }),
      },
      {
        key: "100to200" as PriceBucket,
        test: (p: Product) => { const cv = roundToNearestFive(p.priceValue * currencyRate, currencyCode); return cv >= cT100 && cv < cT200; },
        label: buildFeeNode(t("shop.filter.priceRange"), { from: 100, to: 200 }),
      },
      {
        key: "over200" as PriceBucket,
        test: (p: Product) => roundToNearestFive(p.priceValue * currencyRate, currencyCode) >= cT200,
        label: buildFeeNode(t("shop.filter.priceOverAmount"), { amount: 200 }),
      },
    ],
    [currencyRate, currencyCode, cT50, cT100, cT200, t],
  );
  const [location, navigate] = useLocation();
  const params = useParams<{ slug?: string }>();

  // Detect whether we're on a /occasion/:slug or /category/:slug path
  const isOccasionRoute = location.match(/^\/occasion\//) !== null;
  const isCategoryRoute = location.match(/^\/category\//) !== null;

  // Legacy query-param values (only present on old /shop?occasion= / /shop?category= URLs)
  const categoryFromSearch = !isCategoryRoute && !isOccasionRoute ? (searchParams.get("category") || "") : "";
  const occasionFromSearch = !isCategoryRoute && !isOccasionRoute ? (searchParams.get("occasion") || "") : "";
  const brand = searchParams.get("brand") || "";

  // Redirect legacy query-param URLs to the new clean paths (client-side, replace history)
  useEffect(() => {
    if (occasionFromSearch) {
      const target = brand
        ? `/occasion/${occasionFromSearch}?brand=${encodeURIComponent(brand)}`
        : `/occasion/${occasionFromSearch}`;
      navigate(target, { replace: true });
    } else if (categoryFromSearch) {
      navigate(`/category/${categoryFromSearch}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect old /occasion/newborn to the canonical /occasion/new-born
  const occasion = isOccasionRoute ? (params.slug ?? "") : occasionFromSearch;
  useEffect(() => {
    if (occasion === "newborn") {
      // searchString from useSearch() already includes the leading "?" when
      // query params are present, so append it directly (no extra "?").
      navigate(`/occasion/new-born${searchString}`, { replace: true });
    } else if (occasion === "valentine") {
      navigate(`/occasion/valentines-day${searchString}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasion]);

  const category = isCategoryRoute ? (params.slug ?? "") : categoryFromSearch;

  const { countryCode, cityId, country, city, openPicker } = useLocationSelection();
  const citySlug = city?.id ?? null;
  const { data: occasionsApiData } = useCatalogOccasions(countryCode, citySlug);

  // Contextual description: only on category / occasion pages
  const pageDescriptionType: "category" | "occasion" | null = isCategoryRoute
    ? "category"
    : isOccasionRoute
      ? "occasion"
      : null;
  const pageDescriptionSlug = isCategoryRoute
    ? (params.slug ?? null)
    : isOccasionRoute
      ? (params.slug ?? null)
      : null;
  const {
    data: pageDescriptionData,
    isError: pageDescriptionError,
  } = usePageDescription(
    pageDescriptionType,
    pageDescriptionSlug,
    cityId ?? null,
    language,
  );

  const queryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) queryParams.countryCode = countryCode;
  if (cityId) queryParams.cityId = cityId;

  const allProducts = useProducts(queryParams, !category && !occasion && !brand);
  const categoryProducts = useCategoryProducts(category, queryParams);
  const occasionProducts = useOccasionProducts(occasion, queryParams);
  const brandProducts = useBrandProducts(brand, queryParams);

  const isLoading = category
    ? categoryProducts.isLoading
    : occasion
      ? occasionProducts.isLoading || (!!brand && brandProducts.isLoading)
      : brand
        ? brandProducts.isLoading
        : allProducts.isLoading;

  const sourceProducts: Product[] = useMemo(() => {
    const visible = (list: Product[]) => list.filter((p) => p.inStock && !!p.image);
    if (category) return visible(categoryProducts.data?.products ?? []);
    if (occasion) {
      const groups = occasionProducts.data?.groups ?? [];
      const seen = new Set<string>();
      const flat: Product[] = [];
      for (const g of groups) {
        for (const p of g.products) {
          if (!p.inStock || !p.image) continue;
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          flat.push(p);
        }
      }
      if (brand && brandProducts.data) {
        const brandSet = new Set(brandProducts.data.products.map((p) => p.id));
        return flat.filter((p) => brandSet.has(p.id));
      }
      return flat;
    }
    if (brand) return visible(brandProducts.data?.products ?? []);
    return visible(allProducts.data?.products ?? []);
  }, [category, occasion, brand, categoryProducts.data, occasionProducts.data, allProducts.data, brandProducts.data]);

  const fallbackPool = useProducts(queryParams, true);
  const popularPicks: Product[] = useMemo(() => {
    const all = fallbackPool.data?.products ?? [];
    const filtered = category ? all.filter((p) => p.category !== category) : all;
    return [...filtered]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 6);
  }, [fallbackPool.data, category]);

  const rawRecipientKey = searchParams.get("for") || "all";
  const recipientKey = VALID_BIRTHDAY_RECIPIENT_KEYS.has(rawRecipientKey) ? rawRecipientKey : "all";

  const prevRecipientKeyRef = useRef<string>(recipientKey);
  const birthdayFilterViewedRef = useRef(false);

  useEffect(() => {
    if (occasion !== "birthday") return;
    if (birthdayFilterViewedRef.current) return;
    birthdayFilterViewedRef.current = true;
    trackEvent({ name: "birthday_recipient_filter_viewed" });
  }, [occasion]);

  function handleRecipientSelect(key: string) {
    const prev = prevRecipientKeyRef.current;
    if (key === prev) return;
    prevRecipientKeyRef.current = key;

    if (occasion === "birthday") {
      const nextFiltered = applyRecipientFilter(sourceProducts, key);
      const count = nextFiltered.length;
      const locale = language;
      const country = countryCode ?? undefined;

      if (key === "all" && prev !== "all") {
        trackEvent({ name: "birthday_recipient_cleared", recipientKey: prev, productCount: count, locale, country });
      } else if (prev === "all" && key !== "all") {
        trackEvent({ name: "birthday_recipient_selected", recipientKey: key, productCount: count, locale, country });
      } else if (prev !== "all" && key !== "all") {
        trackEvent({ name: "birthday_recipient_changed", previousRecipientKey: prev, recipientKey: key, productCount: count, locale, country });
      }
    }

    const params = new URLSearchParams(searchString);
    if (key === "all") {
      params.delete("for");
    } else {
      params.set("for", key);
    }
    const qs = params.toString();
    navigate(location + (qs ? `?${qs}` : ""), { replace: true });
  }

  const rawAnniversaryGenderKey = searchParams.get("gender") || "all";
  const anniversaryGenderKey = occasion === "anniversary" && VALID_ANNIVERSARY_GENDER_KEYS.has(rawAnniversaryGenderKey)
    ? rawAnniversaryGenderKey
    : "all";

  function handleAnniversaryGenderSelect(key: string) {
    const params = new URLSearchParams(searchString);
    if (key === "all") {
      params.delete("gender");
    } else {
      params.set("gender", key);
    }
    const qs = params.toString();
    navigate(location + (qs ? `?${qs}` : ""), { replace: true });
  }

  const loveRomanceGenderKey = occasion === "love-romance" && VALID_LOVE_ROMANCE_GENDER_KEYS.has(rawAnniversaryGenderKey)
    ? rawAnniversaryGenderKey
    : "all";

  function handleLoveRomanceGenderSelect(key: string) {
    const params = new URLSearchParams(searchString);
    if (key === "all") {
      params.delete("gender");
    } else {
      params.set("gender", key);
    }
    const qs = params.toString();
    navigate(location + (qs ? `?${qs}` : ""), { replace: true });
  }

  const isNewborn = occasion === NEW_BORN_OCCASION_SLUG;
  const rawNewbornGenderKey = searchParams.get("gender") || "all";
  const newbornGenderKey = isNewborn && VALID_NEWBORN_GENDER_KEYS.has(rawNewbornGenderKey)
    ? rawNewbornGenderKey
    : "all";

  function handleNewbornGenderSelect(key: string) {
    const params = new URLSearchParams(searchString);
    if (key === "all") {
      params.delete("gender");
    } else {
      params.set("gender", key);
    }
    const qs = params.toString();
    navigate(location + (qs ? `?${qs}` : ""), { replace: true });
  }

  const newbornGenderMap = useNewbornGenderMap(isNewborn);

  const isStuffedAnimals = category === STUFFED_ANIMALS_SLUG;
  const rawBearSizeKey = searchParams.get("size") || "all";
  const bearSizeKey = isStuffedAnimals && VALID_BEAR_SIZE_KEYS.has(rawBearSizeKey) ? rawBearSizeKey : "all";

  const bearSizeMap = useBearSizeMap(isStuffedAnimals);

  const isPlants = category === PLANTS_SLUG;
  const { classificationMap: plantClassificationMap, isLoading: plantClassificationsLoading } =
    usePlantClassificationMap(isPlants);

  function handleBearSizeSelect(key: string) {
    const params = new URLSearchParams(searchString);
    if (key === "all") {
      params.delete("size");
    } else {
      params.set("size", key);
    }
    const qs = params.toString();
    navigate(location + (qs ? `?${qs}` : ""), { replace: true });
  }

  const [sort, setSort] = useState("recommended");
  const [selectedPriceBucket, setSelectedPriceBucket] = useState<PriceBucket | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const recipientFilteredProducts: Product[] = useMemo(() => {
    if (occasion !== "birthday") return sourceProducts;
    return applyRecipientFilter(sourceProducts, recipientKey);
  }, [sourceProducts, occasion, recipientKey]);

  const anniversaryGenderFilteredProducts: Product[] = useMemo(() => {
    if (occasion !== "anniversary") return recipientFilteredProducts;
    return applyAnniversaryGenderFilter(recipientFilteredProducts, anniversaryGenderKey);
  }, [recipientFilteredProducts, occasion, anniversaryGenderKey]);

  const loveRomanceGenderFilteredProducts: Product[] = useMemo(() => {
    if (occasion !== "love-romance") return anniversaryGenderFilteredProducts;
    return applyLoveRomanceGenderFilter(anniversaryGenderFilteredProducts, loveRomanceGenderKey);
  }, [anniversaryGenderFilteredProducts, occasion, loveRomanceGenderKey]);

  const newbornGenderFilteredProducts: Product[] = useMemo(() => {
    if (!isNewborn) return loveRomanceGenderFilteredProducts;
    return applyNewbornGenderFilter(loveRomanceGenderFilteredProducts, newbornGenderKey, newbornGenderMap);
  }, [loveRomanceGenderFilteredProducts, isNewborn, newbornGenderKey, newbornGenderMap]);

  const bearSizeFilteredProducts: Product[] = useMemo(() => {
    if (!isStuffedAnimals) return newbornGenderFilteredProducts;
    return applyBearSizeFilter(newbornGenderFilteredProducts, bearSizeMap, bearSizeKey);
  }, [newbornGenderFilteredProducts, isStuffedAnimals, bearSizeMap, bearSizeKey]);

  const priceBuckets: PriceBucketDef[] = useMemo(() => {
    return convertedBucketDefs.map((def) => ({
      key: def.key,
      label: def.label,
      count: bearSizeFilteredProducts.filter((p) => def.test(p)).length,
    })).filter((b) => b.count > 0);
  }, [bearSizeFilteredProducts, convertedBucketDefs]);

  // Identify products that did not match any keyword so we can ask the AI
  const unmatchedProducts = useMemo(() => {
    return bearSizeFilteredProducts
      .filter((p) => extractColor(p.name) === null)
      .map((p) => ({ slug: p.id, name: p.name }));
  }, [bearSizeFilteredProducts]);

  // AI-inferred color hints for unmatched products (loads asynchronously, does
  // not block rendering — color facets update once the response arrives)
  const aiColorHints = useProductColorHints(unmatchedProducts);

  // Merged color resolver: keyword match first, AI hint as fallback
  const resolveColor = (p: Product) => extractColor(p.name) ?? (aiColorHints[p.id] ?? null);

  const colorFacets: ColorFacet[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of bearSizeFilteredProducts) {
      const c = resolveColor(p);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => ({ color: color as ColorFacet["color"], count }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearSizeFilteredProducts, aiColorHints]);

  // Optional ?maxUsd= cap (campaign landing "Shop Under …" links). Filters on
  // the USD list price; the amount shown to the shopper is the converted value.
  const maxUsdParam = useMemo(() => {
    const raw = Number(searchParams.get("maxUsd"));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const filteredProducts: Product[] = useMemo(() => {
    const bucketTest = selectedPriceBucket
      ? convertedBucketDefs.find((d) => d.key === selectedPriceBucket)?.test ?? null
      : null;
    return bearSizeFilteredProducts.filter((p) => {
      if (maxUsdParam != null && p.priceValue > maxUsdParam) return false;
      if (bucketTest && !bucketTest(p)) return false;
      if (selectedColors.length > 0) {
        const c = resolveColor(p);
        if (!c || !selectedColors.includes(c)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearSizeFilteredProducts, selectedPriceBucket, selectedColors, aiColorHints, convertedBucketDefs, maxUsdParam]);

  const products = useMemo(() => {
    const p = [...filteredProducts];
    if (sort === "recommended") {
      const salesArr = p.map((x) => x.popularity ?? 0);
      const maxSales = Math.max(0, ...salesArr);
      const C = Math.max(1, maxSales * 0.1);
      const ids = p.map((x) => (typeof x.osNumericId === "number" ? x.osNumericId : 0));
      const minId = Math.min(0, ...ids);
      const maxId = Math.max(0, ...ids);
      p.sort((a, b) => {
        const scoreOf = (x: (typeof p)[0]) => {
          const s = x.popularity ?? 0;
          const popScore = (s / (s + C)) * 100;
          const id = typeof x.osNumericId === "number" ? x.osNumericId : 0;
          const freshScore = maxId > minId ? ((id - minId) / (maxId - minId)) * 100 : 50;
          const featScore = x.tag === "Featured" ? 100 : 0;
          return 0.5 * popScore + 0.3 * freshScore + 0.2 * featScore;
        };
        return scoreOf(b) - scoreOf(a);
      });
    } else if (sort === "best-seller") {
      p.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (sort === "newest") {
      p.sort((a, b) => {
        const aId = typeof a.osNumericId === "number" ? a.osNumericId : 0;
        const bId = typeof b.osNumericId === "number" ? b.osNumericId : 0;
        return bId - aId;
      });
    } else if (sort === "price-asc") {
      p.sort((a, b) => a.priceValue - b.priceValue);
    } else if (sort === "price-desc") {
      p.sort((a, b) => b.priceValue - a.priceValue);
    }
    return p;
  }, [filteredProducts, sort]);

  const hasActiveFilters = selectedPriceBucket !== null || selectedColors.length > 0;

  function handleClearFilters() {
    setSelectedPriceBucket(null);
    setSelectedColors([]);
  }

  function handleColorToggle(color: string) {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color],
    );
  }

  const { data: catalogMetadata } = useCatalogMetadata(countryCode, language);

  // Category navigation must reflect real per-country inventory. The catalog
  // metadata endpoint is country-scoped and excludes zero-count categories
  // server-side, so build the nav from it instead of the static CATEGORIES
  // list (which 404'd for e.g. Cyprus, where most categories have no stock).
  const visibleCategories = useMemo(() => {
    const metaCats = catalogMetadata?.categories;
    if (!metaCats) {
      // Metadata still loading (or failed) — render no category links rather
      // than the static list, which could link to zero-inventory 404 pages.
      return [] as { slug: string; labelKey: string | null; name: string | null }[];
    }
    const available = new Map(metaCats.map((c) => [c.id, c]));
    const known = CATEGORIES.filter((c) => (available.get(c.slug)?.count ?? 0) > 0).map((c) => ({
      slug: c.slug,
      labelKey: c.labelKey as string | null,
      name: null as string | null,
    }));
    const staticSlugs = new Set(CATEGORIES.map((c) => c.slug));
    const extras = metaCats
      .filter((c) => !staticSlugs.has(c.id) && c.count > 0)
      .map((c) => ({ slug: c.id, labelKey: null as string | null, name: c.name }));
    return [...known, ...extras];
  }, [catalogMetadata]);
  const catalogCategory = category
    ? catalogMetadata?.categories.find((c) => c.id === category)
    : undefined;
  const catalogOccasion = occasion
    ? catalogMetadata?.occasions.find((o) => o.id === occasion || o.id === occasion.replace(/-/g, ""))
    : undefined;

  const categoryLabelKey = CATEGORIES.find((c) => c.slug === category)?.labelKey;
  const occasionLabelKey = OCCASIONS.find((o) => o.slug === occasion)?.labelKey;


  const entityName = category
    ? (categoryLabelKey ? t(categoryLabelKey, {}) : undefined) || catalogCategory?.name || ""
    : occasion
      ? (occasionLabelKey ? t(occasionLabelKey, {}) : undefined) || catalogOccasion?.name || slugToTitle(occasion)
      : "";

  // Curated per-occasion SEO content (Dubai EN pages for now). When present
  // it overrides the template title/description, provides the visible H1 and
  // intro, and renders dedicated content sections + FAQs below the grid —
  // mirroring what the server prerender emits for crawlers.
  const curatedSeo = useMemo(
    () =>
      occasion
        ? getOccasionSeoContent({
            country: countryCode?.toLowerCase() ?? null,
            // city.id is the delivery API id ("ae-dubai"); curated content
            // is keyed by URL slug ("dubai").
            city: citySlug ? cityIdToSlug(citySlug) : null,
            slug: occasion,
            lang: language,
          })
        : null,
    [occasion, countryCode, citySlug, language],
  );

  // Curated per-category SEO content (Beirut/cakes EN page for now).
  // Same pattern as curatedSeo above — overrides title/meta/H1/intro and
  // renders hand-written sections + FAQs, matching the server prerender.
  const curatedCategorySeo = useMemo(
    () =>
      category
        ? getCategorySeoContent({
            country: countryCode?.toLowerCase() ?? null,
            city: citySlug ? cityIdToSlug(citySlug) : null,
            slug: category,
            lang: language,
          })
        : null,
    [category, countryCode, citySlug, language],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isCategoryRoute && !isOccasionRoute) return;
    if (!entityName) return;
    // Guard: if a city/country ID is selected but the resolved object isn't
    // available yet (delivery-locations query re-fetching after a city switch),
    // skip this render to avoid writing a title with a blank city label.
    if (cityId && !city) return;
    if (countryCode && !country) return;
    const head = document.head;
    const cityLabel = city ? cityName(city.id, city.name) : "";
    const countryLabel = country ? countryName(country.code, country.name) : "";
    const seo = isCategoryRoute
      ? buildCategorySeo({ lang: language, categoryName: entityName, city: cityLabel, country: countryLabel })
      : buildOccasionSeo({ lang: language, occasionName: entityName, city: cityLabel, country: countryLabel });
    // Curated occasion/category pages have hand-written title/meta copy that
    // must match what the server prerender emits for crawlers.
    const activeCurated = curatedSeo ?? curatedCategorySeo;
    const effTitle = activeCurated?.title ?? seo.title;
    const effDescription = activeCurated?.metaDescription ?? seo.description;
    document.title = effTitle;
    head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    setMeta('meta[name="description"]', { name: "description", content: effDescription }, head);
    setMeta('meta[property="og:title"]', { property: "og:title", content: activeCurated?.title ?? seo.ogTitle }, head);
    setMeta('meta[property="og:description"]', { property: "og:description", content: activeCurated?.metaDescription ?? seo.ogDescription }, head);
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: activeCurated?.title ?? seo.twitterTitle }, head);
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: activeCurated?.metaDescription ?? seo.twitterDescription }, head);
    return () => {
      head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    };
  }, [entityName, isCategoryRoute, isOccasionRoute, city, country, language, cityName, countryName, curatedSeo, curatedCategorySeo]); // eslint-disable-line react-hooks/exhaustive-deps

  const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const pageTitle = category
    ? capitalizeFirst((categoryLabelKey ? t(categoryLabelKey, {}) : undefined)
      || catalogCategory?.name
      || category)
    : occasion
      ? capitalizeFirst((occasionLabelKey ? t(occasionLabelKey, {}) : undefined)
        || catalogOccasion?.name
        || slugToTitle(occasion))
      : brand
        ? (brandProducts.data?.brandName ?? brand)
        : t("shop.allCollection");

  const brandDisplayName = brandProducts.data?.brandName ?? brand;

  const birthdayContextTitle = useMemo(() => {
    if (occasion !== "birthday" || recipientKey === "all") return null;
    const recipient = BIRTHDAY_RECIPIENTS.find((r) => r.key === recipientKey);
    if (!recipient) return null;
    return t("shop.birthdayFor.contextHeading", { recipient: t(recipient.labelKey) });
  }, [occasion, recipientKey, t]);
  const clearBrandHref = occasion
    ? `/occasion/${occasion}`
    : category
      ? `/category/${category}`
      : "/shop";

  const breadcrumbCrumbs = useMemo((): Crumb[] => {
    const home: Crumb = { label: t("nav.home"), href: "/" };
    if (!category && !occasion && !brand) return [home, { label: t("shop.allCollection") }];
    if (category) {
      const label = capitalizeFirst(
        (categoryLabelKey ? t(categoryLabelKey, {}) : undefined) ||
        catalogCategory?.name ||
        category
      );
      return [home, { label }];
    }
    if (occasion) {
      const label = capitalizeFirst(
        (occasionLabelKey ? t(occasionLabelKey, {}) : undefined) ||
        catalogOccasion?.name ||
        slugToTitle(occasion)
      );
      return [home, { label }];
    }
    return [home, { label: brandDisplayName }];
  }, [category, occasion, brand, t, catalogCategory, catalogOccasion, brandDisplayName, categoryLabelKey, occasionLabelKey]);

  const shopFiltersProps = {
    priceBuckets,
    colorFacets,
    selectedPriceBucket,
    selectedColors,
    onPriceBucketChange: setSelectedPriceBucket,
    onColorToggle: handleColorToggle,
    onClear: handleClearFilters,
    hasActiveFilters,
  };

  useLcpImagePreload(products[0]?.image?.uri ?? null);

  return (
    <div className="min-h-screen pt-1 md:pt-6 bg-white">
      {/* Breadcrumb row — always renders on occasion/category routes to reserve vertical space */}
      {(isOccasionRoute || isCategoryRoute) ? (
        <div className="container mx-auto max-w-content px-page pt-1 md:pt-4 min-h-[1.5rem]">
          <PageBreadcrumb crumbs={breadcrumbCrumbs} />
        </div>
      ) : breadcrumbCrumbs.length > 0 ? (
        <div className="container mx-auto max-w-content px-page pt-1 md:pt-4">
          <PageBreadcrumb crumbs={breadcrumbCrumbs} />
        </div>
      ) : null}


      <div className={`container mx-auto max-w-content px-page${(breadcrumbCrumbs.length > 0 || isOccasionRoute || isCategoryRoute) ? " pt-1.5 md:pt-4" : ""}`}>
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-3 md:gap-6 mb-2 pb-0 md:mb-4 md:pb-2">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif" data-testid="text-shop-title">
              {birthdayContextTitle ?? curatedSeo?.h1 ?? curatedCategorySeo?.h1 ?? pageTitle}
              {isLoading ? (
                <span className="hidden md:inline ml-4 align-middle">
                  <Skeleton className="inline-block h-4 w-16 rounded" />
                </span>
              ) : (
                <span className="hidden md:inline text-muted-foreground font-sans text-base md:text-lg font-normal">
                  {" "}<span className="mx-2 opacity-40">/</span>{t("shop.productCount", { count: String(products.length) })}
                </span>
              )}
            </h1>
            {isLoading ? (
              <p className="md:hidden mt-1">
                <Skeleton className="h-3.5 w-20 rounded" />
              </p>
            ) : (
              <p className="md:hidden text-sm text-muted-foreground font-normal mt-0.5 whitespace-nowrap">
                {t("shop.productCount", { count: String(products.length) })}
              </p>
            )}
          </div>
          <div className="hidden md:flex items-center gap-4 w-full md:w-auto">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[210px] bg-background" data-testid="select-sort" aria-label={t("shop.sortPlaceholder")}>
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("shop.sortPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">{t("shop.sort.recommended")}</SelectItem>
                <SelectItem value="best-seller">{t("shop.sort.bestSeller")}</SelectItem>
                <SelectItem value="newest">{t("shop.sort.newest")}</SelectItem>
                <SelectItem value="price-asc">{t("shop.sort.priceAsc")}</SelectItem>
                <SelectItem value="price-desc">{t("shop.sort.priceDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Contextual description — server returns AI-generated copy or a
            deterministic fallback. Show nothing while loading; on error
            build a rich client-side description from the loaded products. */}
        {(curatedSeo ?? curatedCategorySeo) ? (
          <p className="text-[13px] leading-snug md:text-sm md:leading-normal font-medium text-muted-foreground max-w-[600px] mb-3 md:mb-4 -mt-1"> {/* i18n-ignore — curated EN-only SEO copy */}
            {(curatedSeo ?? curatedCategorySeo)!.intro}
          </p>
        ) : (pageDescriptionData?.description || pageDescriptionError) && pageDescriptionType && pageDescriptionSlug && (
          <p className="text-[13px] leading-snug md:text-sm md:leading-normal font-medium text-muted-foreground max-w-[600px] mb-3 md:mb-4 -mt-1"> {/* i18n-ignore */}
            {pageDescriptionData?.description
              ?? buildRichClientDescription(
                  pageDescriptionType,
                  pageDescriptionSlug,
                  pageTitle ?? pageDescriptionSlug,
                  sourceProducts,
                  city?.name ?? "",
                  city?.expressAvailable ?? true,
                )}
          </p>
        )}

        {occasion === "birthday" && (
          <div className="mt-4">
            <BirthdayRecipientTabs activeKey={recipientKey} onSelect={handleRecipientSelect} />
          </div>
        )}

        {occasion === "anniversary" && (
          <AnniversaryGenderTabs activeKey={anniversaryGenderKey} onSelect={handleAnniversaryGenderSelect} />
        )}

        {occasion === "love-romance" && (
          <LoveRomanceGenderTabs activeKey={loveRomanceGenderKey} onSelect={handleLoveRomanceGenderSelect} />
        )}

        {isNewborn && (
          <NewbornGenderTabs activeKey={newbornGenderKey} onSelect={handleNewbornGenderSelect} />
        )}

        {isStuffedAnimals && (
          <BearSizeTabs
            activeKey={bearSizeKey}
            onSelect={handleBearSizeSelect}
            sizeMap={bearSizeMap}
            products={recipientFilteredProducts}
          />
        )}

        <div className="block md:hidden w-full mb-4">
          <Button
            variant="outline"
            className="relative w-full h-11 border-primary text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => setMobileFiltersOpen(true)}
            data-testid="button-mobile-filters"
          >
            <Filter className="w-4 h-4 mr-2" />
            {t("shop.filterAndSort")}
            {(hasActiveFilters || sort !== "recommended") && (
              <span className="absolute -top-1.5 right-3 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                {(selectedPriceBucket ? 1 : 0) + selectedColors.length + (sort !== "recommended" ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="hidden md:block w-64 shrink-0 space-y-8">
            <div>
              <h2 className="font-serif text-lg mb-4">{t("shop.categoriesTitle")}</h2>
              <ul className="space-y-3">
                {visibleCategories.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/category/${c.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${category === c.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-category-${c.slug}`}
                    >
                      {c.labelKey ? t(c.labelKey) : c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-serif text-lg mb-4">{t("shop.occasionsTitle")}</h2>
              <ul className="space-y-3">
                {(occasionsApiData
                  ? occasionsApiData.occasions.filter((o) => (o.count ?? 0) > 0)
                  : OCCASIONS.map((o) => ({ slug: o.slug, name: t(o.labelKey), count: 1, image: null }))
                ).map((o) => {
                  const staticEntry = OCCASIONS.find((s) => s.slug === o.slug);
                  const label = staticEntry ? t(staticEntry.labelKey) : o.name;
                  return (
                    <li key={o.slug}>
                      <Link
                        href={`/occasion/${o.slug}`}
                        className={`text-sm hover:text-primary transition-colors ${occasion === o.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                        data-testid={`link-occasion-${o.slug}`}
                        onClick={() => setOccasionRef(o.slug)}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <ShopFilters {...shopFiltersProps} />

            {(category || occasion || brand) && (
              <Link href="/shop" className="text-sm font-medium text-primary hover:underline" data-testid="link-clear-filters">
                {t("shop.clearAll")}
              </Link>
            )}
          </div>

          <div className="flex-1">
            <h2 className="sr-only">{t("shop.productsHeading")}</h2>
            {(brand || hasActiveFilters) && (
              <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="active-filter-chips">
                {brand && (
                  <Link
                    href={clearBrandHref}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    aria-label={t("shop.removeBrandFilter")}
                    data-testid="chip-brand-filter"
                  >
                    {brandDisplayName}
                    <X className="w-3 h-3" />
                  </Link>
                )}
                {selectedPriceBucket && (
                  <button
                    type="button"
                    onClick={() => setSelectedPriceBucket(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    data-testid="chip-price-filter"
                  >
                    {selectedPriceBucket ? (convertedBucketDefs.find((d) => d.key === selectedPriceBucket)?.label ?? "") : ""}
                    <X className="w-3 h-3" />
                  </button>
                )}
                {selectedColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorToggle(color)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    data-testid={`chip-color-${color}`}
                  >
                    {t(`shop.color.${color}`)}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-7 md:gap-y-10">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-[4/5] rounded-2xl" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              (category || occasion || brand || hasActiveFilters) ? (
                <div data-testid="empty-state-sold-out">
                  <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed">
                    <h3 className="font-serif text-2xl mb-3">{t("shop.empty.titleSoldOut")}</h3>
                    <p className="text-muted-foreground mb-6 max-w-xl mx-auto px-4">
                      {t("shop.empty.descSoldOut")}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {hasActiveFilters && (
                        <Button variant="outline" onClick={handleClearFilters} data-testid="button-clear-price-color">
                          {t("shop.filter.clearFilters")}
                        </Button>
                      )}
                      <Button asChild variant={hasActiveFilters ? "ghost" : "outline"} data-testid="button-browse-all">
                        <Link href="/shop">{t("shop.browseAll")}</Link>
                      </Button>
                    </div>
                  </div>
                  {!hasActiveFilters && popularPicks.length > 0 ? (
                    <div className="mt-12">
                      <p className="text-xs tracking-[0.25em] uppercase text-primary text-center mb-6">
                        {t("shop.popularPicks")}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-7 md:gap-y-10">
                        {popularPicks.map((product, i) => (
                          <ProductCard key={product.id} product={product} index={i} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-24 bg-muted/30 rounded-2xl border border-dashed" data-testid="empty-state-no-products">
                  {country ? (
                    <>
                      <MapPin className="w-8 h-8 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="font-serif text-2xl mb-3">{t("shop.empty.titleCountry", { country: country.name })}</h3>
                      <p className="text-muted-foreground mb-6">
                        {t("shop.empty.descCountry", { country: country.name })}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <Button variant="outline" onClick={() => openPicker()} data-testid="button-change-country">
                          {t("shop.empty.changeCountry")}
                        </Button>
                        {(category || occasion || brand) && (
                          <Button asChild variant="ghost" data-testid="button-clear-filters">
                            <Link href="/shop">{t("shop.clearFiltersBtn")}</Link>
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="font-serif text-2xl mb-3">{t("shop.empty.titleNoCountry")}</h3>
                      <p className="text-muted-foreground mb-6">{t("shop.empty.descNoCountry")}</p>
                      <Button asChild variant="outline" data-testid="button-clear-filters">
                        <Link href="/shop">{t("shop.clearFiltersBtnCap")}</Link>
                      </Button>
                    </>
                  )}
                </div>
              )
            ) : isPlants ? (() => {
              // For the plants category: partition products into indoor/outdoor sections.
              // When classifications are still loading, show all products under "Indoor Plants"
              // as a graceful fallback so the page is never blank.
              const indoorProducts = plantClassificationsLoading
                ? products
                : products.filter(
                    (p) =>
                      (plantClassificationMap[String(p.osNumericId ?? p.id)] ?? "indoor") ===
                      "indoor",
                  );
              const outdoorProducts = plantClassificationsLoading
                ? []
                : products.filter(
                    (p) => plantClassificationMap[String(p.osNumericId ?? p.id)] === "outdoor",
                  );
              return (
                <div className="space-y-10">
                  {indoorProducts.length > 0 && (
                    <section>
                      <h2 className="font-serif text-2xl mb-6">{t("shop.plants.indoorSection")}</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-7 md:gap-y-10">
                        {indoorProducts.map((product, i) => (
                          <ProductCard key={product.id} product={product} index={i} />
                        ))}
                      </div>
                    </section>
                  )}
                  {outdoorProducts.length > 0 && (
                    <section>
                      <h2 className="font-serif text-2xl mb-6">{t("shop.plants.outdoorSection")}</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-7 md:gap-y-10">
                        {outdoorProducts.map((product, i) => (
                          <ProductCard key={product.id} product={product} index={i} />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              );
            })() : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-7 md:gap-y-10">
                {products.map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {(() => {
        const cityLabel = city ? cityName(city.id, city.name) : "";
        const availableCategoryIds = catalogMetadata?.categories.map((c) => c.id) ?? [];
        const availableOccasionIds = catalogMetadata?.occasions.map((o) => o.id) ?? [];
        // Curated occasion/category pages render hand-written sections + FAQs
        // (the same copy the server prerender emits, so structured data always
        // matches visible content) instead of the template SEO section.
        const activeCuratedContent = (occasion && curatedSeo) ? curatedSeo
          : (category && curatedCategorySeo) ? curatedCategorySeo
          : null;
        if (activeCuratedContent) {
          return (
            <section className="container mx-auto max-w-content px-page py-12 space-y-10">
              {activeCuratedContent.sections.map((s) => (
                <div key={s.heading} className="max-w-[720px]">
                  <h2 className="text-2xl font-serif mb-3">{s.heading}</h2> {/* i18n-ignore — curated EN-only SEO copy */}
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p> {/* i18n-ignore */}
                  {s.links && s.links.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                      {s.links.map((l) => (
                        <li key={l.href}>
                          <a href={l.href} className="text-sm underline underline-offset-4 text-foreground/80 hover:text-foreground">
                            {l.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="max-w-[720px]">
                <h2 className="text-2xl font-serif mb-4">{t("seo.content.faqTitle")}</h2>
                <div className="space-y-5">
                  {activeCuratedContent.faqs.map((f) => (
                    <div key={f.q}>
                      <h3 className="text-base font-medium mb-1">{f.q}</h3> {/* i18n-ignore — curated EN-only SEO copy */}
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p> {/* i18n-ignore */}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        }
        if ((category || occasion) && products.length > 0) {
          const pageDescOverrides = pageDescriptionData?.internal_links
            ? { internal_links: pageDescriptionData.internal_links }
            : undefined;
          return (
            <SEOContentSection
              pageType={category ? "category" : "occasion"}
              entityName={entityName}
              entitySlug={category || occasion}
              cityLabel={cityLabel}
              lang={language}
              countryCode={countryCode ?? ""}
              availableCategoryIds={availableCategoryIds}
              availableOccasionIds={availableOccasionIds}
              overrides={pageDescOverrides}
              suppressFaqJsonLd
            />
          );
        }
        if (!category && !occasion && products.length > 0) {
          return (
            <SEOContentSection
              pageType="shop"
              cityLabel={cityLabel}
              lang={language}
              countryCode={countryCode ?? ""}
              suppressFaqJsonLd
            />
          );
        }
        return null;
      })()}

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0 rounded-t-2xl [&>button:first-child]:hidden">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="font-serif text-xl">{t("shop.filterAndSort")}</SheetTitle>
              <SheetClose asChild>
                <button
                  type="button"
                  className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                  aria-label="Close" // i18n-ignore
                >
                  <X className="h-5 w-5" />
                </button>
              </SheetClose>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div>
              <h3 className="font-serif text-lg mb-4">{t("shop.sort.title")}</h3>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: "recommended", label: t("shop.sort.recommended") },
                    { value: "best-seller", label: t("shop.sort.bestSeller") },
                    { value: "newest", label: t("shop.sort.newest") },
                    { value: "price-asc", label: t("shop.sort.priceAsc") },
                    { value: "price-desc", label: t("shop.sort.priceDesc") },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSort(value)}
                    className={`px-4 py-2 rounded-full border text-sm transition-colors ${
                      sort === value
                        ? "border-primary bg-primary text-primary-foreground font-medium"
                        : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                    data-testid={`sort-chip-${value}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <ShopFilters {...shopFiltersProps} />
          </div>
          <div className="shrink-0 px-6 py-4 border-t bg-background">
            <Button
              className="w-full"
              onClick={() => setMobileFiltersOpen(false)}
              data-testid="button-mobile-filters-apply"
            >
              {t("shop.filter.showResults", { count: String(products.length) })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

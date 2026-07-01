import { useProducts, useCategoryProducts, useOccasionProducts, useBrandProducts, useCatalogMetadata, useFxRates, type Product } from "@/lib/queries";
import { applyRecipientFilter } from "@/lib/birthdayRecipients";
import { applyAnniversaryGenderFilter } from "@/lib/anniversaryGender";
import { BirthdayRecipientTabs } from "@/components/BirthdayRecipientTabs";
import { AnniversaryGenderTabs } from "@/components/AnniversaryGenderTabs";
import { BearSizeTabs } from "@/components/BearSizeTabs";
import { VALID_BEAR_SIZE_KEYS, applyBearSizeFilter, useBearSizeMap } from "@/lib/bearSizes";
import { SEOContentSection } from "@/components/SEOContentSection";
import { ProductCard } from "@/components/ProductCard";
import { useSearch, useLocation, useParams, Link } from "wouter";
import { useEffect } from "react";
import { useLcpImagePreload } from "@/hooks/useLcpImagePreload";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Filter, MapPin, SlidersHorizontal, X } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { buildCategorySeo, buildOccasionSeo } from "@/lib/seo";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { ShopFilters, type PriceBucket, type PriceBucketDef, type ColorFacet } from "@/components/ShopFilters";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
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

const STUFFED_ANIMALS_SLUG = "stuffed-animals";

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
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
  { slug: "condolences", labelKey: "shop.occ.condolences" },
];

const USD_BUCKET_THRESHOLDS = [50, 100, 200] as const;

export default function Shop() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const { t, language, cityName, countryName } = useLocale();
  const { currencyCode, formatPrice } = useDisplayCurrency();
  const { data: fxData } = useFxRates();

  // Exchange rate for the active display currency (1 for USD or when unavailable).
  const currencyRate = useMemo(() => {
    if (currencyCode === "USD") return 1;
    const r = Number(((fxData?.rates ?? {}) as Record<string, number>)[currencyCode] ?? 0);
    return r > 0 ? r : 1;
  }, [currencyCode, fxData]);

  // Rounded converted thresholds — match what formatPrice() displays for these USD values.
  // Using Math.round because formatPriceInCurrency uses toFixed(0) which also rounds.
  const [cT50, cT100, cT200] = useMemo(
    () => USD_BUCKET_THRESHOLDS.map((usd) => Math.round(usd * currencyRate)),
    [currencyRate],
  );

  // Bucket definitions: stable key + rate-aware test + human-readable label.
  const convertedBucketDefs = useMemo(
    () => [
      {
        key: "under50" as PriceBucket,
        test: (p: Product) => Math.round(p.priceValue * currencyRate) < cT50,
        label: t("shop.filter.priceUnderAmount", { amount: formatPrice(50) }),
      },
      {
        key: "50to100" as PriceBucket,
        test: (p: Product) => { const cv = Math.round(p.priceValue * currencyRate); return cv >= cT50 && cv < cT100; },
        label: t("shop.filter.priceRange", { from: formatPrice(50), to: formatPrice(100) }),
      },
      {
        key: "100to200" as PriceBucket,
        test: (p: Product) => { const cv = Math.round(p.priceValue * currencyRate); return cv >= cT100 && cv < cT200; },
        label: t("shop.filter.priceRange", { from: formatPrice(100), to: formatPrice(200) }),
      },
      {
        key: "over200" as PriceBucket,
        test: (p: Product) => Math.round(p.priceValue * currencyRate) >= cT200,
        label: t("shop.filter.priceOverAmount", { amount: formatPrice(200) }),
      },
    ],
    [currencyRate, cT50, cT100, cT200, formatPrice, t],
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

  const category = isCategoryRoute ? (params.slug ?? "") : categoryFromSearch;
  const occasion = isOccasionRoute ? (params.slug ?? "") : occasionFromSearch;

  const { countryCode, cityId, country, city, openPicker } = useLocationSelection();
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
    if (category) return categoryProducts.data?.products ?? [];
    if (occasion) {
      const groups = occasionProducts.data?.groups ?? [];
      const seen = new Set<string>();
      const flat: Product[] = [];
      for (const g of groups) {
        for (const p of g.products) {
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
    if (brand) return brandProducts.data?.products ?? [];
    return allProducts.data?.products ?? [];
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

  function handleRecipientSelect(key: string) {
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

  const isStuffedAnimals = category === STUFFED_ANIMALS_SLUG;
  const rawBearSizeKey = searchParams.get("size") || "all";
  const bearSizeKey = isStuffedAnimals && VALID_BEAR_SIZE_KEYS.has(rawBearSizeKey) ? rawBearSizeKey : "all";

  const bearSizeMap = useBearSizeMap(isStuffedAnimals);

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

  const [sort, setSort] = useState("featured");
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

  const bearSizeFilteredProducts: Product[] = useMemo(() => {
    if (!isStuffedAnimals) return anniversaryGenderFilteredProducts;
    return applyBearSizeFilter(anniversaryGenderFilteredProducts, bearSizeMap, bearSizeKey);
  }, [anniversaryGenderFilteredProducts, isStuffedAnimals, bearSizeMap, bearSizeKey]);

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

  const filteredProducts: Product[] = useMemo(() => {
    const bucketTest = selectedPriceBucket
      ? convertedBucketDefs.find((d) => d.key === selectedPriceBucket)?.test ?? null
      : null;
    return bearSizeFilteredProducts.filter((p) => {
      if (bucketTest && !bucketTest(p)) return false;
      if (selectedColors.length > 0) {
        const c = resolveColor(p);
        if (!c || !selectedColors.includes(c)) return false;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bearSizeFilteredProducts, selectedPriceBucket, selectedColors, aiColorHints, convertedBucketDefs]);

  const products = useMemo(() => {
    const p = [...filteredProducts];
    if (sort === "best-seller") p.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    if (sort === "price-asc") p.sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "price-desc") p.sort((a, b) => b.priceValue - a.priceValue);
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

  const { data: catalogMetadata } = useCatalogMetadata();
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
      ? (occasionLabelKey ? t(occasionLabelKey, {}) : undefined) || catalogOccasion?.name || ""
      : "";

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
    document.title = seo.title;
    head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    setMeta('meta[name="description"]', { name: "description", content: seo.description }, head);
    setMeta('meta[property="og:title"]', { property: "og:title", content: seo.ogTitle }, head);
    setMeta('meta[property="og:description"]', { property: "og:description", content: seo.ogDescription }, head);
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: seo.twitterTitle }, head);
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: seo.twitterDescription }, head);
    return () => {
      head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    };
  }, [entityName, isCategoryRoute, isOccasionRoute, city, country, language, cityName, countryName]); // eslint-disable-line react-hooks/exhaustive-deps

  const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const pageTitle = category
    ? capitalizeFirst((categoryLabelKey ? t(categoryLabelKey, {}) : undefined)
      || catalogCategory?.name
      || category)
    : occasion
      ? capitalizeFirst((occasionLabelKey ? t(occasionLabelKey, {}) : undefined)
        || catalogOccasion?.name
        || occasion)
      : brand
        ? (brandProducts.data?.brandName ?? brand)
        : t("shop.allCollection");

  const brandDisplayName = brandProducts.data?.brandName ?? brand;
  const clearBrandHref = occasion
    ? `/occasion/${occasion}`
    : category
      ? `/category/${category}`
      : "/shop";

  const breadcrumbCrumbs = useMemo((): Crumb[] => {
    if (!category && !occasion && !brand) return [];
    const home: Crumb = { label: t("nav.home"), href: "/" };
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
        occasion
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
    <div className="min-h-screen pt-2 md:pt-6 pb-24 bg-white">
      {breadcrumbCrumbs.length > 0 && (
        <div className="container mx-auto max-w-content px-page pt-2 md:pt-4">
          <PageBreadcrumb crumbs={breadcrumbCrumbs} />
        </div>
      )}
      <div className={`container mx-auto max-w-content px-page${breadcrumbCrumbs.length > 0 ? " pt-4" : ""}`}>
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-4 pb-2">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif" data-testid="text-shop-title">
              {pageTitle}
              {!isLoading && (
                <span className="hidden md:inline text-muted-foreground font-sans text-base md:text-lg font-normal">
                  {" "}<span className="mx-2 opacity-40">/</span>{t("shop.productCount", { count: String(products.length) })}
                </span>
              )}
            </h1>
            {!isLoading && (
              <p className="md:hidden text-sm text-muted-foreground font-normal mt-1 whitespace-nowrap">
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
                <SelectItem value="featured">{t("shop.sort.featured")}</SelectItem>
                <SelectItem value="best-seller">{t("shop.sort.bestSeller")}</SelectItem>
                <SelectItem value="price-asc">{t("shop.sort.priceAsc")}</SelectItem>
                <SelectItem value="price-desc">{t("shop.sort.priceDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {occasion === "birthday" && (
          <BirthdayRecipientTabs activeKey={recipientKey} onSelect={handleRecipientSelect} />
        )}

        {occasion === "anniversary" && (
          <AnniversaryGenderTabs activeKey={anniversaryGenderKey} onSelect={handleAnniversaryGenderSelect} />
        )}

        {isStuffedAnimals && (
          <BearSizeTabs
            activeKey={bearSizeKey}
            onSelect={handleBearSizeSelect}
            sizeMap={bearSizeMap}
            products={recipientFilteredProducts}
          />
        )}

        <div className="block md:hidden w-full mb-6">
          <Button
            variant="outline"
            className="relative w-full h-12 border-primary text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => setMobileFiltersOpen(true)}
            data-testid="button-mobile-filters"
          >
            <Filter className="w-4 h-4 mr-2" />
            {t("shop.filterAndSort")}
            {(hasActiveFilters || sort !== "featured") && (
              <span className="absolute -top-1.5 right-3 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                {(selectedPriceBucket ? 1 : 0) + selectedColors.length + (sort !== "featured" ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="hidden md:block w-64 shrink-0 space-y-8">
            <div>
              <h2 className="font-serif text-lg mb-4">{t("shop.categoriesTitle")}</h2>
              <ul className="space-y-3">
                {CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/category/${c.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${category === c.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-category-${c.slug}`}
                    >
                      {t(c.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-serif text-lg mb-4">{t("shop.occasionsTitle")}</h2>
              <ul className="space-y-3">
                {OCCASIONS.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/occasion/${o.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${occasion === o.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-occasion-${o.slug}`}
                    >
                      {t(o.labelKey)}
                    </Link>
                  </li>
                ))}
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
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
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
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
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
                {products.map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {(category || occasion) && products.length > 0 && (() => {
        const cityLabel = city ? cityName(city.id, city.name) : "";
        const availableCategoryIds = catalogMetadata?.categories.map((c) => c.id) ?? [];
        const availableOccasionIds = catalogMetadata?.occasions.map((o) => o.id) ?? [];
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
          />
        );
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
                    { value: "featured", label: t("shop.sort.featured") },
                    { value: "best-seller", label: t("shop.sort.bestSeller") },
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

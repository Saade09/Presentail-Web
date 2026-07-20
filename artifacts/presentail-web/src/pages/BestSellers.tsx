import { useState, useMemo } from "react";
import { useGetHomepageBestSellers } from "@workspace/api-client-react";
import { useFxRates } from "@/lib/queries";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { roundToNearestFive } from "@workspace/display-currency";
import { extractColor, useProductColorHints } from "@/lib/colorExtractor";
import { ShopFilters, type PriceBucket, type PriceBucketDef, type ColorFacet } from "@/components/ShopFilters";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, SlidersHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { useLcpImagePreload } from "@/hooks/useLcpImagePreload";
import type { Product } from "@/lib/queries";

const CRUMBS: Crumb[] = [
  { label: "Home", href: "/" },
  { label: "Best Sellers" },
];

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

const USD_BUCKET_THRESHOLDS = [50, 100, 200] as const;

export default function BestSellers() {
  const { countryCode, cityId } = useLocationSelection();
  const { t } = useLocale();
  const { currencyCode, formatPrice } = useDisplayCurrency();

  const { data: fxData } = useFxRates();
  const currencyRate = useMemo(() => {
    if (currencyCode === "USD") return 1;
    const r = Number(((fxData?.rates ?? {}) as Record<string, number>)[currencyCode] ?? 0);
    return r > 0 ? r : 1;
  }, [currencyCode, fxData]);

  const [cT50, cT100, cT200] = useMemo(
    () => USD_BUCKET_THRESHOLDS.map((usd) => roundToNearestFive(usd * currencyRate, currencyCode)),
    [currencyRate, currencyCode],
  );

  const convertedBucketDefs = useMemo(
    () => [
      {
        key: "under50" as PriceBucket,
        test: (p: Product) => roundToNearestFive(p.priceValue * currencyRate, currencyCode) < cT50,
        label: t("shop.filter.priceUnderAmount", { amount: formatPrice(50) }),
      },
      {
        key: "50to100" as PriceBucket,
        test: (p: Product) => { const cv = roundToNearestFive(p.priceValue * currencyRate, currencyCode); return cv >= cT50 && cv < cT100; },
        label: t("shop.filter.priceRange", { from: formatPrice(50), to: formatPrice(100) }),
      },
      {
        key: "100to200" as PriceBucket,
        test: (p: Product) => { const cv = roundToNearestFive(p.priceValue * currencyRate, currencyCode); return cv >= cT100 && cv < cT200; },
        label: t("shop.filter.priceRange", { from: formatPrice(100), to: formatPrice(200) }),
      },
      {
        key: "over200" as PriceBucket,
        test: (p: Product) => roundToNearestFive(p.priceValue * currencyRate, currencyCode) >= cT200,
        label: t("shop.filter.priceOverAmount", { amount: formatPrice(200) }),
      },
    ],
    [currencyRate, currencyCode, cT50, cT100, cT200, formatPrice, t],
  );

  const { data, isLoading } = useGetHomepageBestSellers({
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
  });

  const sourceProducts: Product[] = useMemo(
    () =>
      (data?.products ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        priceValue: p.priceValue,
        image: p.image ? { uri: p.image.uri } : null,
        images: p.images?.map((img) => ({ uri: img.uri })) ?? [],
        inStock: p.inStock,
        popularity: p.popularity,
        isBestSeller: true,
        wcId: 0,
        category: "",
        categories: [],
        occasions: [],
      })),
    [data],
  );

  const [sort, setSort] = useState<"best-seller" | "newest" | "price-asc" | "price-desc">("best-seller");
  const [selectedPriceBucket, setSelectedPriceBucket] = useState<PriceBucket | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const priceBuckets: PriceBucketDef[] = useMemo(
    () =>
      convertedBucketDefs
        .map((def) => ({
          key: def.key,
          label: def.label,
          count: sourceProducts.filter((p) => def.test(p)).length,
        }))
        .filter((b) => b.count > 0),
    [sourceProducts, convertedBucketDefs],
  );

  const unmatchedProducts = useMemo(
    () => sourceProducts.filter((p) => extractColor(p.name) === null).map((p) => ({ slug: p.id, name: p.name })),
    [sourceProducts],
  );
  const aiColorHints = useProductColorHints(unmatchedProducts);
  const resolveColor = (p: Product) => extractColor(p.name) ?? (aiColorHints[p.id] ?? null);

  const colorFacets: ColorFacet[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of sourceProducts) {
      const c = resolveColor(p);
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color, count]) => ({ color: color as ColorFacet["color"], count }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProducts, aiColorHints]);

  const filteredProducts: Product[] = useMemo(() => {
    let result = sourceProducts;
    if (selectedPriceBucket) {
      const def = convertedBucketDefs.find((d) => d.key === selectedPriceBucket);
      if (def) result = result.filter((p) => def.test(p));
    }
    if (selectedColors.length > 0) {
      result = result.filter((p) => {
        const c = resolveColor(p);
        return c !== null && selectedColors.includes(c);
      });
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProducts, selectedPriceBucket, selectedColors, convertedBucketDefs, aiColorHints]);

  const products: Product[] = useMemo(() => {
    const p = [...filteredProducts];
    if (sort === "best-seller") {
      p.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
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
    <div className="min-h-screen pt-2 md:pt-6 bg-white">
      <div className="container mx-auto max-w-content px-page pt-2 md:pt-4">
        <PageBreadcrumb crumbs={CRUMBS} />
      </div>

      <div className="container mx-auto max-w-content px-page pt-4">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-4 pb-2">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif">
              {t("bestSellers.title")}
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
              <p className="md:hidden text-sm text-muted-foreground font-normal mt-1 whitespace-nowrap">
                {t("shop.productCount", { count: String(products.length) })}
              </p>
            )}
          </div>
          <div className="hidden md:flex items-center gap-4 w-full md:w-auto">
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-[210px] bg-background" aria-label={t("shop.sortPlaceholder")}>
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("shop.sortPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="best-seller">{t("shop.sort.bestSeller")}</SelectItem>
                <SelectItem value="price-asc">{t("shop.sort.priceAsc")}</SelectItem>
                <SelectItem value="price-desc">{t("shop.sort.priceDesc")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="block md:hidden w-full mb-6">
          <Button
            variant="outline"
            className="relative w-full h-12 border-primary text-primary hover:text-primary hover:bg-primary/5"
            onClick={() => setMobileFiltersOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {t("shop.filterAndSort")}
            {(hasActiveFilters || sort !== "best-seller") && (
              <span className="absolute -top-1.5 right-3 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-medium">
                {(selectedPriceBucket ? 1 : 0) + selectedColors.length + (sort !== "best-seller" ? 1 : 0)}
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
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
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
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {t(o.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <ShopFilters {...shopFiltersProps} />
          </div>

          <div className="flex-1">
            <h2 className="sr-only">{t("shop.productsHeading")}</h2>
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {selectedPriceBucket && (
                  <button
                    type="button"
                    onClick={() => setSelectedPriceBucket(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    {convertedBucketDefs.find((d) => d.key === selectedPriceBucket)?.label ?? ""}
                    <X className="w-3 h-3" />
                  </button>
                )}
                {selectedColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleColorToggle(color)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                  >
                    {t(`shop.color.${color}`)}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="aspect-[4/5] rounded-2xl" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed">
                {hasActiveFilters ? (
                  <>
                    <h3 className="font-serif text-2xl mb-3">{t("shop.empty.titleSoldOut")}</h3>
                    <p className="text-muted-foreground mb-6 max-w-xl mx-auto px-4">{t("shop.empty.descSoldOut")}</p>
                    <Button variant="outline" onClick={handleClearFilters}>
                      {t("shop.filter.clearFilters")}
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground py-4">{t("bestSellers.empty")}</p>
                )}
              </div>
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
            >
              {t("shop.filter.showResults", { count: String(products.length) })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

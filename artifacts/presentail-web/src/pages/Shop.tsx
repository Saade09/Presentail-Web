import { useProducts, useCategoryProducts, useOccasionProducts, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/ProductCard";
import { useSearch, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Filter, MapPin, SlidersHorizontal } from "lucide-react";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";

const CATEGORIES = [
  { slug: "hand-bouquets", labelKey: "shop.cat.handBouquets" },
  { slug: "flower-boxes", labelKey: "shop.cat.flowerBoxes" },
  { slug: "plants", labelKey: "shop.cat.plants" },
  { slug: "cakes", labelKey: "shop.cat.cakes" },
  { slug: "chocolate", labelKey: "shop.cat.chocolate" },
  { slug: "bundles", labelKey: "shop.cat.bundles" },
  { slug: "baskets", labelKey: "shop.cat.baskets" },
  { slug: "bears-balloons", labelKey: "shop.cat.bearsBalloons" },
];

const OCCASIONS = [
  { slug: "birthday", labelKey: "shop.occ.birthday" },
  { slug: "love-romance", labelKey: "shop.occ.loveRomance" },
  { slug: "congratulations", labelKey: "shop.occ.congratulations" },
  { slug: "thank-you", labelKey: "shop.occ.thankYou" },
  { slug: "condolences", labelKey: "shop.occ.condolences" },
];

export default function Shop() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const { t, language } = useLocale();

  const category = searchParams.get("category") || "";
  const occasion = searchParams.get("occasion") || "";

  const { countryCode, cityId, country, openPicker } = useLocationSelection();
  const queryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) queryParams.countryCode = countryCode;
  if (cityId) queryParams.cityId = cityId;

  const allProducts = useProducts(queryParams, !category && !occasion);
  const categoryProducts = useCategoryProducts(category, queryParams);
  const occasionProducts = useOccasionProducts(occasion, queryParams);

  const isLoading = category
    ? categoryProducts.isLoading
    : occasion
      ? occasionProducts.isLoading
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
      return flat;
    }
    return allProducts.data?.products ?? [];
  }, [category, occasion, categoryProducts.data, occasionProducts.data, allProducts.data]);

  // Always-on store catalog used to suggest popular picks when the user lands
  // on a sold-out category/occasion (so the page doesn't render an empty grid).
  // We keep this enabled even when a filter is active because it has its own
  // cache key and we only render its result inside the empty state.
  const fallbackPool = useProducts(queryParams, true);
  const popularPicks: Product[] = useMemo(() => {
    const all = fallbackPool.data?.products ?? [];
    const filtered = category ? all.filter((p) => p.category !== category) : all;
    return [...filtered]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 6);
  }, [fallbackPool.data, category]);

  const [sort, setSort] = useState("featured");

  const products = useMemo(() => {
    const p = [...sourceProducts];
    if (sort === "price-asc") p.sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "price-desc") p.sort((a, b) => b.priceValue - a.priceValue);
    return p;
  }, [sourceProducts, sort]);

  const pageTitle = category
    ? t(CATEGORIES.find((c) => c.slug === category)?.labelKey ?? category)
    : occasion
      ? t(OCCASIONS.find((o) => o.slug === occasion)?.labelKey ?? occasion)
      : t("shop.allCollection");

  return (
    <div className="min-h-screen pt-24 pb-24">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-12 pb-8 border-b">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif mb-4" data-testid="text-shop-title">{pageTitle}</h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              {t("shop.subtitle", { country: country?.name ?? "Lebanon" })}
            </p>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[180px] bg-background" data-testid="select-sort">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("shop.sortPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">{t("shop.sort.featured")}</SelectItem>
                <SelectItem value="price-asc">{t("shop.sort.priceAsc")}</SelectItem>
                <SelectItem value="price-desc">{t("shop.sort.priceDesc")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="md:hidden" data-testid="button-mobile-filters">
              <Filter className="w-4 h-4 mr-2" /> {t("shop.filters")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="hidden md:block w-64 shrink-0 space-y-8">
            <div>
              <h3 className="font-serif text-lg mb-4">{t("shop.categoriesTitle")}</h3>
              <ul className="space-y-3">
                {CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/shop?category=${c.slug}`}
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
              <h3 className="font-serif text-lg mb-4">{t("shop.occasionsTitle")}</h3>
              <ul className="space-y-3">
                {OCCASIONS.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/shop?occasion=${o.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${occasion === o.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-occasion-${o.slug}`}
                    >
                      {t(o.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {(category || occasion) && (
              <Link href="/shop" className="text-sm font-medium text-primary hover:underline" data-testid="link-clear-filters">
                {t("shop.clearAll")}
              </Link>
            )}
          </div>
          <div className="flex-1">
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
              (category || occasion) ? (
                <div data-testid="empty-state-sold-out">
                  <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed">
                    <h3 className="font-serif text-2xl mb-3">{t("shop.empty.titleSoldOut")}</h3>
                    <p className="text-muted-foreground mb-6 max-w-xl mx-auto px-4">
                      {t("shop.empty.descSoldOut")}
                    </p>
                    <Button asChild variant="outline" data-testid="button-browse-all">
                      <Link href="/shop">{t("shop.browseAll")}</Link>
                    </Button>
                  </div>
                  {popularPicks.length > 0 ? (
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
                        <Button variant="outline" onClick={openPicker} data-testid="button-change-country">
                          {t("shop.empty.changeCountry")}
                        </Button>
                        {(category || occasion) && (
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
    </div>
  );
}

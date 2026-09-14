import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { countryCodeToSlug, cityIdToSlug } from "@/lib/locale-route";
import { getCityHomeSeoOverride } from "@/lib/seo";
import { CITY_SEO } from "@/data/city-seo.mjs";
import { useHomepageBanners } from "@/lib/banners";
import { apiFetch } from "@/lib/api";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { HomepageCollections } from "@/components/homepage/HomepageCollections";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";
import { TrustpilotCarousel } from "@/components/homepage/TrustpilotCarousel";
import { TrustpilotBrandsRow } from "@/components/homepage/TrustpilotBrandsRow";
import { ProductCard } from "@/components/ProductCard";
import { Link } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { SEOContentSection } from "@/components/SEOContentSection";
import {
  useGetHomepageBestSellers,
  getGetHomepageBestSellersQueryKey,
} from "@workspace/api-client-react";
import { useCatalogMetadata, useProducts, type Product } from "@/lib/queries";

type HomepageTaxonomy = {
  categoryHeading: string;
  occasionHeading: string;
  categories: Array<{ href: string; label: string }>;
  occasions: Array<{ href: string; label: string }>;
};

function readSsrHomepageTaxonomy(): HomepageTaxonomy | null {
  if (typeof document === "undefined") return null;
  const raw = document.querySelector("[data-ssr-home-taxonomy]")?.textContent;
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as HomepageTaxonomy;
    if (
      !value ||
      typeof value.categoryHeading !== "string" ||
      typeof value.occasionHeading !== "string" ||
      !Array.isArray(value.categories) ||
      !Array.isArray(value.occasions) ||
      ![...value.categories, ...value.occasions].every(
        (link) => typeof link?.href === "string" && typeof link?.label === "string",
      )
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/**
 * Read the server-rendered product block (SSR-enabled city homes, e.g.
 * /en-lb/tripoli) from the initial document. seo-inject.mjs embeds the
 * product data as an inert JSON script inside the section flagged with
 * data-ssr-products="true".
 *
 * Must be called during the FIRST render (e.g. a useState initializer):
 * React's createRoot().render() replaces all children of #root on commit,
 * so the server-rendered markup is only readable before that point.
 * Returns null when no SSR block is present (every other city / SPA nav).
 */
function readSsrProducts(): Product[] | null {
  if (typeof document === "undefined") return null;
  const script = document.querySelector(
    '[data-ssr-products="true"] script[data-ssr-products-data]',
  );
  const raw = script?.textContent;
  if (!raw) return null;
  try {
    const items = JSON.parse(raw) as Array<{
      name?: string;
      price?: string;
      priceValue?: number;
      discountPriceValue?: number | null;
      discountPriceAed?: number | null;
      slug?: string;
      imageUrl?: string;
    }>;
    if (!Array.isArray(items) || items.length === 0) return null;
    const products: Product[] = [];
    for (const it of items) {
      if (!it || !it.slug || !it.name || !it.price) continue;
      products.push({
        id: it.slug,
        name: it.name,
        price: it.price,
        priceValue: typeof it.priceValue === "number" ? it.priceValue : 0,
        // Preserve sale pricing so ProductCard/SalePrice keeps showing the
        // discounted price and sale badge after SSR adoption.
        discountPriceValue:
          typeof it.discountPriceValue === "number" ? it.discountPriceValue : null,
        discountPriceAed:
          typeof it.discountPriceAed === "number" ? it.discountPriceAed : null,
        image: it.imageUrl ? { uri: it.imageUrl } : null,
        images: it.imageUrl ? [{ uri: it.imageUrl }] : [],
        inStock: true,
        popularity: 0,
        isBestSeller: true,
        wcId: 0,
        category: "",
        categories: [],
        occasions: [],
      });
    }
    return products.length > 0 ? products : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const { country, city, cityId } = useLocationSelection();
  const { t, cityName, language } = useLocale();
  const isMobile = useIsMobile();
  const countryCode = country?.code ?? undefined;
  const isCyprus = countryCode === "CY";
  const device = isMobile ? "mobile" as const : "desktop" as const;
  const { data: banners, isLoading } = useHomepageBanners(countryCode, cityId ?? undefined, device, language);

  const { data: geoData } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<{ countryCode: string | null }>("/geo/currency"),
    staleTime: 10 * 60 * 1000,
  });
  const ipCountry = geoData?.countryCode ?? null;
  // Read this before createRoot removes the injected fallback. Until the
  // metadata query resolves, it is the authoritative server inventory snapshot
  // and keeps the initially served taxonomy visible after hydration.
  const [ssrHomepageTaxonomy] = useState<HomepageTaxonomy | null>(readSsrHomepageTaxonomy);
  // Match the server's country-scoped inventory gate for the homepage's
  // category and occasion links. The metadata endpoint is the same source
  // used by the catalog navigation, so empty landing pages are never promoted.
  const { data: catalogMetadata } = useCatalogMetadata(countryCode, language);
  const availableCategoryIds = (catalogMetadata?.categories ?? [])
    .filter((category) => category.count > 0)
    .map((category) => category.id);
  const availableOccasionIds = (catalogMetadata?.occasions ?? [])
    .filter((occasion) => (occasion as { count?: number }).count ?? 0)
    .map((occasion) => occasion.id);
  // Batroun's child taxonomy routes are intentionally noindex pending
  // city-level eligibility, so do not expose country-wide inventory links
  // there. This mirrors the server-rendered home fragment.
  const canLinkCityTaxonomy = cityId?.toLowerCase() !== "lb-batroun";
  const homepageTaxonomy =
    canLinkCityTaxonomy && catalogMetadata === undefined ? ssrHomepageTaxonomy : undefined;

  // Server-rendered products (SSR-enabled city homes, e.g. Tripoli): adopted
  // from the initial document on first mount so we skip the redundant
  // best-sellers fetch on hydration. Lazy useState initializer — runs during
  // the first render, before React replaces the server-rendered #root children.
  const [ssrProducts] = useState<Product[] | null>(readSsrProducts);

  const bestSellersParams = {
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
    lang: language,
  };
  const { data: bestSellersData, isLoading: isBestSellersLoading } = useGetHomepageBestSellers(
    bestSellersParams,
    // Skip the network round-trip when the server already embedded products.
    {
      query: {
        queryKey: getGetHomepageBestSellersQueryKey(bestSellersParams),
        enabled: !ssrProducts,
      },
    },
  );
  // Only pass products when the API has resolved with real data.
  // When undefined (loading, error, or empty cache), BestSellersPreview falls
  // back to its default seeded-shuffle hand-bouquets path so the rail is never blank.
  const bestSellerProducts: Product[] | undefined = ssrProducts
    ? ssrProducts
    : bestSellersData !== undefined && bestSellersData.products.length > 0
      ? bestSellersData.products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          priceValue: p.priceValue,
          discountPriceValue: p.discountPriceValue ?? null,
          discountPriceAed: p.discountPriceAed ?? null,
          image: p.image ? { uri: p.image.uri } : null,
          images: p.images?.map((img) => ({ uri: img.uri })) ?? [],
          inStock: p.inStock,
          popularity: p.popularity,
          isBestSeller: p.isBestSeller ?? true,
          wcId: 0,
          category: "",
          categories: [],
          occasions: [],
        }))
      : undefined;

  // ── Cyprus: fetch all products for the Flower Collection rail ─────────────
  const { data: allProductsData, isLoading: isAllProductsLoading } = useProducts(
    { countryCode: countryCode ?? undefined, cityId: cityId ?? undefined, lang: language },
    isCyprus,
  );

  const flowerCollectionProducts = useMemo<Product[]>(() => {
    if (!isCyprus || !allProductsData?.products) return [];
    // Sort by effective display price (sale price when active, otherwise regular price).
    return [...allProductsData.products]
      .sort(
        (a, b) =>
          (a.discountPriceValue ?? a.priceValue) -
          (b.discountPriceValue ?? b.priceValue),
      );
  }, [isCyprus, allProductsData]);

  const cityLabel = city
    ? cityName(city.id, city.name)
    : cityId
      ? cityId
          .split("-")
          .slice(1)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ")
      : "";
  const siblingCities = country?.cities?.filter((c) => c.id !== cityId) ?? [];
  // Hand-written per-city landing overrides (e.g. Tripoli): the same shared
  // data feeds the server-injected initial HTML, so the H1, intro, "why"
  // points and FAQs stay identical before and after hydration.
  // cityId is already the "{country}-{city}" key (e.g. "lb-tripoli").
  const cityOverride = getCityHomeSeoOverride(cityId?.toLowerCase() ?? null, language);
  const cityCoverageText = cityId
    ? (CITY_SEO[cityId.toLowerCase()]?.[language] ?? CITY_SEO[cityId.toLowerCase()]?.en ?? "")
    : "";
  const h1Text = cityOverride?.h1 ?? (cityLabel ? t("home.h1", { city: cityLabel }) : "");
  const cityIntroText =
    cityOverride?.intro && cityOverride.intro !== cityCoverageText
      ? cityOverride.intro
      : "";

  const trustpilotTitle =
    ipCountry === "LB"
      ? t("home.trustpilot.titleLB")
      : t("home.trustpilot.titleExpat");

  return (
    <>
    <div className="min-h-screen max-w-content mx-auto" data-testid="page-country-homepage">
      {/* Banner sits flush against the container edges — same alignment as the product grid */}
      <div data-testid="hero-section">
        <HeroBannerCarousel
          banners={banners ?? []}
          isLoading={isLoading}
          cityHeading={h1Text}
          autoPlay
          intervalMs={5000}
        />
      </div>

      {/* Keep the city-specific intro in the below-hero content flow so it
          remains available without pushing the campaign artwork down. */}
      {cityIntroText && (
        <p
          data-testid="city-intro-text"
          className="px-4 md:px-0 pt-4 pb-4 text-sm md:text-base text-muted-foreground max-w-3xl"
        >
          {cityIntroText}
        </p>
      )}

      {isCyprus ? (
        /* ── Cyprus: 4×4 grid of the first 16 products sorted by display price asc ── */
        <section className="py-6 md:py-10 px-4 md:px-0" data-testid="section-flower-collection">
          <div className="flex items-center justify-between mb-6 md:mb-8">
            <h2 className="font-serif text-2xl md:text-4xl text-primary">
              {t("home.flowerCollection")}
            </h2>
            <Link
              href="/shop"
              className="text-sm font-medium text-primary hover:text-primary/70 transition-colors"
            >
              {t("bestSellers.viewAll")}
            </Link>
          </div>
          {isAllProductsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
              {Array(16).fill(0).map((_, i) => (
                <div key={i}>
                  <div className="aspect-square animate-shimmer rounded-lg mb-4" />
                  <div className="h-5 animate-shimmer rounded w-2/3 mb-2" />
                  <div className="h-4 animate-shimmer rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6">
              {flowerCollectionProducts.slice(0, 16).map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} imageClassName="rounded-lg" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Summer Picks rail — shown above Best Sellers so seasonal products are seen first.
              Summer is an OS occasion (not a category), so occasionSlug is used. */}
          <BestSellersPreview
            occasionSlug="summer"
            titleKey="collections.summer.title"
            railKey="rail-summer"
            viewAllHref="/occasion/summer"
            viewAllLabel={t("collections.summer.viewAll")}
            testId="section-collection-summer"
          />

          {/* Best Sellers rail — 10 products ranked by real sales data from the API */}
          <BestSellersPreview
            titleKey="bestSellers.title"
            railKey="best-sellers"
            viewAllHref="/best-sellers"
            viewAllLabel={t("bestSellers.viewAll")}
            products={bestSellerProducts}
            isLoadingExternal={isBestSellersLoading}
            limit={10}
          />

          <HomepageCollections />

          {/* Second themed rail — Flower Boxes. */}
          {/* sortBy="price-asc" surfaces the cheaper, fast-moving options first within the ranked set. */}
          <BestSellersPreview
            categorySlug="flower-boxes"
            titleKey="collections.boxes.title"
            railKey="rail-boxes"
            viewAllLabel={t("collections.boxes.viewAll")}
            testId="section-collection-boxes"
            sortBy="price-asc"
          />

          {/* Third themed rail — Balloons. */}
          <BestSellersPreview
            categorySlug="balloons"
            titleKey="collections.balloons.title"
            railKey="rail-balloons"
            viewAllLabel={t("collections.balloons.viewAll")}
            testId="section-collection-balloons"
          />

          {/* Fourth themed rail — Lux Arrangements. */}
          <BestSellersPreview
            categorySlug="lux-arrangements"
            titleKey="collections.luxArrangements.title"
            railKey="rail-lux-arrangements"
            viewAllLabel={t("collections.luxArrangements.viewAll")}
            testId="section-collection-lux-arrangements"
          />
        </>
      )}

      {/* Trustpilot review carousel — sits above the footer */}
      <div className="px-page py-10">
        <h2 className="text-center font-serif text-2xl text-gray-800 mb-6">
          {trustpilotTitle}
        </h2>
        <TrustpilotCarousel />
        {!isCyprus && <TrustpilotBrandsRow />}
      </div>

    </div>

    {/* From the journal — cross-links to editorial posts for Lebanese cities */}
    {countryCode === "LB" && (
      <div className="container mx-auto px-4 pb-4 max-w-content text-center text-sm text-muted-foreground space-y-1">
        <div>
          From the Presentail journal:{" "}
          {/* Plain <a> bypasses the city-scoped wouter router so the link goes
              directly to the canonical /{lang}/blog/:slug URL without a redirect. */}
          <a href={`/${language}/blog/flower-shop-in-achrafieh`} className="text-primary underline underline-offset-2 hover:text-primary/70 transition-colors">
            The best flower shop in Achrafieh, Beirut →
          </a>
        </div>
        <div>
          <a href={`/${language}/blog/send-roses-to-lebanon`} className="text-primary underline underline-offset-2 hover:text-primary/70 transition-colors">
            Send roses to Lebanon: same-day delivery, nationwide →
          </a>
        </div>
      </div>
    )}

    {/* Delivery-coverage paragraph: same CITY_SEO copy the server injects
        into the initial HTML — rendered here too so it stays visible after
        hydration (server/client content parity). Placed below the product
        grid so the hero and shopping content appear immediately above the fold. */}
    {cityCoverageText && (
      <p
        data-testid="city-coverage-text"
        className="container mx-auto px-4 pb-4 max-w-content text-sm md:text-base text-muted-foreground"
      >
        {cityCoverageText}
      </p>
    )}

    {/* "Why Presentail" points for overridden city landings — mirrors the
        server-injected list so the visible content survives hydration. */}
    {cityOverride?.whyPoints && cityOverride.whyPoints.length > 0 && (
      <section className="container mx-auto px-4 pb-6 max-w-content">
        <h2 className="font-serif text-xl md:text-2xl text-primary mb-3">{cityOverride.whyHeading}</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm md:text-base text-muted-foreground">
          {cityOverride.whyPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>
    )}

    {/* Sibling-city internal links: lets search engines discover the full
        network of city landing pages within the same country, and gives
        shoppers an easy way to switch to a nearby city. Plain <a> tags bypass
        the city-scoped wouter router so hrefs work as absolute paths. */}
    {countryCode && siblingCities.length > 0 && (
      <section className="container mx-auto px-4 pb-4 max-w-content">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{t("home.siblingCities.heading")}: </span>
          {siblingCities
            .map((c, idx, arr) => {
              const citySlug = cityIdToSlug(c.id);
              const countrySlug = countryCodeToSlug(countryCode);
              const href = `/${language}-${countrySlug}/${citySlug}`;
              return (
                <span key={c.id}>
                  <a
                    href={href}
                    className="text-primary hover:underline underline-offset-2 transition-colors"
                  >
                    {cityName(c.id, c.name)}
                  </a>
                  {idx < arr.length - 1 ? ", " : ""}
                </span>
              );
            })}
        </p>
      </section>
    )}

    <div data-testid="seo-content-section-wrapper">
      <SEOContentSection
        pageType="homepage"
        cityLabel={cityLabel}
        lang={language}
        countryCode={countryCode ?? ""}
        availableCategoryIds={canLinkCityTaxonomy ? availableCategoryIds : []}
        availableOccasionIds={canLinkCityTaxonomy ? availableOccasionIds : []}
        homepageTaxonomy={homepageTaxonomy ?? undefined}
        suppressFaqJsonLd
        overrides={cityOverride?.faqs ? { faqs: cityOverride.faqs } : undefined}
        faqsAlwaysVisible={Boolean(cityOverride?.faqs)}
      />
    </div>
    </>
  );
}

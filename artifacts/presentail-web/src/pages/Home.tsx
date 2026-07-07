import { useQuery } from "@tanstack/react-query";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useHomepageBanners } from "@/lib/banners";
import { apiFetch } from "@/lib/api";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { HomepageCollections } from "@/components/homepage/HomepageCollections";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";
import { TrustpilotCarousel } from "@/components/homepage/TrustpilotCarousel";
import { TrustpilotBrandsRow } from "@/components/homepage/TrustpilotBrandsRow";
import { useIsMobile } from "@/hooks/use-mobile";
import { SEOContentSection } from "@/components/SEOContentSection";
import { useGetHomepageBestSellers } from "@workspace/api-client-react";
import type { Product } from "@/lib/queries";

export default function Home() {
  const { country, city, cityId } = useLocationSelection();
  const { t, cityName, language } = useLocale();
  const isMobile = useIsMobile();
  const countryCode = country?.code ?? undefined;
  const device = isMobile ? "mobile" as const : "desktop" as const;
  const { data: banners, isLoading } = useHomepageBanners(countryCode, cityId ?? undefined, device, language);

  const { data: geoData } = useQuery({
    queryKey: ["geo-currency"],
    queryFn: () => apiFetch<{ countryCode: string | null }>("/geo/currency"),
    staleTime: 10 * 60 * 1000,
  });
  const ipCountry = geoData?.countryCode ?? null;

  const { data: bestSellersData, isLoading: isBestSellersLoading } = useGetHomepageBestSellers({
    ...(countryCode ? { countryCode } : {}),
    ...(cityId ? { cityId } : {}),
  });
  // Only pass products when the API has resolved with real data.
  // When undefined (loading, error, or empty cache), BestSellersPreview falls
  // back to its default seeded-shuffle hand-bouquets path so the rail is never blank.
  const bestSellerProducts: Product[] | undefined =
    bestSellersData !== undefined && bestSellersData.products.length > 0
      ? bestSellersData.products.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          priceValue: p.priceValue,
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

  const cityLabel = city
    ? cityName(city.id, city.name)
    : cityId
      ? cityId
          .split("-")
          .slice(1)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ")
      : "";
  const h1Text = cityLabel ? t("home.h1", { city: cityLabel }) : "";

  const trustpilotTitle =
    ipCountry === "LB"
      ? t("home.trustpilot.titleLB")
      : t("home.trustpilot.titleExpat");

  return (
    <>
    <div className="min-h-screen max-w-content mx-auto" data-testid="page-country-homepage">
      {h1Text && (
        <h1 className="sr-only">{h1Text}</h1>
      )}
      {/* Banner sits flush against the container edges — same alignment as the product grid */}
      <HeroBannerCarousel banners={banners ?? []} isLoading={isLoading} autoPlay intervalMs={5000} />

      {/* Summer Picks rail — shown above Best Sellers so seasonal products are seen first.
          Summer is an OS occasion (not a category), so occasionSlug is used. */}
      <BestSellersPreview
        occasionSlug="summer"
        titleKey="collections.summer.title"
        railKey="rail-summer"
        viewAllHref="/occasion/summer"
        testId="section-collection-summer"
      />

      {/* Best Sellers rail — 10 products ranked by real sales data from the API */}
      <BestSellersPreview
        titleKey="bestSellers.title"
        railKey="best-sellers"
        viewAllHref="/best-sellers"
        products={bestSellerProducts}
        isLoadingExternal={isBestSellersLoading}
        limit={10}
      />

      <HomepageCollections />

      {/* Second themed rail — Flower Boxes. Not shown in Cyprus (category doesn't exist there). */}
      {countryCode !== "CY" && (
        <BestSellersPreview
          categorySlug="flower-boxes"
          titleKey="collections.boxes.title"
          railKey="rail-boxes"
          testId="section-collection-boxes"
        />
      )}

      {/* Third themed rail — Balloons. */}
      <BestSellersPreview
        categorySlug="balloons"
        titleKey="collections.balloons.title"
        railKey="rail-balloons"
        testId="section-collection-balloons"
      />

      {/* Trustpilot review carousel — sits above the footer */}
      <div className="px-page py-10">
        <h2 className="text-center font-serif text-2xl text-gray-800 mb-6">
          {trustpilotTitle}
        </h2>
        <TrustpilotCarousel />
        <TrustpilotBrandsRow />
      </div>

    </div>

    <SEOContentSection
      pageType="homepage"
      cityLabel={cityLabel}
      lang={language}
      countryCode={countryCode ?? ""}
      suppressFaqJsonLd
    />
    </>
  );
}

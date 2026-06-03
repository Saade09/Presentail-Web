import { useLocationSelection } from "@/contexts/LocationContext";
import { useHomepageBanners } from "@/lib/banners";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { HomepageCollections } from "@/components/homepage/HomepageCollections";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";
import { BestSellersRail } from "@/components/homepage/BestSellersRail";
import { TrustpilotCarousel } from "@/components/homepage/TrustpilotCarousel";

export default function Home() {
  const { country } = useLocationSelection();
  const countryCode = country?.code ?? "*";
  const { data: banners, isLoading } = useHomepageBanners(countryCode);

  const trustpilotTitle =
    countryCode === "LB"
      ? "The Modern Flower Delivery Company"
      : "Made For Lebanese Expats, By Lebanese Expats";

  return (
    <div className="min-h-screen max-w-content mx-auto" data-testid="page-country-homepage">
      {/* Banner sits flush against the container edges — same alignment as the product grid */}
      <HeroBannerCarousel banners={banners ?? []} isLoading={isLoading} autoPlay intervalMs={5000} />

      <div className="px-page">
        <BestSellersRail />

        {/* First themed product rail — mirrors the live site's "Summer Collection". */}
        <BestSellersPreview
          categorySlug="hand-bouquets"
          titleKey="collections.summer.title"
          railKey="rail-summer"
          testId="section-collection-summer"
        />

        <HomepageCollections />

        {/* Second themed rail — Flower Boxes. Same component, different category. */}
        <BestSellersPreview
          categorySlug="flower-boxes"
          titleKey="collections.boxes.title"
          railKey="rail-boxes"
          testId="section-collection-boxes"
        />

        {/* Third themed rail — Cakes. */}
        <BestSellersPreview
          categorySlug="cakes"
          titleKey="collections.cakes.title"
          railKey="rail-cakes"
          testId="section-collection-cakes"
        />
      </div>

      {/* Trustpilot review carousel — sits above the footer */}
      <div className="px-page py-10">
        <h2 className="text-center font-serif text-2xl text-gray-800 mb-6">
          {trustpilotTitle}
        </h2>
        <TrustpilotCarousel />
      </div>
    </div>
  );
}

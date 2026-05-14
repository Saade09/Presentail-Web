import { useLocationSelection } from "@/contexts/LocationContext";
import { useHomepageBanners } from "@/lib/banners";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { HomepageCollections } from "@/components/homepage/HomepageCollections";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";
import { EditorialSection } from "@/components/homepage/EditorialSection";

export default function Home() {
  const { country } = useLocationSelection();
  const countryCode = country?.code ?? "*";
  const { data: banners, isLoading } = useHomepageBanners(countryCode);

  return (
    <div className="min-h-screen" data-testid="page-country-homepage">
      <HeroBannerCarousel banners={banners ?? []} isLoading={isLoading} />

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

      <EditorialSection />
    </div>
  );
}

import { useLocationSelection } from "@/contexts/LocationContext";
import { useHomepageBanners } from "@/lib/banners";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { HomepageCollections } from "@/components/homepage/HomepageCollections";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";
import { TrustStrip } from "@/components/homepage/TrustStrip";
import { BrandSpotlight } from "@/components/homepage/BrandSpotlight";
import { EditorialSection } from "@/components/homepage/EditorialSection";
import { NewsletterCTA } from "@/components/homepage/NewsletterCTA";

export default function Home() {
  const { country } = useLocationSelection();
  const countryCode = country?.code ?? "*";
  const { data: banners, isLoading } = useHomepageBanners(countryCode);

  return (
    <div className="min-h-screen" data-testid="page-country-homepage">
      <HeroBannerCarousel banners={banners ?? []} isLoading={isLoading} />
      <HomepageCollections />
      <BestSellersPreview />
      <TrustStrip />
      <BrandSpotlight />
      <EditorialSection />
      <NewsletterCTA />
    </div>
  );
}

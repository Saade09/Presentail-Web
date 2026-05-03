import { useLocationSelection } from "@/contexts/LocationContext";
import { useHomepageBanners } from "@/lib/banners";
import { HeroBannerCarousel } from "@/components/homepage/HeroBannerCarousel";
import { BestSellersPreview } from "@/components/homepage/BestSellersPreview";

export default function Home() {
  const { country } = useLocationSelection();
  const countryCode = country?.code ?? "*";
  const { data: banners, isLoading } = useHomepageBanners(countryCode);

  return (
    <div className="min-h-screen" data-testid="page-country-homepage">
      <HeroBannerCarousel banners={banners ?? []} isLoading={isLoading} />
      <BestSellersPreview />
    </div>
  );
}

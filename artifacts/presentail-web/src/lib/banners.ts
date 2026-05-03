import { useQuery } from "@tanstack/react-query";

export type HomepageBanner = {
  id: string;
  countryCode: string;
  title?: string;
  subtitle?: string;
  ctaText?: string;
  desktopMediaType: "image" | "video";
  desktopMediaUrl: string;
  desktopLinkUrl: string;
  mobileMediaType: "image" | "video";
  mobileMediaUrl: string;
  mobileLinkUrl: string;
  sortOrder: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
};

const MOCK_BANNERS: HomepageBanner[] = [
  {
    id: "banner-mothers-day",
    countryCode: "*",
    title: "Mother's Day Edit",
    subtitle: "Hand-tied bouquets, signature gifts, and limited collaborations.",
    ctaText: "Shop the edit",
    desktopMediaType: "image",
    desktopMediaUrl:
      "https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=2400&q=80",
    desktopLinkUrl: "/shop?occasion=mothers-day",
    mobileMediaType: "image",
    mobileMediaUrl:
      "https://images.unsplash.com/photo-1561181286-d3fee7d55364?auto=format&fit=crop&w=900&q=80",
    mobileLinkUrl: "/shop?occasion=mothers-day",
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "banner-spring-collection",
    countryCode: "*",
    title: "The Spring Collection",
    subtitle: "Pastel arrangements crafted by our atelier florists.",
    ctaText: "Discover",
    desktopMediaType: "video",
    desktopMediaUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    desktopLinkUrl: "/shop?category=hand-bouquets",
    mobileMediaType: "video",
    mobileMediaUrl:
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    mobileLinkUrl: "/shop?category=hand-bouquets",
    sortOrder: 2,
    isActive: true,
  },
  {
    id: "banner-luxury-gifting",
    countryCode: "*",
    title: "Luxury Gifting",
    subtitle: "Curated boxes from the brands you love.",
    ctaText: "Explore brands",
    desktopMediaType: "image",
    desktopMediaUrl:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=2400&q=80",
    desktopLinkUrl: "/brands",
    mobileMediaType: "image",
    mobileMediaUrl:
      "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=900&q=80",
    mobileLinkUrl: "/brands",
    sortOrder: 3,
    isActive: true,
  },
];

async function fetchHomepageBanners(countryCode: string): Promise<HomepageBanner[]> {
  const now = Date.now();
  const code = countryCode.toUpperCase();
  return MOCK_BANNERS.filter((b) => {
    if (!b.isActive) return false;
    if (b.countryCode !== "*" && b.countryCode.toUpperCase() !== code) return false;
    if (b.startsAt && new Date(b.startsAt).getTime() > now) return false;
    if (b.endsAt && new Date(b.endsAt).getTime() < now) return false;
    return true;
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function useHomepageBanners(countryCode: string) {
  return useQuery({
    queryKey: ["homepage-banners", countryCode],
    queryFn: () => fetchHomepageBanners(countryCode),
    staleTime: 5 * 60 * 1000,
  });
}

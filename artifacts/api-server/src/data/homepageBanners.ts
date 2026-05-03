import type { HomepageBanner } from "@workspace/api-zod";

// Canonical homepage hero banner feed served by `/api/homepage/banners`.
// Replaces the hardcoded mock array that previously lived in the web app at
// `artifacts/presentail-web/src/lib/banners.ts`. Updating this file (or, in
// the future, swapping the source for a CMS / admin UI table) lets the
// marketing team change banners without a redeploy.
export const HOMEPAGE_BANNERS: HomepageBanner[] = [
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

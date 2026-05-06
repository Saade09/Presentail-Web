import type { HomepageBanner } from "@workspace/api-zod";
import { logger } from "../lib/logger";

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

// In-memory active banner list. Initialised to the static fallback so the
// app keeps working when no remote banner source is configured. The
// scheduled WooCommerce sync (lib/wooSync.ts) calls
// `refreshHomepageBanners` on each tick to swap this in for a remotely
// curated feed when `BANNERS_REMOTE_URL` is set.
let activeBanners: HomepageBanner[] = HOMEPAGE_BANNERS;
let lastRemoteHash: string | null = null;

export function getActiveBanners(): HomepageBanner[] {
  return activeBanners;
}

function bannerSignature(list: HomepageBanner[]): string {
  return list
    .map((b) =>
      [
        b.id,
        b.countryCode,
        b.isActive ? "1" : "0",
        b.sortOrder,
        b.desktopMediaType,
        b.desktopMediaUrl,
        b.desktopLinkUrl,
        b.mobileMediaType,
        b.mobileMediaUrl,
        b.mobileLinkUrl,
        b.title ?? "",
        b.subtitle ?? "",
        b.ctaText ?? "",
        b.startsAt ?? "",
        b.endsAt ?? "",
      ].join("|"),
    )
    .sort()
    .join("\n");
}

// Refresh the active banner feed from `BANNERS_REMOTE_URL` (a JSON array of
// HomepageBanner objects). Falls back silently to the static
// `HOMEPAGE_BANNERS` list when the env var is unset, the request fails, or
// the payload is invalid. Returns true when the active feed actually
// changed since the previous refresh, so the sync worker can decide
// whether to send a silent push.
export async function refreshHomepageBanners(): Promise<boolean> {
  const url = process.env.BANNERS_REMOTE_URL;
  if (!url) {
    // No remote source: keep static, never trigger a "changed" push.
    if (activeBanners !== HOMEPAGE_BANNERS) {
      activeBanners = HOMEPAGE_BANNERS;
      lastRemoteHash = null;
      return true;
    }
    return false;
  }
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "PresentailApp/1.0" },
    });
    if (!r.ok) {
      logger.warn({ status: r.status, url }, "refreshHomepageBanners: non-ok response");
      return false;
    }
    const json = (await r.json()) as unknown;
    if (!Array.isArray(json) || json.length === 0) {
      logger.warn({ url }, "refreshHomepageBanners: empty or non-array payload, ignoring");
      return false;
    }
    // Trust the loader for shape; fields outside the schema are dropped at
    // serialise time by the GetHomepageBannersResponse.parse call.
    const next = json as HomepageBanner[];
    const sig = bannerSignature(next);
    activeBanners = next;
    const changed = sig !== lastRemoteHash;
    lastRemoteHash = sig;
    return changed;
  } catch (err: any) {
    logger.warn({ err: err?.message, url }, "refreshHomepageBanners: fetch failed");
    return false;
  }
}

import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { HomepageBanner } from "@/lib/banners";

type Props = {
  banner: HomepageBanner;
  isMobile: boolean;
  active: boolean;
};

export function HeroBannerSlide({ banner, isMobile, active }: Props) {
  const mediaType = isMobile ? banner.mobileMediaType : banner.desktopMediaType;
  const mediaUrl = isMobile ? banner.mobileMediaUrl : banner.desktopMediaUrl;
  const linkUrl = isMobile ? banner.mobileLinkUrl : banner.desktopLinkUrl;

  return (
    <Link
      href={linkUrl}
      className="block relative w-full h-full"
      data-testid={`slide-${banner.id}`}
      tabIndex={active ? 0 : -1}
    >
      {mediaType === "video" ? (
        <video
          src={mediaUrl}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={mediaUrl}
          alt={banner.title ?? "Banner"}
          className="w-full h-full object-cover"
          loading={active ? "eager" : "lazy"}
        />
      )}

      {(banner.title || banner.subtitle || banner.ctaText) && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent flex items-end">
          <div className="p-6 md:p-12 max-w-2xl text-white">
            {banner.title && (
              <h2 className="font-serif text-3xl md:text-5xl leading-tight mb-2 md:mb-3">
                {banner.title}
              </h2>
            )}
            {banner.subtitle && (
              <p className="text-sm md:text-lg text-white/90 mb-4 md:mb-6 max-w-md">
                {banner.subtitle}
              </p>
            )}
            {banner.ctaText && (
              <Button
                size="lg"
                className="bg-gold hover:bg-goldSoft text-primary rounded-full px-6"
                tabIndex={-1}
              >
                {banner.ctaText}
              </Button>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}

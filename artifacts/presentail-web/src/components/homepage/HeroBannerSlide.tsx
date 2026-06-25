import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { HomepageBanner } from "@/lib/banners";
import { buildUnsplashSrcset, buildOsImageSrcset, buildOsProxyUrl } from "@/lib/imageUtils";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { buildLocalePath, cityIdToSlug, isSupportedCountrySlug } from "@/lib/locale-route";
import type { Lang, CountrySlug } from "@/lib/locale-route";

type Props = {
  banner: HomepageBanner;
  isMobile: boolean;
  active: boolean;
};

function isExternal(url: string): boolean {
  try {
    return new URL(url).origin !== window.location.origin;
  } catch {
    return false;
  }
}

function bannerHref(
  banner: HomepageBanner,
  lang: Lang,
  countrySlug: CountrySlug | null,
  citySlug: string | null,
): { href: string; external: boolean } | null {
  if (banner.linkKind && banner.linkSlug && countrySlug) {
    const base = buildLocalePath({ lang, country: countrySlug, city: citySlug ?? undefined });
    const segment = banner.linkKind === "category" ? "category" : "occasion";
    return { href: `${base}/${segment}/${banner.linkSlug}`, external: false };
  }
  if (banner.linkUrl) {
    return { href: banner.linkUrl, external: isExternal(banner.linkUrl) };
  }
  return null;
}

export function HeroBannerSlide({ banner, isMobile, active }: Props) {
  const { language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();

  const countrySlug = countryCode
    ? (isSupportedCountrySlug(countryCode.toLowerCase())
        ? (countryCode.toLowerCase() as CountrySlug)
        : null)
    : null;
  const citySlug = cityId ? cityIdToSlug(cityId) : null;

  const link = bannerHref(banner, language as Lang, countrySlug, citySlug);

  const mediaType = banner.mediaType;
  const mediaUrl = banner.mediaUrl;
  const hasText = !!(banner.title || banner.headline || banner.subtitle || banner.ctaText);

  const osStorageImage = mediaType === "image" ? buildOsImageSrcset(mediaUrl, "(max-width: 1280px) 100vw, 1280px") : null;
  const unsplashResponsive =
    !isMobile && mediaType === "image" && !osStorageImage ? buildUnsplashSrcset(mediaUrl) : null;
  const responsiveProps = (!isMobile ? osStorageImage : null) ?? unsplashResponsive;
  const resolvedSrc = osStorageImage
    ? buildOsProxyUrl(mediaUrl, isMobile ? 800 : 1200)
    : mediaUrl;

  return (
    <a
      href={link?.href ?? undefined}
      {...(link?.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="block relative w-full h-full"
      data-testid={`slide-${banner.id}`}
      tabIndex={active ? 0 : -1}
    >
      <div className="absolute inset-0 overflow-hidden">
        {mediaType === "video" ? (
          <motion.video
            src={mediaUrl}
            {...(banner.fallbackImageUrl ? { poster: banner.fallbackImageUrl } : {})}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            style={{ willChange: "transform" }}
            initial={{ scale: 1.07 }}
            animate={{ scale: active ? 1.0 : 1.07 }}
            transition={{ duration: 8, ease: "easeOut" }}
          />
        ) : (
          <motion.div
            className="w-full h-full"
            style={{ willChange: "transform" }}
            initial={{ scale: 1.07 }}
            animate={{ scale: active ? 1.0 : 1.07 }}
            transition={{ duration: 8, ease: "easeOut" }}
          >
            <img
              src={resolvedSrc}
              alt={banner.title ?? "Banner"}
              className="w-full h-full object-cover"
              loading={active ? "eager" : "lazy"}
              {...(active ? { fetchPriority: "high" } : {})}
              {...(responsiveProps ? { srcSet: responsiveProps.srcset, sizes: responsiveProps.sizes } : {})}
            />
          </motion.div>
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent hidden md:block" />

      {hasText && (
        <div className="absolute inset-0 flex items-end">
          <div className="w-full max-w-content mx-auto">
            <motion.div
              className="px-7 py-7 md:px-14 md:py-14 max-w-2xl"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: active ? 1 : 0, y: active ? 0 : 16 }}
              transition={{ duration: 0.6, delay: active ? 0.25 : 0, ease: "easeOut" }}
            >
              {banner.title && (
                <h2 className="font-serif text-4xl md:text-6xl leading-[1.1] text-white mb-3 tracking-tight drop-shadow">
                  {banner.title}
                </h2>
              )}
              {banner.headline && (
                <p className="font-serif text-2xl md:text-4xl text-white/90 mb-2 leading-tight">
                  {banner.headline}
                </p>
              )}
              {banner.subtitle && (
                <p className="text-sm md:text-lg text-white/85 mb-6 md:mb-8 max-w-md leading-relaxed">
                  {banner.subtitle}
                </p>
              )}
              {banner.ctaText && (
                <span className="inline-flex items-center gap-2 bg-white text-primary font-semibold text-[11px] md:text-[13px] tracking-[0.14em] uppercase px-5 md:px-7 py-3 rounded-full shadow-lg hover:bg-white/90 transition-colors">
                  {banner.ctaText}
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </span>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </a>
  );
}

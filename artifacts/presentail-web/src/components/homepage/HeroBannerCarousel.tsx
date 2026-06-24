import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocale } from "@/contexts/LocaleContext";
import type { HomepageBanner } from "@/lib/banners";
import { HeroBannerSlide } from "./HeroBannerSlide";

type Props = {
  banners: HomepageBanner[];
  autoPlay?: boolean;
  intervalMs?: number;
  isLoading?: boolean;
};

const SWIPE_THRESHOLD = 50;

export function HeroBannerCarousel({
  banners,
  autoPlay = false,
  intervalMs = 6000,
  isLoading,
}: Props) {
  const [index, setIndex] = useState(0);
  const isMobile = useIsMobile();
  const { t, dir } = useLocale();

  const count = banners.length;

  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!autoPlay || count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(id);
  }, [autoPlay, intervalMs, count]);

  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  const goPrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i - 1 + count) % count);
  };
  const goNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIndex((i) => (i + 1) % count);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || count <= 1) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    // RTL: swipe left = next slide visually but prev semantically
    const isRtl = dir === "rtl";
    if (delta < 0) {
      setIndex((i) => (isRtl ? (i - 1 + count) % count : (i + 1) % count));
    } else {
      setIndex((i) => (isRtl ? (i + 1) % count : (i - 1 + count) % count));
    }
  };

  if (isLoading) {
    return (
      <div className="w-full aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9] bg-muted animate-pulse" />
    );
  }

  if (!count) return null;

  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div
      className="relative w-full aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9] overflow-hidden bg-muted"
      data-testid="hero-banner-carousel"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {banners.map((banner, i) => (
        <div
          key={banner.id}
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            i === index ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
          aria-hidden={i !== index}
        >
          <HeroBannerSlide banner={banner} isMobile={isMobile} active={i === index} />
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label={t("carousel.prev")}
            data-testid="button-carousel-prev"
            className="absolute z-20 top-1/2 -translate-y-1/2 start-3 md:start-6 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/85 hover:bg-white text-primary shadow-md flex items-center justify-center backdrop-blur transition"
          >
            <PrevIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label={t("carousel.next")}
            data-testid="button-carousel-next"
            className="absolute z-20 top-1/2 -translate-y-1/2 end-3 md:end-6 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/85 hover:bg-white text-primary shadow-md flex items-center justify-center backdrop-blur transition"
          >
            <NextIcon className="w-5 h-5" />
          </button>

          <div className="absolute z-20 bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  setIndex(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "bg-white w-6" : "bg-white/60 w-1.5"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

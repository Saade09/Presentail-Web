import { useEffect, useRef } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { Link } from "wouter";
import { buildCatalogImageSrcset } from "@/lib/imageUtils";
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  Cake,
  Heart,
  Trophy,
  Baby,
  Flower,
  PartyPopper,
  Candy,
  ShoppingBasket,
  Tv,
  Gamepad2,
  Wine,
  Leaf,
  Sparkles,
  HandHeart,
  type LucideIcon,
} from "lucide-react";
import { getHomepageIconName, type HomepageIconName } from "@workspace/homepage-icons";

const ICON_FOR_NAME: Record<HomepageIconName, LucideIcon> = {
  gift: Gift,
  cake: Cake,
  heart: Heart,
  trophy: Trophy,
  baby: Baby,
  flower: Flower,
  // lucide has no balloon icon; party-popper conveys the same celebratory feel.
  balloon: PartyPopper,
  candy: Candy,
  basket: ShoppingBasket,
  // lucide has no teddy-bear icon; fall back to the generic gift glyph.
  "teddy-bear": Gift,
  tv: Tv,
  gamepad: Gamepad2,
  wine: Wine,
  leaf: Leaf,
  sparkles: Sparkles,
  "hand-heart": HandHeart,
};

export type CircularCarouselItem = {
  id: string;
  label: string;
  slug?: string;
  imageUrl: string;
  fallbackImageUrl?: string;
  href: string;
  /** Optional click callback; called before navigation for analytics. */
  onClick?: () => void;
};

type Props = {
  title: string;
  items: CircularCarouselItem[];
  isLoading?: boolean;
  testId?: string;
  className?: string;
};

// Reusable circular-card carousel used by both the "Categories" and
// "Occasions" homepage rows. Desktop renders left/right arrow buttons that
// scroll the track by roughly two cards; mobile hides the arrows and relies
// on native scroll-snap. While loading we render a row of skeleton circles
// so the layout doesn't shift when data arrives.
export function CircularCollectionCarousel({ title, items, isLoading, testId, className }: Props) {
  const { t } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const cardWidthRef = useRef<number>(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        cardWidthRef.current = entry.contentRect.width;
      }
    });

    const firstCard = el.querySelector<HTMLElement>("[data-carousel-card]");
    if (firstCard) {
      ro.observe(firstCard);
    }

    return () => {
      ro.disconnect();
    };
  }, [items.length, isLoading]);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const step = ((cardWidthRef.current > 0 ? cardWidthRef.current : 112) + 16) * 2;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className={`py-6 md:py-14 px-4 md:px-0${className ? ` ${className}` : ""}`} data-testid={testId}>
        <div className="flex items-center justify-between mb-5 md:mb-7">
          <h2 className="font-serif text-2xl md:text-4xl text-primary">{title}</h2>
          <div className="hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label={t("common.scrollLeft")}
              className="w-10 h-10 rounded-full border border-primary/30 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
              data-testid={`${testId ?? "carousel"}-prev`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label={t("common.scrollRight")}
              className="w-10 h-10 rounded-full border border-primary/30 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors"
              data-testid={`${testId ?? "carousel"}-next`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={trackRef}
          className="flex gap-4 md:gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array(6)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 snap-start flex flex-col items-center gap-2"
                    data-carousel-card
                  >
                    <div className="w-[5.5rem] h-[5.5rem] md:w-[8.5rem] md:h-[8.5rem] rounded-full animate-shimmer" />
                    <div className="h-4 w-16 rounded animate-shimmer" />
                  </div>
                ))
            : items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={item.onClick}
                  className="flex-shrink-0 snap-start flex flex-col items-center gap-2 group"
                  data-carousel-card
                  data-testid={`carousel-item-${item.id}`}
                >
                  <div
                    className="w-[5.5rem] h-[5.5rem] md:w-[8.5rem] md:h-[8.5rem] rounded-full overflow-hidden flex items-center justify-center bg-gray-100"
                  >
                    {item.imageUrl ? (
                      (() => {
                        // Circular carousel items are 88 px on mobile and 136 px on desktop.
                        // Card srcset (144/288/480w) covers up to 3.4× the largest slot.
                        const catalogSrcset = buildCatalogImageSrcset(
                          item.imageUrl,
                          "(min-width: 768px) 136px, 88px",
                        );
                        return (
                          <img
                            src={catalogSrcset?.src ?? item.imageUrl}
                            alt={item.label}
                            loading="lazy"
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                            {...(catalogSrcset
                              ? { srcSet: catalogSrcset.srcset, sizes: catalogSrcset.sizes }
                              : {})}
                            onError={item.fallbackImageUrl ? (e) => {
                              const img = e.currentTarget;
                              if (img.src !== item.fallbackImageUrl) {
                                // Clear srcset/sizes before swapping src so the
                                // browser uses the fallback URL and ignores the
                                // stale responsive candidates.
                                img.srcset = "";
                                img.sizes = "";
                                img.src = item.fallbackImageUrl!;
                              }
                            } : undefined}
                          />
                        );
                      })()
                    ) : (
                      (() => {
                        const Icon = ICON_FOR_NAME[getHomepageIconName(item.slug, item.label)];
                        return <Icon className="w-6 h-6 md:w-8 md:h-8 text-primary/40" strokeWidth={1.5} />;
                      })()
                    )}
                  </div>
                  <span className="font-serif text-xs md:text-sm text-primary text-center max-w-[5.5rem] md:max-w-[8.5rem] line-clamp-2 leading-tight">
                    {item.label}
                  </span>
                </Link>
              ))}
        </div>
    </section>
  );
}

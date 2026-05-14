import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/queries";

type Props = {
  title: string;
  viewAllHref?: string;
  products: Product[];
  isLoading?: boolean;
  testId?: string;
};

export function ProductCollectionCarousel({
  title,
  viewAllHref,
  products,
  isLoading,
  testId,
}: Props) {
  const { t, dir } = useLocale();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateNav = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = Math.abs(el.scrollLeft);
    const epsilon = 4;
    setCanPrev(left > epsilon);
    setCanNext(left < max - epsilon);
  };

  useEffect(() => {
    updateNav();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    window.addEventListener("resize", updateNav);
    return () => {
      el.removeEventListener("scroll", updateNav);
      window.removeEventListener("resize", updateNav);
    };
  }, [products.length, isLoading]);

  const scrollByDir = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-collection-card]");
    const step = card ? card.offsetWidth + 24 : track.clientWidth * 0.8;
    const sign = dir === "rtl" ? -direction : direction;
    track.scrollBy({ left: sign * step, behavior: "smooth" });
  };

  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  if (!isLoading && products.length === 0) return null;

  return (
    <section className="py-10 md:py-14" data-testid={testId}>
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-6 md:mb-8">
          <h2 className="font-serif text-2xl md:text-4xl text-primary">{title}</h2>
          <div className="flex items-center gap-3 md:gap-4">
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="text-sm font-medium text-primary hover:text-gold transition-colors"
                data-testid={`${testId ?? "collection"}-view-all`}
              >
                {t("bestSellers.viewAll")}
              </Link>
            )}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollByDir(-1)}
                aria-label={t("carousel.prev")}
                disabled={!canPrev}
                className="w-10 h-10 rounded-full border border-primary/30 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-primary"
                data-testid={`${testId ?? "collection"}-prev`}
              >
                <PrevIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByDir(1)}
                aria-label={t("carousel.next")}
                disabled={!canNext}
                className="w-10 h-10 rounded-full border border-primary/30 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-primary"
                data-testid={`${testId ?? "collection"}-next`}
              >
                <NextIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array(4)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    data-collection-card
                    className="flex-shrink-0 snap-start w-[78%] sm:w-[42%] md:w-[calc((100%-4.5rem)/4)] animate-pulse"
                  >
                    <div className="aspect-square bg-muted rounded-2xl mb-4" />
                    <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                  </div>
                ))
            : products.map((p, i) => (
                <div
                  key={p.id}
                  data-collection-card
                  className="flex-shrink-0 snap-start w-[78%] sm:w-[42%] md:w-[calc((100%-4.5rem)/4)]"
                >
                  <ProductCard product={p} index={i} />
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

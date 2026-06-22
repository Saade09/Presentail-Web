import { useState } from "react";
import { Heart, Maximize2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { ProductLightbox } from "./ProductLightbox";
import { buildOsImageSrcset, buildOsProxyUrl } from "@/lib/imageUtils";

type Props = {
  images: { uri: string }[];
  productName: string;
  onShare?: () => void;
  onFavorite?: () => void;
  isFavorited?: boolean;
};

export function ProductGallery({ images, productName, onShare, onFavorite, isFavorited }: Props) {
  const { t } = useLocale();
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const list = images.length > 0 ? images : [{ uri: "" }];
  const current = list[Math.min(active, list.length - 1)];
  const handleExpand = () => {
    if (current?.uri) setLightboxOpen(true);
  };

  const mainImageResponsive = current?.uri ? buildOsImageSrcset(current.uri, "(max-width: 768px) 100vw, 50vw") : null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Desktop: thumbnails left + main image right; Mobile: main image top + thumbnails below */}
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Vertical thumbnail strip — shown on desktop to the left, on mobile below (via order) */}
        {list.length > 1 && (
          <div
            className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto md:overflow-x-hidden md:w-20 shrink-0 order-2 md:order-1"
            data-testid="product-gallery-thumbnails"
          >
            {list.map((img, i) => (
              <button
                key={`${img.uri}-${i}`}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "shrink-0 w-20 h-20 rounded-2xl overflow-hidden bg-secondary/40 border-2 transition-colors",
                  i === active ? "border-primary" : "border-transparent",
                )}
                aria-label={`Show image ${i + 1}`}
                data-testid={`product-gallery-thumb-${i}`}
              >
                {img.uri ? (
                  <img
                    src={buildOsProxyUrl(img.uri, 160)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Main image */}
        <div className="relative flex-1 bg-secondary/40 rounded-3xl overflow-hidden order-1 md:order-2 aspect-square">
          {current.uri ? (
            <img
              src={mainImageResponsive?.src ?? current.uri}
              alt={productName}
              className="w-full h-full object-cover cursor-zoom-in"
              loading="eager"
              fetchPriority="high"
              {...(mainImageResponsive ? { srcSet: mainImageResponsive.srcset, sizes: mainImageResponsive.sizes } : {})}
              onClick={handleExpand}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground font-serif text-4xl">
              Presentail
            </div>
          )}

          <div className="absolute top-4 right-4 flex flex-col gap-2">
            {onFavorite && (
              <button
                type="button"
                onClick={onFavorite}
                className="w-10 h-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center shadow-sm hover:bg-background transition-colors"
                aria-label={isFavorited ? "Remove from favorites" : "Save to favorites"}
                data-testid="button-favorite-detail"
              >
                <Heart
                  className={`w-4 h-4 transition-colors duration-200 ${
                    isFavorited ? "fill-rose-500 text-rose-500" : "text-foreground"
                  }`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={onShare}
              className="w-10 h-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground shadow-sm hover:bg-background transition-colors"
              aria-label={t("product.share.aria")}
              data-testid="button-product-share"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleExpand}
            className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground shadow-sm hover:bg-background transition-colors"
            aria-label={t("product.expandImage")}
            data-testid="button-product-expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ProductLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={list}
        initialIndex={active}
        productName={productName}
      />
    </div>
  );
}

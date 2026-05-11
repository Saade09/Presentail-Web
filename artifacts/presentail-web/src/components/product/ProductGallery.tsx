import { useState } from "react";
import { Maximize2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { ProductLightbox } from "./ProductLightbox";

type Props = {
  images: { uri: string }[];
  productName: string;
  onShare?: () => void;
};

export function ProductGallery({ images, productName, onShare }: Props) {
  const { t } = useLocale();
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const list = images.length > 0 ? images : [{ uri: "" }];
  const current = list[Math.min(active, list.length - 1)];
  const handleExpand = () => {
    if (current?.uri) setLightboxOpen(true);
  };

  return (
    <div className="flex flex-col-reverse md:flex-row gap-4">
      {list.length > 1 && (
        <div
          className="flex md:flex-col gap-3 overflow-x-auto md:overflow-visible md:w-20 shrink-0"
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
                <img src={img.uri} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1 bg-secondary/40 rounded-3xl overflow-hidden aspect-square">
        {current.uri ? (
          <img
            src={current.uri}
            alt={productName}
            className="w-full h-full object-cover cursor-zoom-in"
            onClick={handleExpand}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-serif text-4xl">
            Presentail
          </div>
        )}

        <button
          type="button"
          onClick={onShare}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground shadow-sm hover:bg-background transition-colors"
          aria-label={t("product.share.aria")}
          data-testid="button-product-share"
        >
          <Share2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleExpand}
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground shadow-sm hover:bg-background transition-colors"
          aria-label="Expand image"
          data-testid="button-product-expand"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
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

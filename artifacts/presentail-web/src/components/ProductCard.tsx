import { Product } from "@/lib/queries";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ShimmerImage } from "./ShimmerImage";
import { SalePrice, isDiscountActive } from "./SalePrice";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { prefetchProps } from "@/lib/prefetch";
import { loadProductDetail } from "@/lib/pageLoaders";
import { useLocale } from "@/contexts/LocaleContext";

export function ProductCard({
  product,
  index = 0,
  imageClassName,
}: {
  product: Product;
  index?: number;
  imageClassName?: string;
}) {
  const imageUrl = product.image?.uri;
  const tag = product.tag;
  const { currencyCode } = useDisplayCurrency();
  const { t } = useLocale();

  const isPriority = index < 4;
  const onSale = isDiscountActive(currencyCode, product.discountPriceValue, product.discountPriceAed);

  const discountPct =
    onSale && product.discountPriceValue != null && product.priceValue > 0
      ? Math.min(99, Math.max(1, Math.round((1 - product.discountPriceValue / product.priceValue) * 100)))
      : null;

  return (
    <motion.div
      initial={isPriority ? false : { opacity: 0, y: 20 }}
      animate={isPriority ? undefined : { opacity: 1, y: 0 }}
      transition={isPriority ? undefined : { duration: 0.5, delay: index * 0.1 }}
      className="group relative"
      data-testid={`card-product-${product.id}`}
    >
      <Link href={`/product/${product.id}`} {...prefetchProps(loadProductDetail)}>
        <div
          className={`aspect-square overflow-hidden relative mb-3 ${imageClassName ?? "rounded-xl"}`}
          style={{ backgroundColor: "#f4f4f5" }}
        >
          {imageUrl ? (
            <ShimmerImage
              src={imageUrl}
              alt={product.name}
              className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
              sizes="(max-width: 640px) 45vw, (max-width: 768px) 33vw, 25vw"
              priority={index < 4}
              fallback={
                // contrast-ok: decorative placeholder shown only when image fails to load
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif text-2xl">
                  P
                </div>
              }
            />
          ) : (
            // contrast-ok: decorative placeholder shown only when no image is available
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif text-2xl">
              P
            </div>
          )}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {tag && (
              <div className="text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wider" style={{ backgroundColor: "#00414e" }}>
                {tag}
              </div>
            )}
            {onSale && discountPct != null && (
              <div className="text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wider" style={{ backgroundColor: "#00414e" }}>
                -{discountPct}%
              </div>
            )}
            {product.isBestSeller && (
              <div className="text-white text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wider" style={{ backgroundColor: "#00414e" }}>
                {t("product.badge.bestSeller")}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-0.5">
          <h3 className="font-serif text-base line-clamp-2 min-h-[3rem] leading-snug">{product.name}</h3>
          <p className="text-muted-foreground text-sm font-medium">
            <SalePrice
              priceValue={product.priceValue}
              discountPriceValue={product.discountPriceValue}
              discountPriceAed={product.discountPriceAed}
            />
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

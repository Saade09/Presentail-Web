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
        <div className={`aspect-square bg-secondary/50 overflow-hidden relative mb-4 ${imageClassName ?? "rounded-xl"}`}>
          {imageUrl ? (
            <ShimmerImage
              src={imageUrl}
              alt={product.name}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
          <div className="absolute top-4 left-4 flex flex-col gap-1">
            {tag && (
              <div className="bg-background/90 backdrop-blur text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wider">
                {tag}
              </div>
            )}
            {onSale && discountPct != null && (
              <div className="text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wider" style={{ backgroundColor: "#00414e" }}>
                -{discountPct}%
              </div>
            )}
            {product.isBestSeller && (
              <div className="text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wider" style={{ backgroundColor: "#00414e" }}>
                {t("product.badge.bestSeller")}
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-lg line-clamp-1">{product.name}</h3>
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

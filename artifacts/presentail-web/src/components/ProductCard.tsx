import { Product } from "@/lib/queries";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ShimmerImage } from "./ShimmerImage";
import { FormattedPrice } from "./FormattedPrice";
import { prefetchProps } from "@/lib/prefetch";
import { loadProductDetail } from "@/lib/pageLoaders";

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

  const isPriority = index < 4;

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
              priority={index < 4}
              fallback={
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif text-2xl">
                  P
                </div>
              }
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif text-2xl">
              P
            </div>
          )}
          {tag && (
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wider">
              {tag}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-lg line-clamp-1">{product.name}</h3>
          <p className="text-muted-foreground text-sm font-medium"><FormattedPrice usdValue={product.priceValue} /></p>
        </div>
      </Link>
    </motion.div>
  );
}

import { Product, useCatalogMetadata } from "@/lib/queries";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { catalogAssetUrl } from "@/lib/catalogAssets";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useLocationSelection } from "@/contexts/LocationContext";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { formatPrice } = useDisplayCurrency();
  const { data: catalog } = useCatalogMetadata();
  const { isSignedIn } = useClerkAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { countryCode } = useLocationSelection();
  const fallback = catalog?.products?.find((p) => p.id === product.id);
  const imageUrl = product.image?.uri || catalogAssetUrl(fallback?.image ?? null);
  const tag = product.tag ?? fallback?.tag;
  const favorited = isFavorited(product.id);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleFavorite(product.id, countryCode ?? null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative"
      data-testid={`card-product-${product.id}`}
    >
      <Link href={`/product/${product.id}`}>
        <div className="aspect-square bg-secondary/50 rounded-2xl overflow-hidden relative mb-4">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
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
          {isSignedIn && (
            <button
              type="button"
              onClick={handleHeartClick}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/25 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-200"
              aria-label={favorited ? "Remove from favorites" : "Save to favorites"}
              data-testid={`button-favorite-card-${product.id}`}
            >
              <Heart
                className={`w-4 h-4 transition-colors duration-200 ${
                  favorited ? "fill-rose-500 text-rose-500" : "text-white"
                }`}
              />
            </button>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-lg line-clamp-1">{product.name}</h3>
          <p className="text-muted-foreground text-sm font-medium">{formatPrice(product.priceValue)}</p>
        </div>
      </Link>
    </motion.div>
  );
}

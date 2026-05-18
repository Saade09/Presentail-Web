import { useMemo } from "react";
import { Link } from "wouter";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";

export default function Favorites() {
  const { favorites, isLoaded } = useFavorites();
  const { language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const queryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) queryParams.countryCode = countryCode;
  if (cityId) queryParams.cityId = cityId;

  const { data, isLoading } = useProducts(queryParams, isLoaded && favorites.size > 0);

  const favoriteProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter((p) => favorites.has(p.id));
  }, [data, favorites]);

  return (
    <div className="min-h-screen pt-24 pb-24">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="flex items-center gap-3 mb-12 pb-8 border-b">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
          <h1 className="text-4xl md:text-5xl font-serif">Favorites</h1>
        </div>

        {!isLoaded || isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-2xl" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </div>
        ) : favoriteProducts.length === 0 ? (
          <div className="text-center py-24 bg-muted/30 rounded-2xl border border-dashed">
            <Heart className="w-12 h-12 mx-auto mb-6 text-muted-foreground/40" />
            <h3 className="font-serif text-2xl mb-3">No favorites yet</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              Tap the heart on any product to save it here for later.
            </p>
            <Button asChild variant="outline">
              <Link href="/shop">Browse the Collection</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
            {favoriteProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

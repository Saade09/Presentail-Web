import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Heart, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useProducts } from "@/lib/queries";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function Favorites() {
  const { favorites, isLoaded } = useFavorites();
  const { language, t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const queryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) queryParams.countryCode = countryCode;
  if (cityId) queryParams.cityId = cityId;

  const { data, isLoading } = useProducts(queryParams, isLoaded && favorites.size > 0);

  const { getToken } = useAuth();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/me/favorites/share", {
        method: "POST",
        headers,
        credentials: "include",
      });
      const data = await res.json() as { ok: boolean; url?: string; message?: string };
      if (!data.ok || !data.url) {
        throw new Error(data.message ?? t("favorites.couldNotShare"));
      }
      const shareUrl = data.url;
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "My gift wishlist", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        toast({ title: "Link copied!", description: "Share it with anyone to show your favorites." });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Couldn't create share link", description: err.message, variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  }

  const favoriteProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter((p) => favorites.has(p.id));
  }, [data, favorites]);

  return (
    <div className="min-h-screen pt-12 pb-24">
      <div className="container mx-auto px-4 max-w-content">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-12">
          <div className="flex items-center gap-3 flex-1">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500 flex-shrink-0" />
            <h1 className="text-4xl md:text-5xl font-serif">{t("account.favorites")}</h1>
          </div>
          {favoriteProducts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 self-start sm:self-auto"
              onClick={handleShare}
              disabled={sharing}
            >
              {shared ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  {t("favorites.linkCopied")}
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  {t("favorites.shareMyList")}
                </>
              )}
            </Button>
          )}
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
            {/* contrast-ok: decorative empty-state illustration icon, not informational text */}
            <Heart className="w-12 h-12 mx-auto mb-6 text-muted-foreground/40" />
            <h3 className="font-serif text-2xl mb-3">{t("account.favorites.empty")}</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              {t("account.favorites.emptyDesc")}
            </p>
            <Button asChild variant="outline">
              <Link href="/shop">{t("favorites.browseCollection")}</Link>
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

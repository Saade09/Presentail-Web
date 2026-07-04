import { useMemo } from "react";
import { Link } from "wouter";
import { Heart, ExternalLink } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { useProducts } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";

interface SharedFavoritesProps {
  token: string;
}

interface SharedFavoritesData {
  ok: boolean;
  favorites: Array<{ productSlug: string; countryCode: string | null }>;
  expiresAt: string;
}

function useSharedFavorites(token: string) {
  return useQuery<SharedFavoritesData>({
    queryKey: ["sharedFavorites", token],
    queryFn: async () => {
      const res = await fetch(`/api/favorites/share/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Not found"); // i18n-ignore
      }
      return res.json() as Promise<SharedFavoritesData>;
    },
    enabled: Boolean(token),
    retry: false,
  });
}

export default function SharedFavorites({ token }: SharedFavoritesProps) {
  const { t } = useLocale();
  const { data: shareData, isLoading: shareLoading, isError } = useSharedFavorites(token);

  const slugSet = useMemo(
    () => new Set((shareData?.favorites ?? []).map((f) => f.productSlug)),
    [shareData],
  );

  const { data: productsData, isLoading: productsLoading } = useProducts(
    {},
    !shareLoading && !isError && slugSet.size > 0,
  );

  const favoriteProducts = useMemo(() => {
    if (!productsData?.products) return [];
    return productsData.products.filter((p) => slugSet.has(p.id));
  }, [productsData, slugSet]);

  const isLoading = shareLoading || (slugSet.size > 0 && productsLoading);

  if (isError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        {/* contrast-ok: decorative error-state illustration icon, aria-hidden="true" */}
        <Heart className="w-12 h-12 text-muted-foreground/30 mb-6" aria-hidden="true" />
        <h1 className="font-serif text-3xl mb-3">{t("sharedFavorites.unavailableTitle")}</h1>
        <p className="text-muted-foreground mb-8 max-w-sm">
          {t("sharedFavorites.unavailableDesc")}
        </p>
        <Button asChild variant="outline">
          <Link href="/">{t("sharedFavorites.discoverLink")}</Link>
        </Button>
      </main>
    );
  }

  const expiresAt = shareData?.expiresAt
    ? new Date(shareData.expiresAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-4 flex items-center gap-3">
        <Link href="/" className="font-serif text-xl tracking-wide hover:opacity-70 transition-opacity">
          {t("nav.logoAria")}
        </Link>
      </header>

      <div className="container mx-auto px-4 max-w-content pt-12">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-10">
          <div className="flex items-center gap-3 flex-1">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500 flex-shrink-0" />
            <div>
              <h1 className="text-3xl md:text-4xl font-serif">{t("sharedFavorites.title")}</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {t("sharedFavorites.subtitle")}
                {expiresAt && (
                  <span className="ml-1">{t("sharedFavorites.expiresPrefix")} {expiresAt}</span>
                )}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="self-start sm:self-auto gap-2">
            <Link href="/">
              <ExternalLink className="w-4 h-4" />
              {t("sharedFavorites.shopLink")}
            </Link>
          </Button>
        </div>

        {isLoading ? (
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
            <h3 className="font-serif text-2xl mb-3">{t("sharedFavorites.emptyTitle")}</h3>
            <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
              {t("sharedFavorites.emptyDesc")}
            </p>
            <Button asChild variant="outline">
              <Link href="/">{t("favorites.browseCollection")}</Link>
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
    </main>
  );
}

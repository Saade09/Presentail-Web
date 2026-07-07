import {
  useGetFrequentlyBoughtTogether,
  getGetFrequentlyBoughtTogetherQueryKey,
} from "@workspace/api-client-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useCart } from "@/contexts/CartContext";
import { FormattedPrice } from "@/components/FormattedPrice";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/queries";
import type { FrequentlyBoughtTogetherProduct } from "@workspace/api-client-react";

function countryToStore(
  countryCode: string | null | undefined,
  cityId: string | null | undefined,
): "lebanon" | "dubai" | "abudhabi" | "cyprus" {
  if (!countryCode) return "lebanon";
  if (countryCode === "CY") return "cyprus";
  if (countryCode === "AE") {
    if (cityId?.includes("abudhabi")) return "abudhabi";
    return "dubai";
  }
  return "lebanon";
}

function adaptProduct(p: FrequentlyBoughtTogetherProduct): Product {
  const firstImage = p.images?.[0]?.uri;
  return {
    id: p.slug,
    wcId: 0,
    name: p.name,
    price: String(p.price),
    priceValue: p.priceValue ?? p.price,
    image: firstImage ? { uri: firstImage } : null,
    images: p.images,
    category: p.category,
    categories: [p.category],
    occasions: [],
    inStock: p.inStock,
    discountPriceValue: p.discountPriceValue ?? null,
    discountPriceAed: p.discountPriceAed ?? null,
  };
}

interface Props {
  slug: string;
  anchor: Product;
}

export function FrequentlyBoughtTogether({ slug, anchor }: Props) {
  const { t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const { addItem } = useCart();
  const store = countryToStore(countryCode, cityId);

  const params = { slug, store };
  const { data } = useGetFrequentlyBoughtTogether(params, {
    query: {
      queryKey: getGetFrequentlyBoughtTogetherQueryKey(params),
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  });

  const complements = (data?.products ?? []).map(adaptProduct);
  if (complements.length === 0) return null;

  const anchorImage = anchor.image?.uri ?? anchor.images?.[0]?.uri;
  const anchorPrice = anchor.discountPriceValue ?? anchor.priceValue;

  return (
    <section className="container mx-auto px-page max-w-content pt-8 pb-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">
        {t("product.frequentlyBoughtTogether")}
      </h2>

      <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
        {complements.map((complement) => {
          const complementImage = complement.image?.uri ?? complement.images?.[0]?.uri;
          const complementPrice = complement.discountPriceValue ?? complement.priceValue;
          const combinedPrice = anchorPrice + complementPrice;

          return (
            <div
              key={complement.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:max-w-sm w-full"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  {anchorImage ? (
                    <img
                      src={anchorImage}
                      alt={anchor.name}
                      className="w-20 h-20 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-muted" />
                  )}
                  <span className="text-xs text-foreground font-medium text-center leading-tight line-clamp-2 w-20">
                    {anchor.name}
                  </span>
                </div>

                <span className="text-lg font-bold text-muted-foreground flex-shrink-0">+</span>

                <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                  {complementImage ? (
                    <img
                      src={complementImage}
                      alt={complement.name}
                      className="w-20 h-20 object-cover rounded-xl"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-muted" />
                  )}
                  <span className="text-xs text-foreground font-medium text-center leading-tight line-clamp-2 w-20">
                    {complement.name}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                className="w-full text-xs tracking-wide"
                disabled={!anchor.inStock || !complement.inStock}
                onClick={() => {
                  addItem(anchor, 1);
                  addItem(complement, 1);
                }}
              >
                {(() => {
                  const label = t("product.addBothToCart");
                  const [before, after] = label.split("{price}");
                  return (
                    <>
                      {before}
                      <FormattedPrice usdValue={combinedPrice} className="mx-0.5" />
                      {after}
                    </>
                  );
                })()}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

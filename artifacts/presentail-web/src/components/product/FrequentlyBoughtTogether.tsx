import { useState, useEffect } from "react";
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
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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

function effectivePrice(p: Product): number {
  return p.discountPriceValue ?? p.priceValue;
}

interface FBTItemState {
  checked: boolean;
  qty: number;
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

  const [selections, setSelections] = useState<Record<string, FBTItemState>>({});

  useEffect(() => {
    if (complements.length === 0) return;
    const initial: Record<string, FBTItemState> = {};
    for (const c of complements) {
      initial[c.id] = { checked: false, qty: 1 };
    }
    setSelections(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (complements.length === 0) return null;

  const anchorPrice = effectivePrice(anchor);
  const anchorImage = anchor.image?.uri ?? anchor.images?.[0]?.uri;

  const selectedComplements = complements.filter((c) => selections[c.id]?.checked && c.inStock);
  const total =
    anchorPrice +
    selectedComplements.reduce((sum, c) => sum + effectivePrice(c) * (selections[c.id]?.qty ?? 1), 0);
  const totalItems = 1 + selectedComplements.reduce((sum, c) => sum + (selections[c.id]?.qty ?? 1), 0);

  function toggle(id: string) {
    setSelections((prev) => ({
      ...prev,
      [id]: { checked: !prev[id]?.checked, qty: prev[id]?.qty ?? 1 },
    }));
  }

  function changeQty(id: string, delta: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelections((prev) => {
      const current = prev[id] ?? { checked: true, qty: 1 };
      return { ...prev, [id]: { ...current, qty: Math.max(1, current.qty + delta) } };
    });
  }

  function handleAddSelected() {
    addItem(anchor, 1);
    for (const c of selectedComplements) {
      addItem(c, selections[c.id]?.qty ?? 1);
    }
  }

  return (
    <section className="container mx-auto px-page max-w-content pt-8 pb-6">
      <div className="rounded-2xl border border-border bg-secondary/20 px-5 py-6">
      <div className="py-3 text-sm font-sans font-semibold uppercase tracking-[0.14em] text-foreground border-b-2 border-foreground mb-5 self-start inline-block">
        {t("product.frequentlyBoughtTogether")}
      </div>

      {/* Scrollable card row — centered when cards fit, scrollable when they don't */}
      <div className="flex gap-3 overflow-x-auto pb-3 justify-center snap-x snap-mandatory scroll-smooth scrollbar-none">

        {/* Anchor card — always selected, qty locked at 1 */}
        <div className="snap-start shrink-0 w-36 sm:w-40 flex flex-col items-center gap-2 rounded-2xl border-2 border-foreground bg-card p-3">
          <div className="relative w-full">
            <div className="aspect-square rounded-xl overflow-hidden bg-secondary/40 w-full">
              {anchorImage ? (
                <img src={anchorImage} alt={anchor.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
            <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-foreground flex items-center justify-center">
              <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-background stroke-[2.5]">
                <polyline points="1.5,6 4.5,9 10.5,3" />
              </svg>
            </div>
          </div>
          <p className="text-xs font-medium text-foreground text-center leading-tight line-clamp-2 w-full min-h-[2.5rem]">
            {anchor.name}
          </p>
          <FormattedPrice usdValue={anchorPrice} className="text-xs font-semibold text-foreground" />
          <div className="flex items-center gap-1.5 opacity-30">
            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center"><Minus className="w-3 h-3" /></div>
            <span className="text-xs font-medium w-4 text-center">1</span>
            <div className="w-6 h-6 rounded-full border border-border flex items-center justify-center"><Plus className="w-3 h-3" /></div>
          </div>
        </div>

        {/* Complement cards */}
        {complements.map((c) => {
          const sel = selections[c.id] ?? { checked: true, qty: 1 };
          const img = c.image?.uri ?? c.images?.[0]?.uri;
          return (
            <div
              key={c.id}
              className={cn(
                "snap-start shrink-0 w-36 sm:w-40 flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all select-none",
                !c.inStock && "opacity-50",
                sel.checked && c.inStock ? "border-foreground bg-card" : "border-border bg-card/60",
              )}
            >
              <label
                htmlFor={`fbt-select-${c.id}`}
                className={cn("flex w-full flex-col items-center gap-2", c.inStock ? "cursor-pointer" : "cursor-not-allowed")}
              >
                <div className="relative w-full">
                  <div className="aspect-square rounded-xl overflow-hidden bg-secondary/40 w-full">
                    {img ? (
                      <img src={img} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" />
                    )}
                  </div>
                  <input
                    id={`fbt-select-${c.id}`}
                    data-testid={`checkbox-fbt-product-${c.id}`}
                    type="checkbox"
                    checked={sel.checked && c.inStock}
                    disabled={!c.inStock}
                    onChange={() => toggle(c.id)}
                    className="absolute top-1.5 left-1.5 z-10 h-5 w-5 cursor-pointer appearance-none rounded-full border-2 border-transparent bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                  />
                  <div className={cn(
                    "absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                    sel.checked && c.inStock ? "bg-foreground border-foreground" : "bg-background border-border",
                  )}>
                    {sel.checked && c.inStock && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3 fill-none stroke-background stroke-[2.5]">
                        <polyline points="1.5,6 4.5,9 10.5,3" />
                      </svg>
                    )}
                  </div>
                  {!c.inStock && (
                    <div className="absolute inset-0 rounded-xl bg-background/50 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 text-center">{t("product.outOfStock")}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs font-medium text-foreground text-center leading-tight line-clamp-2 w-full min-h-[2.5rem]">
                  {c.name}
                </span>
                <FormattedPrice usdValue={effectivePrice(c)} className="text-xs font-semibold text-foreground" />
              </label>
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={(e) => changeQty(c.id, -1, e)}
                  disabled={!sel.checked || sel.qty <= 1}
                  className="w-6 h-6 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
                  aria-label="decrease" // i18n-ignore
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-xs font-medium w-4 text-center">{sel.qty}</span>
                <button
                  onClick={(e) => changeQty(c.id, 1, e)}
                  disabled={!sel.checked}
                  className="w-6 h-6 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"
                  aria-label="increase" // i18n-ignore
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: total + CTA */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 pt-4 border-t border-border">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground uppercase tracking-widest">{t("product.fbt.total")}</span>
          <FormattedPrice usdValue={total} className="text-lg font-serif font-medium text-foreground" />
          <span className="text-xs text-muted-foreground">
            ({totalItems} {t("product.fbt.items")})
          </span>
        </div>
        <Button
          size="lg"
          className="sm:ml-auto"
          disabled={!anchor.inStock}
          onClick={handleAddSelected}
        >
          {t("product.fbt.addSelected")}
        </Button>
      </div>
      </div>
    </section>
  );
}

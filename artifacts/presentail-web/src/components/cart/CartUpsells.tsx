import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useProducts } from "@/lib/queries";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ResolvedUpsellTab,
  type ResolvedUpsellProduct,
  type UpsellTabId,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";

const SKELETON_COUNT = 4;

function CartUpsellsSkeleton() {
  return (
    <section className="mt-12 pt-8 border-t border-primary/10">
      <Skeleton className="h-8 w-40 mb-6" />
      <div className="flex gap-6 pb-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-4 w-20" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border border-primary/10 flex flex-col">
            <Skeleton className="aspect-square w-full" />
            <div className="p-3 flex flex-col gap-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-8 w-full rounded-full mt-1" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function tabLabelKey(id: UpsellTabId): string {
  switch (id) {
    case "recommended":
      return "cart.upsells.tab.recommended";
    case "single_balloons":
      return "cart.upsells.tab.singleBalloons";
    case "balloon_bundles":
      return "cart.upsells.tab.balloonBundles";
    case "chocolate":
      return "cart.upsells.tab.chocolate";
    case "plants":
      return "cart.upsells.tab.plants";
    case "bears":
      return "cart.upsells.tab.bears";
    case "candles":
      return "cart.upsells.tab.candles";
  }
}

export function CartUpsells() {
  const { t, language } = useLocale();
  const { addItem } = useCart();
  const { countryCode, cityId } = useLocationSelection();
  const { toast } = useToast();

  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const { data, isLoading } = useProducts(locParams);
  const products = data?.products ?? [];

  const tabs = useMemo<ResolvedUpsellTab[]>(
    () => resolveUpsellTabs(products),
    [products],
  );

  const [activeId, setActiveId] = useState<UpsellTabId | null>(null);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !tabs.some((tab) => tab.id === activeId)) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  const handleAdd = (product: ResolvedUpsellProduct) => {
    addItem(product, 1);
    toast({
      title: t("product.toast.addedTitle"),
      description: t("product.toast.addedDesc", { name: product.name }),
    });
  };

  if (isLoading) return <CartUpsellsSkeleton />;

  if (tabs.length === 0 || !activeId) return null;

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <section
      className="mt-12 pt-8 border-t border-primary/10"
      data-testid="cart-upsells"
    >
      <h2 className="text-2xl font-serif mb-6">{t("cart.upsells.title")}</h2>

      <div className="flex gap-6 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveId(tab.id)}
              aria-pressed={isActive}
              data-testid={`cart-upsells-tab-${tab.id}`}
              className={`relative whitespace-nowrap pb-2 text-sm transition-colors ${
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-primary"
              }`}
            >
              {t(tabLabelKey(tab.id))}
              {isActive ? (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {active.products.map((product) => {
          return (
            <div
              key={product.id}
              className="group bg-background border border-primary/10 rounded-2xl overflow-hidden flex flex-col"
              data-testid={`cart-upsells-card-${product.id}`}
            >
              <Link href={`/product/${product.id}`}>
                <div className="aspect-square bg-secondary/50 relative overflow-hidden">
                  {product.image?.uri ? (
                    <img
                      src={product.image.uri}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : null}
                </div>
              </Link>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <p className="font-serif text-base text-primary">
                  <FormattedPrice usdValue={Number.isFinite(product.priceValue) ? product.priceValue : 0} />
                </p>
                <Link href={`/product/${product.id}`}>
                  <h3 className="text-xs leading-tight line-clamp-2 min-h-[32px] hover:text-primary transition-colors">
                    {product.name}
                  </h3>
                </Link>
                <button
                  type="button"
                  onClick={() => handleAdd(product)}
                  aria-label={t("cart.upsells.add")}
                  data-testid={`cart-upsells-add-${product.id}`}
                  className="mt-auto w-full bg-primary text-primary-foreground rounded-full py-2 text-[11px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                >
                  {t("cart.upsells.add")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

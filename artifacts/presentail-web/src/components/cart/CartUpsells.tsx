import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useProducts } from "@/lib/queries";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type ResolvedUpsellTab,
  type UpsellTabId,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";
import { UpsellQtyControl } from "@/components/cart/UpsellQtyControl";

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

export function CartUpsells({
  onAvailabilityChange,
}: {
  /** Reports whether the upsells section actually renders content, so callers
   * (e.g. the free-delivery banner's "Shop add-ons" action) can hide
   * affordances that would scroll to nothing. */
  onAvailabilityChange?: (available: boolean) => void;
} = {}) {
  const { t, language } = useLocale();
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

  const available = !isLoading && tabs.length > 0;
  useEffect(() => {
    onAvailabilityChange?.(available);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);
  useEffect(() => {
    return () => onAvailabilityChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFirstAdd = (product: { name: string }) => {
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
      id="cart-upsells"
      className="mt-12 pt-8 border-t border-primary/10 scroll-mt-24"
      data-testid="cart-upsells"
    >
      <h2 className="text-2xl font-serif">{t("cart.upsells.title")}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-5">{t("cart.upsells.subtitle")}</p>

      <div
        role="tablist"
        aria-label={t("cart.upsells.tabsLabel")}
        className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none mb-6"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              id={`cart-upsells-tab-btn-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="cart-upsells-panel"
              onClick={() => setActiveId(tab.id)}
              data-testid={`cart-upsells-tab-${tab.id}`}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
                isActive
                  ? "bg-primary text-white border-primary"
                  : "bg-background text-primary border-border hover:border-primary/50"
              }`}
            >
              {t(tabLabelKey(tab.id))}
            </button>
          );
        })}
      </div>

      <div
        id="cart-upsells-panel"
        role="tabpanel"
        aria-labelledby={`cart-upsells-tab-btn-${activeId}`}
        className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      >
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
                <UpsellQtyControl
                  product={product}
                  onFirstAdd={() => handleFirstAdd(product)}
                  data-testid={`cart-upsells-add-${product.id}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

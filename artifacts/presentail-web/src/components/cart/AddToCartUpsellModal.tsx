import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trackEvent } from "@/lib/analytics";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useProducts } from "@/lib/queries";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useToast } from "@/hooks/use-toast";
import {
  type ResolvedUpsellTab,
  type UpsellTabId,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";
import { UpsellQtyControl } from "@/components/cart/UpsellQtyControl";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";

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

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AddToCartUpsellModal({ open, onClose }: Props) {
  const { t, language, dir } = useLocale();
  const { subtotal } = useCart();
  const { countryCode, cityId } = useLocationSelection();
  const { freeDeliveryEnabled } = useDeliveryConfig();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

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

  const handleFirstAdd = (product: { id: string; name: string }) => {
    trackEvent({
      name: "upsell_item_added",
      surface: "upsell_modal",
      action: activeId ?? undefined,
      productId: String(product.id),
    });
    toast({
      title: t("product.toast.addedTitle"),
      description: t("product.toast.addedDesc", { name: product.name }),
    });
  };

  const active = activeId
    ? (tabs.find((tab) => tab.id === activeId) ?? tabs[0])
    : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent
        dir={dir}
        className="z-[70] max-w-2xl w-full p-0 overflow-hidden flex flex-col"
        overlayClassName="z-[70]"
        style={{ maxHeight: "90vh" }}
        closeLabel={t("cart.upsells.modal.close")}
        data-testid="dialog-upsell-modal"
      >
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-primary/10 shrink-0">
          <h2 className="font-serif text-xl text-primary leading-tight">
            {t("cart.upsells.modal.addedTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("cart.upsells.modal.cartTotal")}:{" "}
            <span className="font-semibold text-foreground">
              <FormattedPrice usdValue={subtotal} />
            </span>
          </p>
          {freeDeliveryEnabled && (
            <div className="mt-3">
              <FreeDeliveryBanner subtotal={subtotal} />
            </div>
          )}
        </div>

        {/* ── "Complete your gift" heading + subtitle ── */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <DialogTitle className="font-serif text-xl text-primary">
            {t("cart.upsells.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("cart.upsells.subtitle")}
          </p>
        </div>

        {/* ── Category chip tabs ── */}
        {isLoading && (
          <div className="px-6 pt-2 shrink-0">
            <div className="flex gap-2 pb-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && tabs.length > 0 && (
          <div className="px-6 pt-2 shrink-0">
            <div
              role="tablist"
              aria-label={t("cart.upsells.tabsLabel")}
              className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none"
            >
              {tabs.map((tab) => {
                const isActive = tab.id === activeId;
                return (
                  <button
                    key={tab.id}
                    id={`upsell-modal-tab-btn-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="upsell-modal-panel"
                    onClick={() => {
                      setActiveId(tab.id);
                      trackEvent({
                        name: "upsell_tab_clicked",
                        surface: "upsell_modal",
                        action: tab.id,
                      });
                    }}
                    data-testid={`upsell-modal-tab-${tab.id}`}
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
          </div>
        )}

        {/* ── Product grid ── */}
        <div
          id="upsell-modal-panel"
          role="tabpanel"
          aria-labelledby={activeId ? `upsell-modal-tab-btn-${activeId}` : undefined}
          className="flex-1 overflow-y-auto px-6 py-4 min-h-0"
        >
          {isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-primary/10 flex flex-col">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-7 w-full rounded-full mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : active ? (
            <div className="grid grid-cols-3 gap-3">
              {active.products.map((product) => {
                return (
                  <div
                    key={product.id}
                    className="group bg-background border border-primary/10 rounded-2xl overflow-hidden flex flex-col"
                    data-testid={`upsell-modal-card-${product.id}`}
                  >
                    <Link href={`/product/${product.id}`} onClick={onClose}>
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
                    <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                      <p className="font-serif text-sm text-primary">
                        <FormattedPrice usdValue={Number.isFinite(product.priceValue) ? product.priceValue : 0} />
                      </p>
                      <Link href={`/product/${product.id}`} onClick={onClose}>
                        <h3 className="text-[11px] leading-tight line-clamp-2 min-h-[28px] hover:text-primary transition-colors">
                          {product.name}
                        </h3>
                      </Link>
                      <UpsellQtyControl
                        product={product}
                        onFirstAdd={() => handleFirstAdd(product)}
                        addButtonClassName="mt-auto w-full bg-primary text-primary-foreground rounded-full py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                        data-testid={`upsell-modal-add-${product.id}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── Delivery row ── */}
        <div className="px-6 pb-2 pt-3 border-t border-primary/10 shrink-0">
          <DeliveryDateRow className="mb-0" />
        </div>

        {/* ── Bottom action bar ── */}
        <div className="px-6 py-4 shrink-0 flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={onClose}
            data-testid="upsell-modal-continue-shopping"
          >
            {t("cart.upsells.modal.continueShopping")}
          </Button>
          <Button
            className="flex-1 rounded-full gap-1"
            onClick={() => {
              trackEvent({
                name: "upsell_checkout_proceeded",
                surface: "upsell_modal",
              });
              onClose();
              setLocation("/cart");
            }}
            data-testid="upsell-modal-proceed-checkout"
          >
            {t("cart.viewCart")} · <FormattedPrice usdValue={subtotal} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

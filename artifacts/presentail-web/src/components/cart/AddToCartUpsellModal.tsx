import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Zap } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { useProducts } from "@/lib/queries";
import { useToast } from "@/hooks/use-toast";
import {
  type ResolvedUpsellTab,
  type ResolvedUpsellProduct,
  type UpsellTabId,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";
import { isExpressDeliveryAvailable } from "@workspace/delivery";

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
  const { addItem, subtotal } = useCart();
  const { formatPrice } = useDisplayCurrency();
  const { countryCode, cityId } = useLocationSelection();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const { data } = useProducts(locParams);
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

  const expressAvailable = useMemo(
    () => isExpressDeliveryAvailable(countryCode),
    [countryCode],
  );

  const handleAddUpsell = (product: ResolvedUpsellProduct) => {
    addItem(product, 1);
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
        className="max-w-2xl w-full p-0 overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        closeLabel={t("cart.upsells.modal.close")}
        data-testid="dialog-upsell-modal"
      >
        <div className="px-6 pt-6 pb-4 border-b border-primary/10 shrink-0">
          <DialogTitle className="font-serif text-2xl text-primary">
            {t("cart.upsells.title")}
          </DialogTitle>
        </div>

        {tabs.length > 0 && (
          <div className="px-6 pt-4 shrink-0">
            <div className="flex gap-6 overflow-x-auto pb-3 -mx-2 px-2 scrollbar-none">
              {tabs.map((tab) => {
                const isActive = tab.id === activeId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveId(tab.id)}
                    aria-pressed={isActive}
                    data-testid={`upsell-modal-tab-${tab.id}`}
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
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {active ? (
            <div className="grid grid-cols-3 gap-3">
              {active.products.map((product) => {
                const showExpress = expressAvailable && product.supportsExpress;
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
                        {showExpress ? (
                          <div className="absolute top-2 start-2 inline-flex items-center gap-1 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                            <Zap className="w-2.5 h-2.5" />
                            <span>{t("cart.upsells.express")}</span>
                          </div>
                        ) : null}
                      </div>
                    </Link>
                    <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                      <p className="font-serif text-sm text-primary">
                        {formatPrice(
                          Number.isFinite(product.priceValue)
                            ? product.priceValue
                            : 0,
                        )}
                      </p>
                      <Link href={`/product/${product.id}`} onClick={onClose}>
                        <h3 className="text-[11px] leading-tight line-clamp-2 min-h-[28px] hover:text-primary transition-colors">
                          {product.name}
                        </h3>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleAddUpsell(product)}
                        aria-label={t("cart.upsells.add")}
                        data-testid={`upsell-modal-add-${product.id}`}
                        className="mt-auto w-full bg-primary text-primary-foreground rounded-full py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-colors"
                      >
                        {t("cart.upsells.add")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-primary/10 shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 flex flex-col gap-0.5 text-sm">
            <div className="flex items-center justify-between sm:justify-start sm:gap-2 text-muted-foreground">
              <span>{t("cart.subtotal")}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-start sm:gap-2">
              <span className="font-medium text-primary">{t("cart.total")}</span>
              <span className="font-serif text-base text-primary">{formatPrice(subtotal)}</span>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none rounded-xl"
              onClick={onClose}
              data-testid="upsell-modal-continue-shopping"
            >
              {t("cart.upsells.modal.continueShopping")}
            </Button>
            <Button
              className="flex-1 sm:flex-none rounded-xl"
              onClick={() => {
                onClose();
                setLocation("/checkout");
              }}
              data-testid="upsell-modal-proceed-checkout"
            >
              {t("cart.proceed")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

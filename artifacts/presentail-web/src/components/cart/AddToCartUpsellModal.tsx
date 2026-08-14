import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { trackEvent, trackWebEvent } from "@/lib/analytics";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart, effectivePrice } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { freeDeliveryThresholdUsd as libFreeDeliveryThresholdUsd } from "@workspace/delivery";
import { useProducts, type Product } from "@/lib/queries";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import {
  type ResolvedUpsellProduct,
  type ResolvedUpsellTab,
  type UpsellTabId,
  MODAL_TAB_ORDER,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";
import { FreeDeliveryBanner } from "@/components/cart/FreeDeliveryBanner";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { DeliveryDateRow } from "@/components/delivery/DeliveryDateRow";
import { useDeliveryPromise } from "@/components/delivery/deliveryPromise";

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

/** Number of upsell cards shown per category view. */
const CARDS_PER_VIEW = 3;

type Props = {
  open: boolean;
  onClose: () => void;
  /** The product that was just added — drives the confirmation header. */
  addedProduct?: Product | null;
  /** Quantity just added (defaults to 1). */
  addedQuantity?: number;
};

type AddStatus = "idle" | "loading" | "error";

export function AddToCartUpsellModal({
  open,
  onClose,
  addedProduct = null,
  addedQuantity = 1,
}: Props) {
  const { t, language, dir } = useLocale();
  const { items, subtotal, itemCount, addItem } = useCart();
  const { currencyCode } = useDisplayCurrency();
  const { countryCode, cityId, city: locationCity, country: locationCountry } = useLocationSelection();
  const {
    freeDeliveryEnabled,
    freeDeliveryThresholdUsd: configThresholdUsd,
  } = useDeliveryConfig();
  const promise = useDeliveryPromise();

  // City-specific threshold: OS per-city → OS per-country → delivery-config API → lib fallback.
  // Mirrors the same priority chain used in Cart.tsx so the modal and cart always agree.
  const thresholdUsd =
    locationCity?.freeDeliveryThresholdUsd ??
    locationCountry?.freeDeliveryThresholdUsd ??
    configThresholdUsd ??
    (libFreeDeliveryThresholdUsd(countryCode) || undefined);
  const [, setLocation] = useLocation();

  const freeDeliveryUnlocked =
    freeDeliveryEnabled &&
    typeof thresholdUsd === "number" &&
    thresholdUsd > 0 &&
    subtotal >= thresholdUsd;

  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;

  const { data, isLoading } = useProducts(locParams);
  const products = data?.products ?? [];

  const tabs = useMemo<ResolvedUpsellTab[]>(() => {
    const resolved = resolveUpsellTabs(products);
    return [...resolved].sort(
      (a, b) => MODAL_TAB_ORDER.indexOf(a.id) - MODAL_TAB_ORDER.indexOf(b.id),
    );
  }, [products]);

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

  const active = activeId
    ? (tabs.find((tab) => tab.id === activeId) ?? tabs[0])
    : null;

  // Exclude the just-added product and out-of-stock items; show three cards.
  const visibleProducts = useMemo<ResolvedUpsellProduct[]>(() => {
    if (!active) return [];
    return active.products
      .filter((p) => p.inStock !== false && p.id !== addedProduct?.id)
      .slice(0, CARDS_PER_VIEW);
  }, [active, addedProduct?.id]);

  // ── Analytics ──────────────────────────────────────────────────────────
  const eventProps = (extra: Record<string, unknown> = {}) => ({
    market: countryCode ?? undefined,
    locale: language,
    currency: currencyCode,
    mainProductId: addedProduct ? String(addedProduct.id) : undefined,
    selectedCategory: activeId ?? undefined,
    cartItemCount: itemCount,
    cartTotalUsd: subtotal,
    freeDeliveryUnlocked,
    deliveryWindow: promise?.summary,
    recommendationSource: "curated",
    ...extra,
  });

  const viewedRef = useRef(false);
  const closedRef = useRef(false);
  useEffect(() => {
    if (open && !viewedRef.current) {
      viewedRef.current = true;
      closedRef.current = false;
      trackWebEvent({
        type: "add_to_cart_popup_viewed",
        value: subtotal,
        currency: currencyCode,
        properties: eventProps(),
      });
    }
    if (!open) viewedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    if (!closedRef.current) {
      closedRef.current = true;
      trackWebEvent({
        type: "add_to_cart_popup_closed",
        value: subtotal,
        currency: currencyCode,
        properties: eventProps(),
      });
    }
    onClose();
  };

  // ── Upsell add interaction ─────────────────────────────────────────────
  const [addStatus, setAddStatus] = useState<Record<string, AddStatus>>({});

  const handleUpsellAdd = (product: ResolvedUpsellProduct) => {
    const id = String(product.id);
    if (addStatus[id] === "loading") return;
    const alreadyInCart = items.some((i) => i.product.id === product.id);
    if (alreadyInCart) return;

    const totalBefore = subtotal;
    trackWebEvent({
      type: "upsell_add_clicked",
      currency: currencyCode,
      properties: eventProps({ upsellProductId: id, cartTotalBeforeUsd: totalBefore }),
    });
    setAddStatus((s) => ({ ...s, [id]: "loading" }));
    try {
      addItem(product, 1);
      const totalAfter = totalBefore + effectivePrice(product);
      setAddStatus((s) => ({ ...s, [id]: "idle" }));
      // Keep the legacy event the server-side upsell aggregator/monitors read.
      trackEvent({
        name: "upsell_item_added",
        surface: "upsell_modal",
        action: activeId ?? undefined,
        productId: id,
      });
      trackWebEvent({
        type: "upsell_add_succeeded",
        value: totalAfter,
        currency: currencyCode,
        properties: eventProps({
          upsellProductId: id,
          cartTotalBeforeUsd: totalBefore,
          cartTotalAfterUsd: totalAfter,
        }),
      });
    } catch {
      setAddStatus((s) => ({ ...s, [id]: "error" }));
      trackWebEvent({
        type: "upsell_add_failed",
        currency: currencyCode,
        properties: eventProps({ upsellProductId: id, cartTotalBeforeUsd: totalBefore }),
      });
    }
  };

  // ── Chip overflow cue ──────────────────────────────────────────────────
  const chipsRef = useRef<HTMLDivElement | null>(null);
  const [chipOverflow, setChipOverflow] = useState(false);
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setChipOverflow(max > 4 && Math.abs(el.scrollLeft) < max - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [tabs.length, open]);

  // ── Card-message helper pluralization ──────────────────────────────────
  const messageCount = items.filter((i) => i.product.hasLetterField).length;

  const addedLinePriceUsd = addedProduct
    ? effectivePrice(addedProduct) * Math.max(addedQuantity, 1)
    : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent
        dir={dir}
        className="z-[70] w-[calc(100vw-1.5rem)] max-w-2xl p-0 overflow-hidden flex flex-col rounded-2xl"
        overlayClassName="z-[70]"
        style={{ maxHeight: "90vh" }}
        closeLabel={t("cart.upsells.modal.close")}
        data-testid="dialog-upsell-modal"
      >
        {/* ── Added-product confirmation header ── */}
        <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-primary/10 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            {addedProduct?.image?.uri ? (
              <img
                src={addedProduct.image.uri}
                alt={addedProduct.name}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover bg-secondary/50 shrink-0"
                data-testid="upsell-modal-added-thumb"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 font-serif text-lg sm:text-xl text-primary leading-tight">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 shrink-0"
                  aria-hidden="true"
                >
                  <Check className="w-3.5 h-3.5 text-green-700" />
                </span>
                {t("cart.upsells.modal.addedTitle")}
              </DialogTitle>
              {addedProduct ? (
                <>
                  <p
                    className="text-sm text-muted-foreground mt-1 truncate"
                    data-testid="upsell-modal-added-line"
                  >
                    {addedProduct.name} ·{" "}
                    {t("cart.upsells.modal.qty", { n: String(Math.max(addedQuantity, 1)) })}
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5" data-testid="upsell-modal-added-price">
                    <FormattedPrice usdValue={addedLinePriceUsd ?? 0} />
                  </p>
                </>
              ) : null}
            </div>
          </div>
          {freeDeliveryEnabled && (
            <div className="mt-3">
              <FreeDeliveryBanner
                subtotal={subtotal}
                overrideThresholdUsd={thresholdUsd}
                compactUnlocked
              />
            </div>
          )}
        </div>

        {/* ── Upsell section heading ── */}
        <div className="px-4 sm:px-6 pt-4 pb-2 shrink-0">
          <h2 className="font-serif text-lg sm:text-xl text-primary">
            {t("cart.upsells.modal.sectionTitle")}
          </h2>
        </div>

        {/* ── Category chip tabs ── */}
        {isLoading && (
          <div className="px-4 sm:px-6 pt-1 shrink-0">
            <div className="flex gap-2 pb-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          </div>
        )}

        {!isLoading && tabs.length > 0 && (
          <div className="px-4 sm:px-6 pt-1 shrink-0 relative">
            <div
              ref={chipsRef}
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
                      if (tab.id === activeId) return;
                      setActiveId(tab.id);
                      trackWebEvent({
                        type: "upsell_category_selected",
                        currency: currencyCode,
                        properties: eventProps({ selectedCategory: tab.id }),
                      });
                    }}
                    data-testid={`upsell-modal-tab-${tab.id}`}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
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
            {chipOverflow && (
              <div
                className="pointer-events-none absolute inset-y-0 end-4 sm:end-6 flex items-center bg-gradient-to-l rtl:bg-gradient-to-r from-background via-background/80 to-transparent ps-6"
                aria-hidden="true"
                data-testid="upsell-modal-chip-overflow-cue"
              >
                {dir === "rtl" ? (
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Product cards ── */}
        <div
          id="upsell-modal-panel"
          role="tabpanel"
          aria-labelledby={activeId ? `upsell-modal-tab-btn-${activeId}` : undefined}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 min-h-0"
        >
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {Array.from({ length: CARDS_PER_VIEW }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-primary/10 flex flex-col">
                  <Skeleton className="aspect-square w-full" />
                  <div className="p-2.5 flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-7 w-full rounded-full mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleProducts.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {visibleProducts.map((product) => {
                const id = String(product.id);
                const status = addStatus[id] ?? "idle";
                const inCart = items.some((i) => i.product.id === product.id);
                const label = inCart
                  ? `✓ ${t("cart.upsells.added")}`
                  : status === "loading"
                    ? t("cart.upsells.adding")
                    : `+ ${t("cart.upsells.add")}`;
                return (
                  <div
                    key={product.id}
                    className="group bg-background border border-primary/10 rounded-2xl overflow-hidden flex flex-col"
                    data-testid={`upsell-modal-card-${product.id}`}
                  >
                    <div className="aspect-square bg-secondary/50 relative overflow-hidden">
                      {product.image?.uri ? (
                        <img
                          src={product.image.uri}
                          alt={product.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="p-2 sm:p-2.5 flex flex-col gap-1.5 flex-1">
                      <h3 className="text-[11px] sm:text-xs leading-tight line-clamp-2 min-h-[28px]">
                        {product.name}
                      </h3>
                      <p className="font-serif text-sm text-primary">
                        <FormattedPrice usdValue={Number.isFinite(product.priceValue) ? effectivePrice(product) : 0} />
                      </p>
                      <button
                        type="button"
                        onClick={() => handleUpsellAdd(product)}
                        disabled={status === "loading" || inCart}
                        aria-label={`${t("cart.upsells.add")} — ${product.name}`}
                        data-testid={`upsell-modal-add-${product.id}`}
                        className={`mt-auto w-full rounded-full py-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                          inCart
                            ? "bg-green-100 text-green-800 cursor-default"
                            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
                        }`}
                      >
                        {label}
                      </button>
                      {status === "error" && !inCart ? (
                        <p className="text-[10px] text-destructive leading-snug" role="alert">
                          {t("cart.upsells.addFailed")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* ── Delivery window row ── */}
        <div
          className="px-4 sm:px-6 pb-2 pt-3 border-t border-primary/10 shrink-0"
          onClickCapture={() => {
            trackWebEvent({
              type: "popup_delivery_change_clicked",
              currency: currencyCode,
              properties: eventProps(),
            });
          }}
        >
          <DeliveryDateRow className="mb-0" />
        </div>

        {/* ── Full-cart summary row ── */}
        <div
          className="px-4 sm:px-6 py-2.5 shrink-0 flex items-center justify-between gap-3 border-t border-primary/10"
          data-testid="upsell-modal-cart-summary"
        >
          <span className="text-sm text-muted-foreground">
            {itemCount === 1
              ? t("cart.upsells.modal.summaryOne")
              : t("cart.upsells.modal.summaryOther", { n: String(itemCount) })}
          </span>
          <span className="text-base font-semibold text-foreground" data-testid="upsell-modal-cart-total">
            <FormattedPrice usdValue={subtotal} />
          </span>
        </div>

        {/* ── Footer actions ── */}
        <div className="px-4 sm:px-6 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              onClick={() => {
                trackWebEvent({
                  type: "popup_continue_shopping_clicked",
                  currency: currencyCode,
                  properties: eventProps(),
                });
                handleClose();
              }}
              data-testid="upsell-modal-continue-shopping"
            >
              {t("cart.upsells.modal.continueShopping")}
            </Button>
            <Button
              className="flex-1 rounded-full"
              onClick={() => {
                trackWebEvent({
                  type: "popup_continue_to_cart_clicked",
                  value: subtotal,
                  currency: currencyCode,
                  properties: eventProps(),
                });
                handleClose();
                setLocation("/cart");
              }}
              data-testid="upsell-modal-continue-to-cart"
            >
              {t("cart.upsells.modal.continueToCart")}
            </Button>
          </div>
          {messageCount > 0 ? (
            <p
              className="text-xs text-muted-foreground text-center mt-2"
              data-testid="upsell-modal-next-hint"
            >
              {messageCount === 1
                ? t("cart.upsells.modal.nextMessageOne")
                : t("cart.upsells.modal.nextMessageOther")}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

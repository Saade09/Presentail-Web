import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { AddToCartUpsellModal } from "@/components/cart/AddToCartUpsellModal";
import { useToast } from "@/hooks/use-toast";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useProducts, useCatalogMetadata } from "@/lib/queries";
import { PageBreadcrumb, type Crumb } from "@/components/PageBreadcrumb";
import { useFavorites } from "@/contexts/FavoritesContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductInfo } from "@/components/product/ProductInfo";
import {
  DeliveryOptions,
  type DeliveryChoice,
} from "@/components/product/DeliveryOptions";
import { ProductBenefits } from "@/components/product/ProductBenefits";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { TrustpilotMicroWidget } from "@/components/product/TrustpilotMicroWidget";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { buildProductViewModel } from "@/components/product/productViewModel";
import { FormattedPrice } from "@/components/FormattedPrice";
import {
  dayLabels,
  expressSurchargeForCountry,
  formatDeliveryRow,
  isExpressDeliveryAvailable,
  slotTimeRangeForLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { useNow } from "@/lib/useNow";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { trackFbEvent } from "@/lib/fbPixel";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const slug = params?.slug;
  const { t, language } = useLocale();
  const { toast } = useToast();
  const { addItem } = useCart();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const { isFavorited, toggleFavorite } = useFavorites();
  const { countryCode: locationCountry } = useLocationSelection();
  const [currentPath, setLocation] = useLocation();
  const [upsellOpen, setUpsellOpen] = useState(false);
  const delivery = useDeliveryConfig();
  const deliverySelection = useDeliverySelection();

  const { currencyCode } = useDisplayCurrency();
  const { countryCode, cityId, city } = useLocationSelection();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;
  const { data: allData, isLoading } = useProducts(locParams);
  const { data: catalogMetadata } = useCatalogMetadata();
  const product = allData?.products?.find((p) => p.id === slug);

  // Express Delivery is only offered between 8 AM and 10 PM in the
  // recipient country's local time. The 10 PM cutoff lives in the shared
  // delivery library so every surface (PDP, cart, checkout) agrees.
  // `useNow` ticks every minute so the computed availability flips
  // automatically when the cutoff passes mid-session.
  const now = useNow();
  // OS can disable express per-city (e.g. Akkar has expressAvailable: false).
  // AND with the time-of-day check so both gates must pass.
  // Use `=== true` (not `!== false`) so a null city (data not yet loaded)
  // evaluates to false — avoids flashing Express for cities that have it
  // disabled before the delivery-locations query resolves.
  const expressAvailable = useMemo(
    () => city?.expressAvailable === true && isExpressDeliveryAvailable(countryCode, now),
    [city, countryCode, now],
  );

  // Local UI choice for the radio.
  // We intentionally default to "scheduled" when city data hasn't loaded yet
  // (city === null) so we never flash Express for a city where OS has it
  // turned off (e.g. Akkar). The upgrade effect below switches to "express"
  // once we confirm the city supports it. Only a persisted "schedule" mode
  // (explicit shopper choice with a concrete date) suppresses Express; the
  // seed value "today_slot" is treated the same as no explicit choice.
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>(() => {
    if (deliverySelection.mode === "schedule") {
      return "scheduled";
    }
    // city === null means the delivery-locations query hasn't resolved yet —
    // safe default is "scheduled"; the upgrade effect corrects it once loaded.
    if (city === null) return "scheduled";
    return expressAvailable ? "express" : "scheduled";
  });

  // Upgrade to express once city data loads and confirms express is available
  // — only when the shopper has not made an explicit scheduled choice.
  // "today_slot" is the seed value (not an explicit pick) so it is treated
  // the same as no selection here.
  useEffect(() => {
    if (
      expressAvailable &&
      deliveryChoice === "scheduled" &&
      (!deliverySelection.mode || deliverySelection.mode === "express" || deliverySelection.mode === "today_slot")
    ) {
      setDeliveryChoice("express");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expressAvailable]);

  // If the recipient-country clock crosses 10 PM (or express is disabled by
  // OS for this city) while the shopper is on the page, fall back to scheduled
  // and persist a sane default so checkout doesn't reopen with Express.
  useEffect(() => {
    if (deliveryChoice === "express" && !expressAvailable) {
      setDeliveryChoice("scheduled");
      deliverySelection.setSelection({
        mode: "today_slot",
        date: new Date().toISOString().slice(0, 10),
        slotLabel: deliverySelection.slotLabel ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryChoice, expressAvailable]);
  const vm = useMemo(
    () => (product ? buildProductViewModel(product) : null),
    [product],
  );

  useEffect(() => {
    if (!product) return;
    trackFbEvent("ViewContent", {
      content_name: product.name,
      content_ids: [product.id],
      content_type: "product",
      value: product.priceValue,
      currency: "USD",
    });
  }, [product?.id]); // i18n-ignore

  const productBreadcrumbs = useMemo((): Crumb[] => {
    const home: Crumb = { label: t("nav.home"), href: "/" };
    if (!product) return [home];
    const catSlug = product.category;
    const catEntry = catSlug
      ? catalogMetadata?.categories.find((c) => c.id === catSlug)
      : undefined;
    if (catEntry) {
      return [
        home,
        { label: catEntry.name, href: `/category/${catSlug}` },
        { label: product.name },
      ];
    }
    return [home, { label: product.name }];
  }, [product, catalogMetadata, t]);

  const effectiveDescription = useMemo(() => {
    const wooDesc = product?.description?.trim() ?? "";
    if (wooDesc.length > 0) return wooDesc;
    return vm?.description ?? "";
  }, [product, vm]);

  const days = useMemo(() => dayLabels("Today", "Tomorrow"), []);
  const cityTimeSlots = useMemo(
    () => (city?.timeSlots?.length ? city.timeSlots : timeSlotsForCountry(countryCode)),
    [city, countryCode],
  );
  const scheduledRowSubtitle = useMemo(() => {
    const formatted =
      deliverySelection.mode && deliverySelection.mode !== "express"
        ? formatDeliveryRow({
            mode: deliverySelection.mode,
            date: deliverySelection.date,
            slotLabel: deliverySelection.slotLabel,
            slotTimeRange: slotTimeRangeForLabel(deliverySelection.slotLabel, cityTimeSlots),
            days,
            expressLabel: delivery.expressDeliveryTimeLabel,
          })
        : null;
    return formatted ?? t("product.scheduledSubtitle");
  }, [
    deliverySelection.mode,
    deliverySelection.date,
    deliverySelection.slotLabel,
    cityTimeSlots,
    days,
    delivery.expressDeliveryTimeLabel,
  ]);

  const handleSelectExpress = () => {
    if (!expressAvailable) return;
    setDeliveryChoice("express");
    deliverySelection.setSelection({
      mode: "express",
      date: new Date().toISOString().slice(0, 10),
      slotLabel: null,
    });
  };

  const handleSelectScheduled = () => {
    setDeliveryChoice("scheduled");
    // The inline picker below the row handles the actual date/slot
    // selection; if the shopper has no persisted scheduled choice yet,
    // seed today + first available slot so the row's subtitle and the
    // checkout summary line up immediately.
    if (!deliverySelection.mode || deliverySelection.mode === "express") {
      deliverySelection.setSelection({
        mode: "today_slot",
        date: new Date().toISOString().slice(0, 10),
        slotLabel: deliverySelection.slotLabel ?? null,
      });
    }
  };

  const handleAdd = () => {
    if (!product) return;
    if (!deliverySelection.mode) {
      if (deliveryChoice === "express") {
        deliverySelection.setSelection({
          mode: "express",
          date: new Date().toISOString().slice(0, 10),
          slotLabel: null,
        });
      } else {
        deliverySelection.setSelection({
          mode: "today_slot",
          date: new Date().toISOString().slice(0, 10),
          slotLabel: null,
        });
      }
    }
    addItem(product, 1);
    setUpsellOpen(true);
  };

  const handleShare = async () => {
    if (typeof window === "undefined" || !product || !slug) return;
    const url = `${window.location.origin}/product/${encodeURIComponent(String(slug))}`;
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> })
        : null;
    if (nav?.share) {
      try {
        await nav.share({ title: product.name, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      if (nav && "clipboard" in nav && nav.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        toast({
          title: t("product.share.copied.title"),
          description: t("product.share.copied.desc"),
        });
        return;
      }
    } catch {
      // fall through
    }
    toast({
      title: t("product.share.unavailable.title"),
      description: t("product.share.unavailable.desc"),
      variant: "destructive",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-page max-w-content pt-12 pb-24">
        <Skeleton className="h-4 w-64 mb-8" />
        <div className="grid lg:grid-cols-[3fr_2fr] gap-10 lg:gap-16">
          <Skeleton className="aspect-square rounded-3xl" />
          <div className="space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!product || !vm || product.inStock === false) {
    return (
      <div className="container mx-auto px-page max-w-content pt-32 pb-24 text-center">
        <h1 className="font-serif text-3xl mb-4">{t("product.notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/shop">{t("product.returnShop")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen relative z-0">
      <div className="container mx-auto px-page max-w-content pt-4 sm:pt-6">
        <PageBreadcrumb crumbs={productBreadcrumbs} />
      </div>
      <div className="container mx-auto px-page max-w-content pt-4 sm:pt-6 pb-16 sm:pb-20">
        <div className="grid lg:grid-cols-[3fr_2fr] lg:items-stretch gap-6 sm:gap-8 lg:gap-16">
          <div className="h-full">
            <ProductGallery
              images={vm.galleryImages}
              productName={product.name}
              onShare={handleShare}
              onFavorite={product ? () => {
                if (isSignedIn) {
                  void toggleFavorite(product.id, locationCountry ?? null);
                } else {
                  setLocation(`/sign-in?return_to=${encodeURIComponent(currentPath)}`);
                }
              } : undefined}
              isFavorited={product ? isFavorited(product.id) : false}
            />
          </div>

          <div className="flex flex-col gap-6 sm:gap-7 h-full">
            <ProductInfo
              name={product.name}
              price={<FormattedPrice usdValue={product.priceValue} />}
              taxLabel="TAX Inclusive"
              rewardPoints={vm.rewardPoints}
            />

            <DeliveryOptions
              value={deliveryChoice}
              onSelectExpress={handleSelectExpress}
              onSelectScheduled={handleSelectScheduled}
              expressLabel={delivery.expressDeliveryTimeLabel}
              expressAvailable={expressAvailable}
              expressUnavailableLabel={t("checkout.expressUnavailable")}
              scheduledSubtitle={scheduledRowSubtitle}
              infoFee={<>+ <FormattedPrice usdValue={expressSurchargeForCountry(countryCode)} /></>}
            />

            {deliveryChoice === "scheduled" && (
              <ScheduleInlinePanel
                countryCode={countryCode}
                timeSlots={city?.timeSlots}
                slotsByDay={city?.slotsByDay as Record<string, TimeSlot[]> | undefined}
                initialDate={deliverySelection.date}
                initialSlotLabel={deliverySelection.slotLabel}
                onChange={({ mode, date, slotLabel }) => {
                  deliverySelection.setSelection({ mode, date, slotLabel });
                }}
              />
            )}

            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1 h-14 text-sm tracking-[0.18em] uppercase rounded-xl"
                onClick={handleAdd}
                disabled={!vm.inStock}
                data-testid="button-add-to-cart"
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                {vm.inStock ? t("product.addToCart") : t("product.outOfStock")}
              </Button>
            </div>

            <ProductBenefits
              freeDeliveryThresholdNode={
                delivery.freeDeliveryThresholdUsd != null
                  ? <FormattedPrice usdValue={delivery.freeDeliveryThresholdUsd} />
                  : delivery.freeDeliveryThreshold
              }
              freeDeliveryEnabled={delivery.freeDeliveryEnabled}
            />

            <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <PaymentMethods
                label={t("payments.waysToPay")}
                countryCode={countryCode}
                currencyCode={currencyCode}
              />
            </div>

            {/* Trustpilot Micro TrustScore widget */}
            <TrustpilotMicroWidget />
          </div>
        </div>

        <ProductTabs
          description={effectiveDescription}
          bouquetIncludes={vm.bouquetIncludes}
          careTips={vm.careTips}
        />
      </div>

      <AddToCartUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
      />

    </div>
  );
}

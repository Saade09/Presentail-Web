import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Info, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { AddToCartUpsellModal } from "@/components/cart/AddToCartUpsellModal";
import { useToast } from "@/hooks/use-toast";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useDeliverySelection } from "@/contexts/DeliverySelectionContext";
import { useProducts, useCatalogMetadata, useProductAvailability, useOsProductPricing } from "@/lib/queries";
import { ProductUnavailableInCity } from "@/components/product/ProductUnavailableInCity";
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
import { SecurePaymentsTrustpilotCard } from "@/components/product/SecurePaymentsTrustpilotCard";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { buildProductViewModel } from "@/components/product/productViewModel";
import { FormattedPrice } from "@/components/FormattedPrice";
import { SalePrice } from "@/components/SalePrice";
import {
  dayLabels,
  expressSurchargeForCountry,
  formatDeliveryRow,
  freeDeliveryThresholdUsd,
  isExpressDeliveryAvailable,
  slotTimeRangeShortForLabel,
  timeSlotsForCountry,
  type TimeSlot,
} from "@workspace/delivery";
import { useNow } from "@/lib/useNow";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { trackFbEvent } from "@/lib/fbPixel";
import { trackWebEvent, trackEvent } from "@/lib/analytics";
import { buildProductSeo } from "@/lib/seo";
import { FrequentlyBoughtTogether } from "@/components/product/FrequentlyBoughtTogether";
import { calcCheckoutFees } from "@/pages/checkoutFees";

const SEO_ATTR = "data-seo-managed";

function setMeta(selector: string, attrs: Record<string, string>, parent: HTMLElement) {
  let el = parent.querySelector<HTMLElement>(`${selector}[${SEO_ATTR}]`);
  if (!el) {
    el = document.createElement(selector.split("[")[0]);
    el.setAttribute(SEO_ATTR, "true");
    parent.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const slug = params?.slug;
  const { t, language, cityName, countryName } = useLocale();
  const { toast } = useToast();
  const { addItem, subtotal: cartSubtotal } = useCart();
  const { user } = useAuth();
  const isSignedIn = !!user;
  const { isFavorited, toggleFavorite } = useFavorites();
  const { countryCode, cityId, city, country } = useLocationSelection();
  const [currentPath, setLocation] = useLocation();
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [customNote, setCustomNote] = useState("");
  // Reset note when navigating to a different product
  useEffect(() => { setCustomNote(""); }, [slug]);
  const delivery = useDeliveryConfig();
  const deliverySelection = useDeliverySelection();

  const { currencyCode, formatPrice } = useDisplayCurrency();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = {
    lang: language,
  };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;
  const { data: allData, isLoading } = useProducts(locParams);
  const { data: catalogMetadata } = useCatalogMetadata();
  const product = allData?.products?.find((p) => p.id === slug);

  // The OS list endpoint omits discount pricing. Fetch it from the single-product
  // endpoint using the numeric OS ID preserved during catalogue normalisation.
  const { data: osPricing } = useOsProductPricing(product?.osNumericId);

  // When the main product lookup comes back empty, check whether the product
  // exists in another city. Only trigger when loading is complete and the
  // product is absent. This avoids an unnecessary API call for every PDP visit.
  const shouldCheckAvailability = !isLoading && !product && !!slug;
  const {
    data: availabilityData,
    isLoading: isCheckingAvailability,
  } = useProductAvailability(slug, { enabled: shouldCheckAvailability });

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

  // Tracks whether the shopper has explicitly picked "scheduled" during this
  // session. A persisted "schedule" from a previous visit must not suppress
  // the express upgrade; only an in-session explicit pick should.
  const userPickedScheduledRef = useRef(false);

  // Local UI choice for the radio.
  // We intentionally default to "scheduled" when city data hasn't loaded yet
  // (city === null) so we never flash Express for a city where OS has it
  // turned off (e.g. Akkar). The upgrade effect below switches to "express"
  // once we confirm the city supports it.
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>(() => {
    // city === null means the delivery-locations query hasn't resolved yet —
    // safe default is "scheduled"; the upgrade effect corrects it once loaded.
    if (city === null) return "scheduled";
    return expressAvailable ? "express" : "scheduled";
  });

  // Upgrade to express once city data loads and confirms express is available
  // — unless the shopper has already made an explicit in-session scheduled
  // pick. A persisted "schedule" from a prior session is not an explicit pick
  // and must not block the upgrade.
  useEffect(() => {
    if (expressAvailable && deliveryChoice === "scheduled" && !userPickedScheduledRef.current) {
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
    trackWebEvent({
      type: "product_view",
      brand: product.brandNames?.[0] ?? undefined,
      properties: {
        category: product.category ?? undefined,
        occasion: product.occasions?.[0] ?? undefined,
      },
    });
  }, [product?.id]); // i18n-ignore

  useEffect(() => {
    if (typeof document === "undefined" || !product) return;
    // Guard: if a city/country ID is selected but the resolved object isn't
    // available yet (delivery-locations query re-fetching after a city switch),
    // skip this render to avoid writing a title with a blank city label.
    if (cityId && !city) return;
    if (countryCode && !country) return;
    const head = document.head;
    const cityLabel = city ? cityName(city.id, city.name) : "";
    const countryLabel = country ? countryName(country.code, country.name) : "";
    const seo = buildProductSeo({
      lang: language,
      productName: product.name,
      city: cityLabel,
      country: countryLabel,
      shortDescription: product.description?.trim() || undefined,
    });
    document.title = seo.title;
    head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    setMeta('meta[name="description"]', { name: "description", content: seo.description }, head);
    setMeta('meta[property="og:title"]', { property: "og:title", content: seo.ogTitle }, head);
    setMeta('meta[property="og:description"]', { property: "og:description", content: seo.ogDescription }, head);
    setMeta('meta[name="twitter:title"]', { name: "twitter:title", content: seo.twitterTitle }, head);
    setMeta('meta[name="twitter:description"]', { name: "twitter:description", content: seo.twitterDescription }, head);
    return () => {
      head.querySelectorAll(`[${SEO_ATTR}]`).forEach((el) => el.parentElement?.removeChild(el));
    };
  }, [product?.name, city, country, language, cityName, countryName]); // eslint-disable-line react-hooks/exhaustive-deps

  const productBreadcrumbs = useMemo((): Crumb[] => {
    const home: Crumb = { label: t("nav.home"), href: "/" };
    const shop: Crumb = { label: t("shop.allCollection"), href: "/shop" };
    if (!product) return [home];
    const catSlug = product.category;
    const catEntry = catSlug
      ? catalogMetadata?.categories.find((c) => c.id === catSlug)
      : undefined;
    if (catEntry) {
      return [
        home,
        shop,
        { label: catEntry.name, href: `/category/${catSlug}` },
        { label: product.name },
      ];
    }
    return [home, shop, { label: product.name }];
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
            slotTimeRange: slotTimeRangeShortForLabel(deliverySelection.slotLabel, cityTimeSlots),
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

  // USD price of the product currently being viewed — use sale price when on
  // sale (matches what the cart will record), same as mobile useDeliveryPricing.
  const productUsdForPricing =
    osPricing?.discountPriceUsd ??
    product?.discountPriceValue ??
    product?.priceValue ??
    0;

  // Whether the projected cart total (existing cart + this product) meets the
  // free-delivery threshold.  Includes the current product so a $450 item on
  // an otherwise-empty cart still shows "Free" — mirrors mobile logic.
  const freeDeliveryMet = useMemo(() => {
    if (!delivery.freeDeliveryEnabled) return false;
    const threshold = delivery.freeDeliveryThresholdUsd ?? freeDeliveryThresholdUsd(countryCode);
    return (cartSubtotal + productUsdForPricing) >= threshold;
  }, [delivery.freeDeliveryEnabled, delivery.freeDeliveryThresholdUsd, countryCode, cartSubtotal, productUsdForPricing]);

  // Fire analytics once the first time freeDeliveryMet becomes true (after
  // the delivery-config query resolves with real server data, not fallback).
  const prevQualifiesRef = useRef(false);
  useEffect(() => {
    if (!delivery.isLoaded || !product) return;
    if (freeDeliveryMet && !prevQualifiesRef.current) {
      trackEvent({ name: "free_delivery_qualification_message_viewed" });
    }
    prevQualifiesRef.current = freeDeliveryMet;
  }, [freeDeliveryMet, delivery.isLoaded, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delivery card fee labels — mirrors the mobile useDeliveryPricing logic.
  // cityFeeUsd: null when no city is selected OR city fee is not yet configured.
  const deliveryCardLabels = useMemo(() => {
    const { cityFeeUsd } = delivery;
    // Use the lib function (same source as the info-popover) so the surcharge
    // always matches the OS-configured price ($15 for LB, etc.), not the
    // possibly-stale value the /delivery-config endpoint echoes back.
    const expressSurcharge = expressSurchargeForCountry(countryCode);
    const fmt = (usd: number) => formatPrice(usd);

    if (cityFeeUsd === null) {
      // unknown_area: no city selected yet; from_min: city selected, fee unconfigured.
      // Differentiate so the scheduled card copy is accurate.
      const scheduleLabel = cityId
        ? t("product.delivery.calculatedAtCheckout")   // from_min
        : t("product.delivery.calculatedAfterArea");   // unknown_area
      return {
        expressFeeLabel: t("product.delivery.fromMin").replace("{amount}", fmt(expressSurcharge)),
        expressFeeSubLabel: undefined as string | undefined,
        expressIsFree: false,
        scheduledFeeLabel: scheduleLabel,
        scheduledFeeSubLabel: undefined as string | undefined,
        scheduledIsFree: false,
        helperIsQualified: false,
        expressSurchargeFormatted: fmt(expressSurcharge),
      };
    }

    const isFree = freeDeliveryMet;
    // When standard delivery is free the shopper pays $0 standard + surcharge.
    // When not free: cityFee + surcharge.
    // Mirrors the mobile useDeliveryPricing hook exactly.
    const expressTotal = isFree
      ? expressSurcharge
      : cityFeeUsd + expressSurcharge;
    const expressBreakdown = isFree
      ? t("product.delivery.expressBreakdownFree").replace("{express}", fmt(expressSurcharge))
      : t("product.delivery.expressBreakdown")
          .replace("{standard}", fmt(cityFeeUsd))
          .replace("{express}", fmt(expressSurcharge));

    return {
      expressFeeLabel: t("product.delivery.expressTotal").replace("{amount}", fmt(expressTotal)),
      expressFeeSubLabel: expressBreakdown,
      expressIsFree: false,
      scheduledFeeLabel: isFree
        ? t("product.deliveryFree")
        : t("product.delivery.standardFeeLabel").replace("{amount}", fmt(cityFeeUsd)),
      scheduledFeeSubLabel: t("product.delivery.standardDelivery"),
      scheduledIsFree: isFree,
      helperIsQualified: isFree,
      expressSurchargeFormatted: fmt(expressSurcharge),
    };
  }, [delivery, cityId, freeDeliveryMet, formatPrice, t]);

  // All-in price shown in the sticky CTA: product price + district fee + express/slot surcharge.
  // Returns null when the city fee is unknown (no location selected) — falls back to product price only.
  const stickyTotalUsd = useMemo(() => {
    if (delivery.cityFeeUsd === null) return null;
    if (!countryCode) return null;
    const fees = calcCheckoutFees({
      subtotal: cartSubtotal + productUsdForPricing,
      countryCode,
      noAddress: false,
      cityFee: delivery.cityFeeUsd,
      freeDeliveryThresholdUsd: delivery.freeDeliveryThresholdUsd ?? undefined,
      freeDeliveryEnabled: delivery.freeDeliveryEnabled,
      deliveryMode: deliveryChoice === "express" ? "express" : "schedule",
      timeSlots: cityTimeSlots,
      deliverySlot: deliverySelection.slotLabel ?? "",
      deliveryDate: deliverySelection.date ?? undefined,
    });
    return productUsdForPricing + fees.districtFee + fees.expressFee + fees.slotFee;
  }, [delivery, cartSubtotal, productUsdForPricing, countryCode, deliveryChoice, cityTimeSlots, deliverySelection.slotLabel, deliverySelection.date]);

  const handleSelectExpress = () => {
    if (!expressAvailable) return;
    userPickedScheduledRef.current = false;
    setDeliveryChoice("express");
    deliverySelection.setSelection({
      mode: "express",
      date: new Date().toISOString().slice(0, 10),
      slotLabel: null,
    });
  };

  const handleSelectScheduled = () => {
    userPickedScheduledRef.current = true;
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
    addItem(product, 1, customNote || undefined);
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

  const pdpSkeleton = (
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

  if (isLoading || (shouldCheckAvailability && isCheckingAvailability)) {
    return pdpSkeleton;
  }

  if (!product || !vm || product.inStock === false) {
    if (availabilityData?.exists) {
      return (
        <ProductUnavailableInCity
          productName={availabilityData.productName}
          productSlug={availabilityData.slug}
          availableStores={availabilityData.availableStores}
          category={availabilityData.category}
          brand={availabilityData.brand}
        />
      );
    }
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
    <div className="bg-white min-h-screen relative z-0 overflow-x-hidden">
      <div className="container mx-auto px-page max-w-content pt-4 sm:pt-6">
        <PageBreadcrumb crumbs={productBreadcrumbs} />
      </div>
      <div className="container mx-auto px-page max-w-content pt-4 sm:pt-6 pb-28 sm:pb-20 md:pb-16">
        <div className="grid lg:grid-cols-[3fr_2fr] lg:items-stretch gap-6 sm:gap-8 lg:gap-8">
          <div className="h-full">
            <ProductGallery
              images={vm.galleryImages}
              productName={product.name}
              onShare={handleShare}
              onFavorite={product ? () => {
                if (isSignedIn) {
                  void toggleFavorite(product.id, countryCode ?? null);
                } else {
                  setLocation(`/sign-in?return_to=${encodeURIComponent(currentPath)}`);
                }
              } : undefined}
              isFavorited={product ? isFavorited(product.id) : false}
            />
          </div>

          <div className="flex flex-col gap-6 sm:gap-7 lg:gap-3 h-full">
            <ProductInfo
              name={product.name}
              price={
                <SalePrice
                  priceValue={osPricing?.regularPriceUsd ?? product.priceValue}
                  discountPriceValue={osPricing?.discountPriceUsd ?? product.discountPriceValue}
                  discountPriceAed={osPricing?.discountPriceAed ?? product.discountPriceAed}
                />
              }
              taxLabel="TAX Inclusive"
              rewardPoints={vm.rewardPoints}
              freeDeliveryBadge={
                delivery.isLoaded && freeDeliveryMet
                  ? deliveryChoice === "express"
                    ? t("product.delivery.qualifiedHelperExpress").replace("{amount}", deliveryCardLabels.expressSurchargeFormatted)
                    : t("product.delivery.qualifiedHelperStandard")
                  : undefined
              }
            />

            {product.hasLetterField ? (
              /* Single-character letter input — for letter box products */
              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2.5 block">
                  {t("checkout.section.letterInput")}
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative w-20">
                    <Input
                      value={customNote}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 1).toUpperCase();
                        setCustomNote(v);
                      }}
                      placeholder={t("checkout.letterInput.placeholder")}
                      maxLength={1}
                      className="h-14 text-2xl text-center uppercase tracking-widest font-serif"
                      aria-label={t("checkout.letterInput.label")}
                      data-testid="input-custom-note"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground flex-1">{t("checkout.letterInput.label")}</p>
                </div>
              </div>
            ) : product.hasInputField ? (
              /* General personalisation text input — for cakes, etc. */
              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2.5 block">
                  {product.personalisationRequired
                    ? t("product.customNote.labelRequired")
                    : product.category === "cakes"
                      ? t("product.customNote.label")
                      : t("product.customNote.labelPlain")}
                </label>
                <div className="relative">
                  <Input
                    value={customNote}
                    onChange={(e) => {
                      if (e.target.value.length <= 22) setCustomNote(e.target.value);
                    }}
                    placeholder={product.category === "cakes" ? t("product.customNote.cakePlaceholder") : t("product.customNote.placeholder")}
                    maxLength={22}
                    className="pr-12"
                    data-testid="input-custom-note"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
                    {t("product.customNote.counter").replace("{count}", String(customNote.length))}
                  </span>
                </div>
                {product.personalisationRequired && customNote.trim().length === 0 && (
                  <p className="text-xs text-destructive" data-testid="personalisation-required-error">
                    {t("product.customNote.labelRequired")}
                  </p>
                )}
              </div>
            ) : null}

            <DeliveryOptions
              value={deliveryChoice}
              onSelectExpress={handleSelectExpress}
              onSelectScheduled={handleSelectScheduled}
              expressLabel={delivery.expressDeliveryTimeLabel}
              expressAvailable={expressAvailable}
              expressUnavailableLabel={t("checkout.expressUnavailable")}
              scheduledSubtitle={scheduledRowSubtitle}
              expressFeeLabel={deliveryCardLabels.expressFeeLabel}
              expressFeeSubLabel={deliveryCardLabels.expressFeeSubLabel}
              expressIsFree={deliveryCardLabels.expressIsFree}
              scheduledFeeLabel={deliveryCardLabels.scheduledFeeLabel}
              scheduledFeeSubLabel={deliveryCardLabels.scheduledFeeSubLabel}
              scheduledIsFree={deliveryCardLabels.scheduledIsFree}
            />

            {deliveryChoice === "scheduled" && (
              <ScheduleInlinePanel
                countryCode={countryCode}
                timeSlots={city?.timeSlots}
                slotsByDay={city?.slotsByDay as Record<string, TimeSlot[]> | undefined}
                initialDate={deliverySelection.date}
                initialSlotLabel={deliverySelection.slotLabel}
                freeDeliveryMet={freeDeliveryMet}
                onChange={({ mode, date, slotLabel }) => {
                  deliverySelection.setSelection({ mode, date, slotLabel });
                }}
              />
            )}

            {!expressAvailable && !deliveryCardLabels.helperIsQualified && (
              <div className="flex items-center gap-1.5 px-0.5">
                <Info className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                {delivery.cityFeeUsd !== null ? (
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {deliveryCardLabels.scheduledFeeLabel}
                    {deliveryCardLabels.scheduledFeeSubLabel && (
                      <> &middot; {deliveryCardLabels.scheduledFeeSubLabel}</>
                    )}
                  </span>
                ) : (
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {t("product.delivery.feesHelper")}
                  </span>
                )}
              </div>
            )}

            <div className="hidden md:flex gap-3">
              <Button
                size="lg"
                className="flex-1 h-14 text-sm tracking-[0.18em] uppercase rounded-xl"
                onClick={handleAdd}
                disabled={!vm.inStock || (product.personalisationRequired && customNote.trim().length === 0)}
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

            {/* Mobile: compact secure-payments + Trustpilot card */}
            <div className="block md:hidden">
              <SecurePaymentsTrustpilotCard
                countryCode={countryCode}
                currencyCode={currencyCode}
              />
            </div>

            {/* Desktop/tablet: original Ways to Pay card + Trustpilot widget */}
            <div className="hidden md:block rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <PaymentMethods
                label={t("payments.waysToPay")}
                countryCode={countryCode}
                currencyCode={currencyCode}
              />
            </div>

            {/* Trustpilot Micro TrustScore widget — desktop/tablet only */}
            <div className="hidden md:block">
              <TrustpilotMicroWidget />
            </div>
          </div>
        </div>

        <ProductTabs
          description={effectiveDescription}
          bouquetIncludes={vm.bouquetIncludes}
          careGroup={vm.careGroup}
          careIconName={vm.careIconName}
        />
      </div>

      {slug && product && <FrequentlyBoughtTogether slug={slug} anchor={product} />}

      <AddToCartUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
      />

      {/* Always-visible sticky Add to Cart bar on mobile */}
      <div className="fixed bottom-0 inset-x-0 md:hidden z-50 bg-white border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <Button
          size="lg"
          className="w-full h-14 text-sm tracking-[0.18em] uppercase rounded-xl"
          onClick={handleAdd}
          disabled={!vm.inStock || (product.personalisationRequired && customNote.trim().length === 0)}
          data-testid="button-add-to-cart-sticky"
        >
          <span className="flex items-center justify-center gap-3 w-full">
            <span className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              {vm.inStock ? t("product.addToCart") : t("product.outOfStock")}
            </span>
            <span className="font-semibold tracking-normal normal-case">
              {stickyTotalUsd != null
                ? <FormattedPrice usdValue={stickyTotalUsd} />
                : <SalePrice
                    priceValue={osPricing?.regularPriceUsd ?? product.priceValue}
                    discountPriceValue={osPricing?.discountPriceUsd ?? product.discountPriceValue}
                    discountPriceAed={osPricing?.discountPriceAed ?? product.discountPriceAed}
                  />
              }
            </span>
          </span>
        </Button>
      </div>

    </div>
  );
}

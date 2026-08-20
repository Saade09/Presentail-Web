import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Info, ShoppingCart } from "lucide-react";
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
import { InheritedDeliverySummary } from "@/components/product/InheritedDeliverySummary";
import { ProductBenefits } from "@/components/product/ProductBenefits";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { TrustpilotMicroWidget } from "@/components/product/TrustpilotMicroWidget";
import { SecurePaymentsTrustpilotCard } from "@/components/product/SecurePaymentsTrustpilotCard";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { buildProductViewModel } from "@/components/product/productViewModel";
import { FormattedPrice } from "@/components/FormattedPrice";
import { buildFeeNode } from "@/lib/feeNode";
import { SalePrice } from "@/components/SalePrice";
import {
  dayLabels,
  expressSurchargeForCountry,
  firstAvailableDay,
  formatDeliveryRow,
  freeDeliveryThresholdUsd,
  getCountryHour,
  getLocalIso,
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
import { CompleteYourGift } from "@/components/product/CompleteYourGift";
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
  const { addItem, subtotal: cartSubtotal, itemCount } = useCart();
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

  // Standard delivery is eligible when the scheduler can produce at least one
  // future window for the shopper's country. In practice this is always true
  // (firstAvailableDay falls back to tomorrow when today's slots are past), but
  // the check is explicit so that the upgrade effect below fires correctly if the
  // OS ever introduces cities/hours with no schedulable windows.
  const standardEligible = useMemo(() => {
    const slots = timeSlotsForCountry(countryCode);
    const h = getCountryHour(countryCode);
    const today = new Date().toISOString().slice(0, 10);
    return firstAvailableDay(today, slots, h, today) !== null;
  }, [countryCode]);

  // Local UI choice for the radio.
  // Default to "scheduled" (free standard delivery) when it is eligible.
  // Express is available as an explicit opt-in upgrade.
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>("scheduled");

  // Eligibility upgrade effect: if standard becomes ineligible while the shopper
  // is on the page (e.g. no schedulable windows at this hour) AND express is
  // available, fall back to express. This is the canonical place for the
  // express-only fallback required by the spec.
  useEffect(() => {
    if (deliveryChoice === "scheduled" && !standardEligible && expressAvailable) {
      setDeliveryChoice("express");
      deliverySelection.setSelection({
        mode: "express",
        date: new Date().toISOString().slice(0, 10),
        slotLabel: null,
        slotId: null,
        serviceType: null,
        cityId: null,
        source: "system_reselected",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardEligible, expressAvailable]);

  // Tracks whether the shopper has explicitly interacted with the date/slot
  // picker this session. Pre-committed for returning users who have a stored
  // scheduled selection (mode is already set in the context from readInitial).
  // First-time visitors have mode===null so the ref starts false — they must
  // pick a window before Add to Cart proceeds.
  // Whether the shopper explicitly interacted with the inline scheduler this
  // session (vs. its automatic initial pick on mount) — drives selection source.
  const scheduleUserInteractedRef = useRef(false);
  const windowCommittedRef = useRef(
    deliverySelection.mode !== null &&
    deliverySelection.mode !== "express" &&
    !!deliverySelection.slotLabel,
  );

  // Whether the delivery-selection context currently holds a complete, valid
  // selection Add to Cart can trust without any panel interaction — e.g. one
  // inherited from the cart's existing items. Express only needs a mode+date;
  // scheduled modes also need a slot label.
  const hasValidContextSelection =
    deliverySelection.mode === "express"
      ? !!deliverySelection.date
      : deliverySelection.mode !== null &&
        !!deliverySelection.date &&
        !!deliverySelection.slotLabel;

  // Keep the committed ref in sync with the context selection. When the PDP
  // renders the inherited-delivery summary (schedule panel not mounted) the
  // panel never emits, so without this the ref could stay false and Add to
  // Cart would silently no-op until the shopper changed the date. Re-runs on
  // slug navigation so moving between PDPs re-seeds it.
  useEffect(() => {
    if (hasValidContextSelection) windowCommittedRef.current = true;
  }, [slug, hasValidContextSelection]);

  // When the cart already has items with a committed delivery, the PDP shows a
  // compact inherited-delivery summary instead of the full selector. The shopper
  // can click "Change delivery" / "Change date or time" to expand the selector.
  // Reset to summary mode whenever the shopper navigates to a different product.
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);
  useEffect(() => { setIsEditingDelivery(false); }, [slug]);

  // Fire delivery_method_defaulted once after initial mount to record the
  // automatic standard-delivery default. Only fires for the auto-default,
  // not for explicit user selections.
  const defaultedFiredRef = useRef(false);
  useEffect(() => {
    if (defaultedFiredRef.current) return;
    defaultedFiredRef.current = true;
    trackEvent({ name: "delivery_method_defaulted", deliveryMethod: "standard", deliverySource: "auto" });
  }, []);

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
        source: "system_reselected",
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
    // SeoHead intentionally provides a generic image for non-entity routes.
    // Replace it for hydrated product pages too, so client navigation never
    // overwrites the server-rendered versioned Presentail card with a CDN photo.
    const productSocialVersion = (product as unknown as { socialShareVersion?: unknown }).socialShareVersion;
    const socialVersion = typeof productSocialVersion === "string"
      ? productSocialVersion
      : "ivory-v1";
    const socialStore = countryCode === "CY"
      ? "cyprus"
      : countryCode === "AE" && cityId === "abudhabi"
        ? "abudhabi"
        : countryCode === "AE"
          ? "dubai"
          : "lebanon";
    const socialImage = `${window.location.origin}/api/og-image/product/${encodeURIComponent(product.id)}?v=${encodeURIComponent(socialVersion)}&store=${socialStore}`;
    const socialAlt = `Presentail share image for ${product.name}`;
    setMeta('meta[property="og:image"]', { property: "og:image", content: socialImage }, head);
    setMeta('meta[property="og:image:secure_url"]', { property: "og:image:secure_url", content: socialImage }, head);
    setMeta('meta[property="og:image:type"]', { property: "og:image:type", content: "image/jpeg" }, head);
    setMeta('meta[property="og:image:width"]', { property: "og:image:width", content: "1200" }, head);
    setMeta('meta[property="og:image:height"]', { property: "og:image:height", content: "630" }, head);
    setMeta('meta[property="og:image:alt"]', { property: "og:image:alt", content: socialAlt }, head);
    setMeta('meta[name="twitter:image"]', { name: "twitter:image", content: socialImage }, head);
    setMeta('meta[name="twitter:image:alt"]', { name: "twitter:image:alt", content: socialAlt }, head);
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
    // The view model separates OS preamble copy from its explicitly marked
    // bullet items, so the tab never has to infer list structure from raw text.
    return vm?.description ?? "";
  }, [vm]);


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

    if (cityFeeUsd === null) {
      // unknown_area: no city selected yet; from_min: city selected, fee unconfigured.
      // Differentiate so the scheduled card copy is accurate.
      const scheduleLabel = cityId
        ? t("product.delivery.calculatedAtCheckout")   // from_min
        : t("product.delivery.calculatedAfterArea");   // unknown_area
      return {
        expressFeeLabel: buildFeeNode(t("product.delivery.fromMin"), { amount: expressSurcharge }),
        expressFeeSubLabel: undefined as React.ReactNode,
        expressIsFree: false,
        scheduledFeeLabel: scheduleLabel as React.ReactNode,
        scheduledFeeSubLabel: undefined as React.ReactNode,
        scheduledIsFree: false,
        helperIsQualified: false,
        expressSurchargeUsd: expressSurcharge,
      };
    }

    const isFree = freeDeliveryMet;
    // When standard delivery is free the shopper pays $0 standard + surcharge.
    // When not free: cityFee + surcharge.
    // Mirrors the mobile useDeliveryPricing hook exactly.
    const expressTotal = isFree
      ? expressSurcharge
      : cityFeeUsd + expressSurcharge;
    const expressBreakdown: React.ReactNode = isFree
      ? buildFeeNode(t("product.delivery.expressBreakdownFree"), { express: expressSurcharge })
      : buildFeeNode(t("product.delivery.expressBreakdown"), { standard: cityFeeUsd, express: expressSurcharge });

    return {
      expressFeeLabel: buildFeeNode(t("product.delivery.expressTotal"), { amount: expressTotal }),
      expressFeeSubLabel: expressBreakdown,
      expressIsFree: false,
      scheduledFeeLabel: isFree
        ? (t("product.deliveryFree") as React.ReactNode)
        : buildFeeNode(t("product.delivery.standardFeeLabel"), { amount: cityFeeUsd }),
      scheduledFeeSubLabel: t("product.delivery.standardDelivery") as React.ReactNode,
      scheduledIsFree: isFree,
      helperIsQualified: isFree,
      expressSurchargeUsd: expressSurcharge,
    };
  }, [delivery, cityId, freeDeliveryMet, formatPrice, t]);

  // ── Inherited delivery detection ─────────────────────────────────────────
  // The PDP shows a compact inherited-delivery summary when the cart already has
  // items and a delivery selection exists. "isEditingDelivery" overrides this so
  // the shopper can change the window via the full selector.
  const isInherited =
    itemCount > 0 &&
    deliverySelection.hasSelection &&
    !isEditingDelivery;

  // Express ETA: current time + 90 min, formatted in the recipient country's
  // timezone so shoppers browsing from abroad see the correct local time.
  const expressEtaLabel = useMemo(() => {
    if (!expressAvailable) return null;
    const etaDate = new Date(now.getTime() + 90 * 60 * 1000);
    const tz = countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(etaDate);
    return countryCode === "AE"
      ? t("product.delivery.estimatedByUae").replace("{time}", timeStr)
      : t("product.delivery.estimatedBy").replace("{time}", timeStr);
  }, [now, expressAvailable, countryCode, t]);

  // "Arrives by {time} Lebanon/UAE time" — compact inherited-card variant.
  // Unlike expressEtaLabel this doesn't require expressAvailable: the card
  // reflects an already-committed cart selection.
  const expressArrivesLine = useMemo(() => {
    const etaDate = new Date(now.getTime() + 90 * 60 * 1000);
    const tz = countryCode === "AE" ? "Asia/Dubai" : "Asia/Beirut";
    const timeStr = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(etaDate);
    return countryCode === "AE"
      ? t("product.delivery.arrivesByUae").replace("{time}", timeStr)
      : t("product.delivery.arrivesBy").replace("{time}", timeStr);
  }, [now, countryCode, t]);

  // Labels for the inherited scheduled summary card.
  const scheduledDateLabel = useMemo(() => {
    if (!deliverySelection.date) return undefined;
    const dateObj = new Date(deliverySelection.date + "T12:00:00");
    const monthDay = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const todayLocal = getLocalIso(countryCode, now);
    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowLocal = getLocalIso(countryCode, tomorrowDate);
    if (deliverySelection.date === todayLocal) return `Today, ${monthDay}`;
    if (deliverySelection.date === tomorrowLocal) return `Tomorrow, ${monthDay}`;
    const dowShort = dateObj.toLocaleDateString("en-US", { weekday: "short" });
    return `${dowShort}, ${monthDay}`;
  }, [deliverySelection.date, countryCode, now]);

  const scheduledSlotWithTz = useMemo(() => {
    if (!deliverySelection.slotLabel) return null;
    const slotRange = slotTimeRangeShortForLabel(deliverySelection.slotLabel, cityTimeSlots);
    const timeRange = slotRange ?? deliverySelection.slotLabel;
    return countryCode === "AE"
      ? t("product.delivery.scheduledTimeUae").replace("{time}", timeRange)
      : t("product.delivery.scheduledTime").replace("{time}", timeRange);
  }, [deliverySelection.slotLabel, cityTimeSlots, countryCode, t]);

  // Fee line for the compact inherited-delivery card. Reflects the order-level
  // fee already applied to the cart — never implies an additional charge.
  const inheritedFeeLine = useMemo((): React.ReactNode => {
    if (deliverySelection.mode === "express") {
      return buildFeeNode(t("product.delivery.expressUpgradeIncluded"), {
        fee: deliveryCardLabels.expressSurchargeUsd,
      });
    }
    if (deliveryCardLabels.scheduledIsFree) {
      return t("product.delivery.deliveryFreeIncluded");
    }
    if (delivery.cityFeeUsd !== null) {
      return buildFeeNode(t("product.delivery.deliveryFeeIncluded"), {
        fee: delivery.cityFeeUsd,
      });
    }
    return null;
  }, [deliverySelection.mode, deliveryCardLabels, delivery.cityFeeUsd, t]);

  // All-in price shown in the sticky CTA: product price + district fee + express/slot surcharge.
  // Returns null when the city fee is unknown (no location selected) — falls back to product price only.
  const stickyTotalUsd = useMemo(() => {
    if (delivery.cityFeeUsd === null) return null;
    if (!countryCode) return null;
    const fees = calcCheckoutFees({
      subtotal: cartSubtotal + productUsdForPricing,
      countryCode,
      cityId,
      noAddress: false,
      cityFee: delivery.cityFeeUsd,
      freeDeliveryThresholdUsd: delivery.freeDeliveryThresholdUsd ?? undefined,
      freeDeliveryEnabled: delivery.freeDeliveryEnabled,
      deliveryMode: deliveryChoice === "express" ? "express" : "schedule",
      timeSlots: cityTimeSlots,
      deliverySlot: deliverySelection.slotLabel ?? "",
      deliverySlotId: deliverySelection.slotId ?? undefined,
      deliveryDate: deliverySelection.date ?? undefined,
    });
    return productUsdForPricing + fees.districtFee + fees.expressFee + fees.slotFee;
  }, [delivery, cartSubtotal, productUsdForPricing, countryCode, deliveryChoice, cityTimeSlots, deliverySelection.slotLabel, deliverySelection.slotId, deliverySelection.date]);

  // Ref used to scroll the schedule panel into view when Add to Cart is
  // tapped while scheduled is selected but no window has been committed yet.
  const schedulePanelRef = useRef<HTMLDivElement | null>(null);

  const handleSelectExpress = () => {
    if (!expressAvailable) return;
    setDeliveryChoice("express");
    deliverySelection.setSelection({
      mode: "express",
      date: new Date().toISOString().slice(0, 10),
      slotLabel: null,
      slotId: null,
      serviceType: null,
      cityId: null,
      source: "user_selected",
    });
    trackEvent({ name: "express_upgrade_selected", deliveryMethod: "express", deliverySource: "user" });
    trackEvent({ name: "delivery_method_selected", deliveryMethod: "express", deliverySource: "user" });
  };

  const handleSelectScheduled = () => {
    setDeliveryChoice("scheduled");
    // Re-evaluate whether the user already has a committed window from a
    // previous session (mode was a scheduled type and slotLabel is set).
    // If not, they'll need to pick a window before Add to Cart proceeds.
    windowCommittedRef.current =
      deliverySelection.mode !== null &&
      deliverySelection.mode !== "express" &&
      !!deliverySelection.slotLabel;
    // The inline picker below the row handles the actual date/slot
    // selection; if the shopper has no persisted scheduled choice yet,
    // seed today + first available slot so the row's subtitle and the
    // checkout summary line up immediately.
    if (!deliverySelection.mode || deliverySelection.mode === "express") {
      deliverySelection.setSelection({
        mode: "today_slot",
        date: new Date().toISOString().slice(0, 10),
        slotLabel: deliverySelection.slotLabel ?? null,
        slotId: null,
        serviceType: null,
        cityId: null,
        source: "system_default",
      });
    }
    trackEvent({ name: "delivery_method_selected", deliveryMethod: "standard", deliverySource: "user" });
  };

  const handleAdd = () => {
    if (!product) return;

    // Guard: if scheduled is selected but no delivery window has been
    // committed — neither by an explicit panel interaction/emission this
    // session (windowCommittedRef) nor via a complete selection already in
    // context (e.g. inherited from the cart's existing items) — abort the
    // add and surface the scheduler. Only genuinely selection-less first
    // visits hit this path.
    //
    // Inherited-with-date is exempt: the PDP is showing "this item will join
    // your cart's delivery", so the item rides the cart's committed selection
    // even when the slot label is missing in this tab (the express→scheduled
    // system fallback writes mode+date with slotLabel null). Checkout's slot
    // initializer resolves a null slot to the first available window for the
    // date. A selection with no date at all is NOT exempt — that state is
    // genuinely unusable and must go through the scheduler.
    const inheritedRideAlong = isInherited && !!deliverySelection.date;
    if (
      deliveryChoice === "scheduled" &&
      !windowCommittedRef.current &&
      !hasValidContextSelection &&
      !inheritedRideAlong
    ) {
      if (schedulePanelRef.current) {
        schedulePanelRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        // Panel not mounted (compact summary shown) — expand the editor so
        // the shopper actually sees what needs picking instead of a no-op.
        setIsEditingDelivery(true);
      }
      trackEvent({ name: "delivery_scheduler_opened", deliveryMethod: "standard", deliverySource: "auto" });
      return;
    }

    if (!deliverySelection.mode) {
      if (deliveryChoice === "express") {
        deliverySelection.setSelection({
          mode: "express",
          date: new Date().toISOString().slice(0, 10),
          slotLabel: null,
          slotId: null,
          serviceType: null,
          cityId: null,
          source: "system_default",
        });
      } else {
        deliverySelection.setSelection({
          mode: "today_slot",
          date: new Date().toISOString().slice(0, 10),
          slotLabel: null,
          slotId: null,
          serviceType: null,
          cityId: null,
          source: "system_default",
        });
      }
    }
    // When the item joins the cart's inherited delivery, the local radio state
    // (which defaults to "scheduled") is not shown — the inherited selection's
    // mode is what actually applies to this item.
    const isExpressChoice = isInherited
      ? deliverySelection.mode === "express"
      : deliveryChoice === "express";
    addItem(product, 1, customNote || undefined, {
      deliveryMethod: isExpressChoice ? "express" : "standard",
      // expressSurchargeForCountry is already imported and used in deliveryCardLabels;
      // calling it here gives the configured surcharge for the analytics payload.
      deliveryFeeUsd: isExpressChoice ? expressSurchargeForCountry(countryCode) : 0,
    });
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
                delivery.isLoaded && freeDeliveryMet && !isInherited
                  ? deliveryChoice === "express"
                    ? buildFeeNode(t("product.delivery.qualifiedHelperExpress"), { amount: deliveryCardLabels.expressSurchargeUsd })
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

            {isInherited ? (
              <InheritedDeliverySummary
                mode={deliverySelection.mode === "express" ? "express" : "scheduled"}
                detailLine={
                  deliverySelection.mode === "express"
                    ? expressArrivesLine
                    : [scheduledDateLabel, scheduledSlotWithTz].filter(Boolean).join(" · ") || null
                }
                feeLine={inheritedFeeLine}
                onChangeDelivery={() => {
                  setIsEditingDelivery(true);
                  trackEvent({ name: "delivery_change_opened", deliveryMethod: deliverySelection.mode === "express" ? "express" : "standard", deliverySource: "user" });
                }}
              />
            ) : (
              <>
                <DeliveryOptions
                  value={deliveryChoice}
                  onSelectExpress={handleSelectExpress}
                  onSelectScheduled={handleSelectScheduled}
                  expressLabel={delivery.expressDeliveryTimeLabel}
                  expressEtaLine={expressEtaLabel}
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
                  <div ref={schedulePanelRef}>
                    <ScheduleInlinePanel
                      countryCode={countryCode}
                      cityId={cityId}
                      timeSlots={city?.timeSlots}
                      slotsByDay={city?.slotsByDay as Record<string, TimeSlot[]> | undefined}
                      initialDate={deliverySelection.date}
                      initialSlotLabel={deliverySelection.slotLabel}
                      initialSlotId={deliverySelection.slotId}
                      freeDeliveryMet={freeDeliveryMet}
                       onChange={({ mode, date, slotLabel, slotId, serviceType, cityId: selectedCityId }) => {
                        deliverySelection.setSelection({
                          mode,
                          date,
                          slotLabel,
                          slotId: slotId ?? null,
                           serviceType: serviceType ?? null,
                           cityId: selectedCityId ?? null,
                          // The panel auto-picks an initial slot on mount; only
                          // selections after an explicit interaction count as
                          // the shopper's own choice.
                          source: scheduleUserInteractedRef.current ? "user_selected" : "system_default",
                        });
                        // Commit the ref whenever the panel reports a valid selection,
                        // including its automatic initial selection on mount. This lets
                        // first-time visitors click Add to Cart with the default slot
                        // without needing to manually tap a date or time chip first.
                        windowCommittedRef.current = true;
                      }}
                      onUserInteracted={() => {
                        scheduleUserInteractedRef.current = true;
                        windowCommittedRef.current = true;
                        trackEvent({ name: "delivery_window_selected", deliveryMethod: "standard", deliverySource: "user" });
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {!isInherited && !expressAvailable && !deliveryCardLabels.helperIsQualified && (
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

      {slug && product && (
        <CompleteYourGift
          slug={slug}
          anchor={product}
          onBundleAdded={() => setUpsellOpen(true)}
        />
      )}

      <AddToCartUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        addedProduct={product}
        addedQuantity={1}
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

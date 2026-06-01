import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ShoppingBag } from "lucide-react";
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
import { useAuth as useClerkAuth } from "@clerk/react";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductInfo } from "@/components/product/ProductInfo";
import {
  DeliveryOptions,
  type DeliveryChoice,
} from "@/components/product/DeliveryOptions";
import { ProductBenefits } from "@/components/product/ProductBenefits";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { ProductTabs } from "@/components/product/ProductTabs";
import { ScheduleInlinePanel } from "@/components/product/ScheduleInlinePanel";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { buildProductViewModel } from "@/components/product/productViewModel";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import {
  dayLabels,
  formatDeliveryRow,
  isExpressDeliveryAvailable,
} from "@workspace/delivery";
import { useNow } from "@/lib/useNow";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const slug = params?.slug;
  const { t, language } = useLocale();
  const { toast } = useToast();
  const { addItem } = useCart();
  const { isSignedIn } = useClerkAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const { countryCode: locationCountry } = useLocationSelection();
  const [,] = useLocation();
  const [upsellOpen, setUpsellOpen] = useState(false);
  const delivery = useDeliveryConfig();
  const { formatPrice: formatDisplayPrice } = useDisplayCurrency();
  const deliverySelection = useDeliverySelection();

  const { countryCode, cityId } = useLocationSelection();
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
  const expressAvailable = useMemo(
    () => isExpressDeliveryAvailable(countryCode, now),
    [countryCode, now],
  );

  // Local UI choice for the radio. We default to "express" when no shared
  // delivery selection exists AND express is currently available; once the
  // 10 PM cutoff hits, we default to "scheduled" so the row reflects what
  // the shopper can actually pick. A persisted "today_slot"/"schedule"
  // reflects back as the scheduled row.
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>(() => {
    if (deliverySelection.mode && deliverySelection.mode !== "express") {
      return "scheduled";
    }
    return expressAvailable ? "express" : "scheduled";
  });

  // If the recipient-country clock crosses 10 PM while the shopper is on
  // the page, fall back to scheduled and persist a sane default into the
  // shared selection store so checkout doesn't reopen with Express.
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
        { label: catEntry.name, href: `/shop?category=${catSlug}` },
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
  const scheduledRowSubtitle = useMemo(() => {
    const formatted =
      deliverySelection.mode && deliverySelection.mode !== "express"
        ? formatDeliveryRow({
            mode: deliverySelection.mode,
            date: deliverySelection.date,
            slotLabel: deliverySelection.slotLabel,
            days,
            expressLabel: delivery.expressDeliveryTimeLabel,
          })
        : null;
    return formatted ?? t("product.scheduledSubtitle");
  }, [
    deliverySelection.mode,
    deliverySelection.date,
    deliverySelection.slotLabel,
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 max-w-6xl pt-12 pb-24">
        <Skeleton className="h-4 w-64 mb-8" />
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
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
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 max-w-6xl pt-32 pb-24 text-center">
        <h1 className="font-serif text-3xl mb-4">{t("product.notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/shop">{t("product.returnShop")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen relative z-0">
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 max-w-6xl pt-2">
        <PageBreadcrumb crumbs={productBreadcrumbs} />
      </div>
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 max-w-6xl pt-4 sm:pt-6 pb-16 sm:pb-20">
        <div className="grid lg:grid-cols-2 lg:items-start gap-6 sm:gap-8 lg:gap-16">
          <div className="flex flex-col gap-6 sm:gap-8">
            <ProductGallery
              images={vm.galleryImages}
              productName={product.name}
              onShare={handleShare}
              onFavorite={isSignedIn && product ? () => void toggleFavorite(product.id, locationCountry ?? null) : undefined}
              isFavorited={product ? isFavorited(product.id) : false}
            />
            {/* Description / Care Tips sit directly under the image with
                no large grid-row gap. On mobile the tabs render below
                the right-column info block via the order-* override. */}
            <div className="order-2 lg:order-none">
              <ProductTabs
                description={effectiveDescription}
                bouquetIncludes={vm.bouquetIncludes}
                careTips={vm.careTips}
              />
            </div>
          </div>

          <div className="flex flex-col gap-6 sm:gap-7">
            <ProductInfo
              name={product.name}
              price={formatDisplayPrice(product.priceValue)}
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
            />

            {deliveryChoice === "scheduled" && (
              <ScheduleInlinePanel
                countryCode={countryCode}
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
                <ShoppingBag className="w-5 h-5 mr-2" />
                {vm.inStock ? t("product.addToCart") : t("product.outOfStock")}
              </Button>
            </div>

            <ProductBenefits freeDeliveryThreshold={delivery.freeDeliveryThreshold} />

            <PaymentMethods
              label={t("payments.waysToPay")}
              countryCode={countryCode}
            />
          </div>
        </div>

      </div>

      <AddToCartUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useProducts } from "@/lib/queries";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductInfo } from "@/components/product/ProductInfo";
import { DeliveryOptions, type DeliveryChoice } from "@/components/product/DeliveryOptions";
import { ProductBenefits } from "@/components/product/ProductBenefits";
import { PaymentMethods } from "@/components/product/PaymentMethods";
import { ProductTabs } from "@/components/product/ProductTabs";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { buildProductViewModel } from "@/components/product/productViewModel";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const slug = params?.slug;
  const { t, language } = useLocale();
  const { toast } = useToast();
  const { addItem } = useCart();
  const delivery = useDeliveryConfig();
  const {
    currencyCode,
    setCurrencyCode,
    formatPrice: formatDisplayPrice,
    supportedCurrencies,
    isManual,
    isManualPersistent,
    setManualPersistent,
    clearManualCurrency,
  } = useDisplayCurrency();

  const { countryCode, cityId } = useLocationSelection();
  const locParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) locParams.countryCode = countryCode;
  if (cityId) locParams.cityId = cityId;
  const { data: allData, isLoading } = useProducts(locParams);
  const product = allData?.products?.find((p) => p.id === slug);

  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>("express");
  const [qty, setQty] = useState(1);
  const vm = useMemo(
    () => (product ? buildProductViewModel(product) : null),
    [product],
  );

  const handleAdd = () => {
    if (!product) return;
    addItem(product, qty);
    toast({
      title: t("product.toast.addedTitle"),
      description:
        qty > 1
          ? t("product.toast.addedDescQty", { qty, name: product.name })
          : t("product.toast.addedDesc", { name: product.name }),
    });
  };

  const handleShare = async () => {
    if (typeof window === "undefined" || !product || !slug) return;
    // Mirror the mobile URL shape (`${origin}/product/<slug>`) so links
    // shared from web and mobile look identical and have no tracking params.
    const url = `${window.location.origin}/product/${encodeURIComponent(String(slug))}`;
    const nav = typeof navigator !== "undefined"
      ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> })
      : null;
    if (nav?.share) {
      try {
        await nav.share({ title: product.name, url });
        return;
      } catch (err) {
        // AbortError = user cancelled — silently no-op, don't fall back.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Other errors (NotAllowedError on insecure contexts, etc.) → fall through to clipboard.
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
      // fall through to unavailable toast
    }
    toast({
      title: t("product.share.unavailable.title"),
      description: t("product.share.unavailable.desc"),
      variant: "destructive",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 pt-12 pb-24">
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

  if (!product || !vm) {
    return (
      <div className="container mx-auto px-4 pt-32 pb-24 text-center">
        <h1 className="font-serif text-3xl mb-4">{t("product.notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/shop">{t("product.returnShop")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 pt-8 pb-20">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
          <ProductGallery
            images={vm.galleryImages}
            productName={product.name}
            onShare={handleShare}
          />

          <div className="flex flex-col gap-7">
            <ProductInfo
              name={product.name}
              price={formatDisplayPrice(product.priceValue)}
              taxLabel="TAX Inclusive"
              rewardPoints={vm.rewardPoints}
            />

            <DeliveryOptions
              value={deliveryChoice}
              onChange={setDeliveryChoice}
              expressLabel={delivery.expressDeliveryTimeLabel}
            />

            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <div
                className="flex items-center border border-border rounded-xl overflow-hidden bg-card shrink-0"
                data-testid="product-quantity"
              >
                <button
                  type="button"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  className="px-3 h-14 text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
                  aria-label={t("cart.decreaseAria")}
                  data-testid="button-quantity-decrease"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span
                  className="w-10 text-center font-medium text-sm select-none"
                  data-testid="text-quantity"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(qty + 1)}
                  className="px-3 h-14 text-foreground hover:bg-secondary transition-colors"
                  aria-label={t("cart.increaseAria")}
                  data-testid="button-quantity-increase"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

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

            <PaymentMethods label={t("payments.waysToPay")} countryCode={countryCode} />
          </div>
        </div>

        <ProductTabs
          description={vm.description}
          bouquetIncludes={vm.bouquetIncludes}
          careTips={vm.careTips}
        />

        <div
          className="mt-16 border-t border-border pt-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6"
          data-testid="product-currency-switcher"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Preview price in
            </p>
            <p className="text-sm text-foreground mt-1">
              Choose a currency to see how this product is priced for you.
            </p>
          </div>
          <div className="w-full sm:w-72 flex flex-col gap-3">
            <Select
              value={currencyCode}
              onValueChange={(v) => setCurrencyCode(v)}
            >
              <SelectTrigger
                className="h-12 rounded-xl"
                data-testid="select-display-currency"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCurrencies.map((c) => (
                  <SelectItem
                    key={c.code}
                    value={c.code}
                    data-testid={`option-currency-${c.code}`}
                  >
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="remember-currency"
                  checked={isManualPersistent}
                  disabled={!isManual}
                  onCheckedChange={(checked) => setManualPersistent(!!checked)}
                  data-testid="switch-remember-currency"
                />
                <Label
                  htmlFor="remember-currency"
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Remember this choice
                </Label>
              </div>
              {isManual && (
                <button
                  type="button"
                  onClick={clearManualCurrency}
                  className="text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                  data-testid="button-reset-currency"
                >
                  Reset to auto
                </button>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

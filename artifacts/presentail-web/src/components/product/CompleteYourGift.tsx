/**
 * "Complete your gift" PDP upsell module.
 *
 * Fetches slot recommendations from GET /api/products/complete-your-gift
 * (behind the server-side CYG_ROLLOUT flag). When the flag is off, the
 * endpoint returns `enabled: false` and this component renders the legacy
 * FrequentlyBoughtTogether module instead, so the old behaviour is restored
 * without a frontend deployment.
 *
 * Layout per design: anchor "Your gift" card (locked) followed by up to four
 * add-on cards (chocolate, cake, balloon, stuffed animal) with "+ Add"
 * toggles, and a footer with item count, bundle total, and a single
 * add-to-cart CTA.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { useCart } from "@/contexts/CartContext";
import { FormattedPrice } from "@/components/FormattedPrice";
import { Button } from "@/components/ui/button";
import { FrequentlyBoughtTogether } from "@/components/product/FrequentlyBoughtTogether";
import { trackWebEvent, getOrCreateSessionId } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/queries";

function countryToStore(
  countryCode: string | null | undefined,
  cityId: string | null | undefined,
): "lebanon" | "dubai" | "abudhabi" | "cyprus" {
  if (!countryCode) return "lebanon";
  if (countryCode === "CY") return "cyprus";
  if (countryCode === "AE") {
    if (cityId?.includes("abudhabi")) return "abudhabi";
    return "dubai";
  }
  return "lebanon";
}

type CygSlot = {
  category: string;
  slotIndex: number;
  productSlug: string;
  osNumericId: string | null;
  wcId: number | null;
  name: string;
  imageUrl: string | null;
  imageAlt: string;
  incrementalPrice: number;
  regularPrice: number | null;
  currency: string;
  incrementalPriceUsd: number;
  regularPriceUsd: number | null;
  inStock: boolean;
  requiresOptions: boolean;
  quantity: { min: number; max: number };
  rulesVersion: string;
  token: string;
};

type CygResponse = {
  enabled: boolean;
  experiment: { id: string; variant: string; mode: string };
  rulesVersion: string;
  slots: CygSlot[];
  reason?: string;
};

function slotToProduct(s: CygSlot): Product {
  return {
    id: s.productSlug,
    wcId: s.wcId ?? 0,
    name: s.name,
    price: String(s.incrementalPriceUsd),
    priceValue: s.regularPriceUsd ?? s.incrementalPriceUsd,
    image: s.imageUrl ? { uri: s.imageUrl } : null,
    images: s.imageUrl ? [{ uri: s.imageUrl }] : [],
    category: s.category,
    categories: [s.category],
    occasions: [],
    inStock: s.inStock,
    discountPriceValue:
      s.regularPriceUsd != null && s.incrementalPriceUsd < s.regularPriceUsd
        ? s.incrementalPriceUsd
        : null,
    discountPriceAed: null,
  } as Product;
}

function effectiveAnchorPrice(p: Product): number {
  return p.discountPriceValue ?? p.priceValue;
}

interface Props {
  slug: string;
  anchor: Product;
}

export function CompleteYourGift({ slug, anchor }: Props) {
  const { t } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const { addItem, items: cartItems } = useCart();
  const store = countryToStore(countryCode, cityId);
  const sessionId = getOrCreateSessionId();

  const cartCsv = useMemo(
    () => cartItems.map((i) => i.product.id).join(","),
    [cartItems],
  );

  const { data } = useQuery<CygResponse>({
    queryKey: ["complete-your-gift", slug, store, cityId, cartCsv, sessionId],
    queryFn: () => {
      const params = new URLSearchParams({ slug, store });
      if (cityId) params.set("city", cityId);
      if (cartCsv) params.set("cart", cartCsv);
      if (sessionId) params.set("sessionId", sessionId);
      return apiFetch<CygResponse>(`/products/complete-your-gift?${params.toString()}`);
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const slots = data?.enabled ? (data.slots ?? []) : [];
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const viewedRef = useRef(false);

  useEffect(() => {
    setSelected({});
  }, [data]);

  // Funnel analytics — module view + one impression per slot, once per load.
  useEffect(() => {
    if (!data?.enabled || slots.length === 0 || viewedRef.current) return;
    viewedRef.current = true;
    const base = {
      experimentId: data.experiment.id,
      experimentVariant: data.experiment.variant,
      modelVersion: data.rulesVersion,
      store,
      city: cityId ?? undefined,
      anchorSlug: slug,
    };
    trackWebEvent({
      type: "upsell_module_view",
      properties: { ...base, slotCount: slots.length },
    });
    for (const s of slots) {
      trackWebEvent({
        type: "upsell_item_impression",
        properties: {
          ...base,
          token: s.token,
          category: s.category,
          slotIndex: s.slotIndex,
          productSlug: s.productSlug,
          priceUsd: s.incrementalPriceUsd,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Flag off / no candidates → keep the legacy FBT module (control behaviour).
  if (!data || !data.enabled || slots.length === 0) {
    return <FrequentlyBoughtTogether slug={slug} anchor={anchor} />;
  }

  const anchorPrice = effectiveAnchorPrice(anchor);
  const anchorImage = anchor.image?.uri ?? anchor.images?.[0]?.uri;
  const selectedSlots = slots.filter((s) => selected[s.productSlug] && s.inStock);
  const total = anchorPrice + selectedSlots.reduce((sum, s) => sum + s.incrementalPriceUsd, 0);
  const totalItems = 1 + selectedSlots.length;

  function eventProps(s: CygSlot) {
    return {
      experimentId: data!.experiment.id,
      experimentVariant: data!.experiment.variant,
      modelVersion: data!.rulesVersion,
      token: s.token,
      category: s.category,
      slotIndex: s.slotIndex,
      productSlug: s.productSlug,
      priceUsd: s.incrementalPriceUsd,
      store,
      city: cityId ?? undefined,
      anchorSlug: slug,
    };
  }

  function toggle(s: CygSlot) {
    const isSelected = !!selected[s.productSlug];
    trackWebEvent({
      type: isSelected ? "upsell_remove_click" : "upsell_add_click",
      properties: eventProps(s),
    });
    setSelected((prev) => ({ ...prev, [s.productSlug]: !isSelected }));
  }

  function handleAddBundle() {
    trackWebEvent({
      type: "upsell_bundle_add_attempt",
      properties: {
        experimentId: data!.experiment.id,
        experimentVariant: data!.experiment.variant,
        modelVersion: data!.rulesVersion,
        anchorSlug: slug,
        selectedCount: selectedSlots.length,
        totalUsd: total,
        store,
        city: cityId ?? undefined,
      },
    });
    try {
      addItem(anchor, 1);
      for (const s of selectedSlots) {
        addItem(slotToProduct(s), 1);
      }
      trackWebEvent({
        type: "upsell_bundle_add_success",
        properties: {
          anchorSlug: slug,
          selectedCount: selectedSlots.length,
          totalUsd: total,
          tokens: selectedSlots.map((s) => s.token),
        },
      });
    } catch (err) {
      trackWebEvent({
        type: "upsell_bundle_add_failure",
        properties: {
          anchorSlug: slug,
          failureReason: err instanceof Error ? err.message : "unknown",
        },
      });
      throw err;
    }
  }

  return (
    <section
      className="container mx-auto px-page max-w-content pt-8 pb-6"
      data-testid="complete-your-gift"
    >
      <div className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <h2 className="font-serif text-2xl sm:text-3xl text-foreground">
          {t("product.cyg.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("product.cyg.subtitle")}</p>

        {/* Card row */}
        <div className="mt-6 flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth scrollbar-none">
          {/* Anchor card — locked */}
          <div className="snap-start shrink-0 w-40 sm:w-44 flex flex-col rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-1 px-3 pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground truncate">
                {t("product.cyg.yourGift")}
              </span>
              <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
            </div>
            <div className="p-3 pb-0">
              <div className="aspect-square rounded-lg overflow-hidden bg-secondary/30">
                {anchorImage ? (
                  <img
                    src={anchorImage}
                    alt={anchor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
            </div>
            <div className="flex flex-col items-center gap-1 px-3 py-3 text-center">
              <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 min-h-[2rem]">
                {anchor.name}
              </p>
              <FormattedPrice
                usdValue={anchorPrice}
                className="text-sm font-semibold text-foreground"
              />
            </div>
          </div>

          {/* Slot cards */}
          {slots.map((s) => {
            const isSelected = !!selected[s.productSlug];
            return (
              <div
                key={s.productSlug}
                data-testid={`cyg-slot-${s.category}`}
                className={cn(
                  "snap-start shrink-0 w-40 sm:w-44 flex flex-col rounded-xl border bg-card overflow-hidden transition-colors",
                  isSelected ? "border-foreground" : "border-border",
                )}
              >
                <div className="p-3 pb-0">
                  <div className="aspect-square rounded-lg overflow-hidden bg-secondary/30">
                    {s.imageUrl ? (
                      <img
                        src={s.imageUrl}
                        alt={s.imageAlt || s.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full" />
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 px-3 pt-3 text-center flex-1">
                  <p className="text-xs font-medium text-foreground leading-tight line-clamp-2 min-h-[2rem]">
                    {s.name}
                  </p>
                  <FormattedPrice
                    usdValue={s.incrementalPriceUsd}
                    className="text-sm font-semibold text-foreground"
                  />
                </div>
                <div className="p-3">
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    disabled={!s.inStock}
                    data-testid={`cyg-add-${s.category}`}
                    className={cn(
                      "w-full rounded-lg border py-1.5 text-xs font-semibold transition-colors",
                      isSelected
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/60 bg-card text-foreground hover:bg-secondary/40",
                      !s.inStock && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    {isSelected ? t("product.cyg.added") : t("product.cyg.add")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 pt-4 border-t border-border">
          <div className="flex items-baseline gap-3">
            <span className="text-sm text-foreground">
              {t(totalItems === 1 ? "product.cyg.item" : "product.cyg.items", {
                count: totalItems,
              })}
            </span>
            <FormattedPrice
              usdValue={total}
              className="text-base font-semibold text-foreground"
            />
          </div>
          <Button
            size="lg"
            className="sm:ml-auto"
            disabled={!anchor.inStock}
            onClick={handleAddBundle}
            data-testid="cyg-add-bundle"
          >
            {t("product.cyg.addToCart")}
          </Button>
        </div>
      </div>
    </section>
  );
}

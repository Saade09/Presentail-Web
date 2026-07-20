import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Truck, X } from "lucide-react";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  cityName: string;
  subtotalUsd: number;
  newThresholdUsd: number | null;
  onClose: () => void;
  onViewCart: () => void;
};

function InlinePrice({ template, placeholder, usdValue }: { template: string; placeholder: string; usdValue: number }) {
  const parts = template.split(placeholder);
  if (parts.length < 2) return <>{template} <FormattedPrice usdValue={usdValue} /></>;
  return (
    <>
      {parts[0]}
      <FormattedPrice usdValue={usdValue} />
      {parts.slice(1).join(placeholder)}
    </>
  );
}

export function FreeDeliveryChangedModal({
  open,
  cityName,
  subtotalUsd,
  newThresholdUsd,
  onClose,
  onViewCart,
}: Props) {
  const { t } = useLocale();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const hasThreshold = newThresholdUsd != null && newThresholdUsd > 0;
  const remaining = hasThreshold ? Math.max(newThresholdUsd! - subtotalUsd, 0) : 0;
  const progressPct = hasThreshold
    ? Math.min((subtotalUsd / newThresholdUsd!) * 100, 100)
    : 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[90] bg-black/55 flex flex-col justify-end
                     md:items-center md:justify-center md:p-4
                     data-[state=open]:animate-in data-[state=closed]:animate-out
                     data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => { e.preventDefault(); closeBtnRef.current?.focus(); }}
            aria-describedby="fdc-desc"
            className="relative w-full bg-white shadow-2xl flex flex-col overflow-hidden
                       rounded-t-[22px] pb-[env(safe-area-inset-bottom)]
                       md:max-w-[540px] md:rounded-[22px] md:pb-0
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                       data-[state=open]:slide-in-from-bottom md:data-[state=open]:zoom-in-95
                       data-[state=closed]:slide-out-to-bottom md:data-[state=closed]:zoom-out-95"
          >
            <DialogPrimitive.Title className="sr-only">
              {t("cart.fdc.title")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id="fdc-desc" className="sr-only">
              {t(hasThreshold ? "cart.fdc.body" : "cart.fdc.noFreeDelivery", { city: cityName })}
            </DialogPrimitive.Description>

            <div className="p-7 md:p-8 overflow-y-auto max-h-[90dvh] md:max-h-none">
              {/* Close button */}
              <DialogPrimitive.Close
                ref={closeBtnRef}
                aria-label={t("cart.fdc.closeAria")}
                className="absolute top-4 right-4 rounded-full p-1.5 hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>

              {/* Truck icon */}
              <div className="w-11 h-11 rounded-full bg-[#f5f0e8] flex items-center justify-center mb-4">
                <Truck className="w-5 h-5 text-[#00414e]" strokeWidth={1.75} />
              </div>

              {/* Heading */}
              <h2 className="font-serif text-xl text-[#00414e] leading-snug mb-2">
                {t("cart.fdc.title")}
              </h2>

              {/* Body */}
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                {t(hasThreshold ? "cart.fdc.body" : "cart.fdc.noFreeDelivery", { city: cityName })}
              </p>

              {/* Summary box */}
              {hasThreshold && (
                <div className="border border-gray-200 rounded-xl px-4 py-3 mb-5 text-sm">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-muted-foreground">{t("cart.fdc.cartSubtotal")}</span>
                    <span className="font-medium">
                      <FormattedPrice usdValue={subtotalUsd} />
                    </span>
                  </div>
                  <div className="flex justify-between mb-3">
                    <span className="text-muted-foreground">{t("cart.fdc.freeDeliveryFrom")}</span>
                    <span className="font-medium">
                      <FormattedPrice usdValue={newThresholdUsd!} />
                    </span>
                  </div>

                  {/* Progress bar + percentage */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#00414e] transition-[width]"
                        style={{ width: `${progressPct}%` }}
                        role="progressbar"
                        aria-valuenow={Math.round(progressPct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">
                      {Math.round(progressPct)}%
                    </span>
                  </div>

                  {/* "Add X more" */}
                  <p className="text-xs text-foreground">
                    <InlinePrice
                      template={t("cart.fdc.addMore")}
                      placeholder="{amount}"
                      usdValue={remaining}
                    />
                  </p>
                </div>
              )}

              {/* Primary CTA */}
              <Button
                size="lg"
                className="w-full rounded-full mb-3 bg-[#00414e] hover:bg-[#00414e]/90"
                onClick={onClose}
                data-testid="fdc-continue-shopping"
              >
                {t("cart.fdc.continueShopping")}
              </Button>

              {/* Secondary link */}
              <button
                type="button"
                className="w-full text-sm text-center underline text-muted-foreground hover:text-foreground transition-colors mb-5"
                onClick={onViewCart}
                data-testid="fdc-continue-to-cart"
              >
                {t("cart.fdc.continueToCart")}
              </button>

              {/* Fine-print note */}
              {hasThreshold && (
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  <InlinePrice
                    template={t("cart.fdc.note")}
                    placeholder="{threshold}"
                    usdValue={newThresholdUsd!}
                  />
                </p>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

import { useState } from "react";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { CheckCircle } from "lucide-react";
import { LoyaltyInfoModal } from "@/components/loyalty/LoyaltyInfoModal";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  name: string;
  price: ReactNode;
  taxLabel: string;
  rewardPoints: number;
  /** Badge shown between the price row and the product title when free delivery is earned. */
  freeDeliveryBadge?: ReactNode;
};

export function ProductInfo({ name, price, taxLabel, rewardPoints, freeDeliveryBadge }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-3 lg:mb-1.5">
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-serif text-2xl md:text-3xl text-foreground"
            data-testid="product-price"
          >
            {price}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {taxLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 shrink-0"
          data-testid="product-points-info"
          aria-label={t("product.pointsAria")}
        >
          <Sparkles className="w-3 h-3 text-gold" />
          <span
            className="text-[10px] font-semibold text-gold"
            data-testid="product-points"
          >
            {t("product.earnPoints", { points: String(rewardPoints) })}
          </span>
        </button>
      </div>

      {freeDeliveryBadge && (
        <div className="flex items-center gap-1.5 mb-2" data-testid="free-delivery-badge">
          <CheckCircle className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-[13px] font-medium text-primary leading-snug">
            {freeDeliveryBadge}
          </span>
        </div>
      )}

      <h1
        className="font-serif text-3xl md:text-4xl leading-tight text-foreground"
        data-testid="product-title"
      >
        {name}
      </h1>

      <LoyaltyInfoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

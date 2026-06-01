import { useState } from "react";
import { Sparkles } from "lucide-react";
import { LoyaltyInfoModal } from "@/components/loyalty/LoyaltyInfoModal";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  name: string;
  price: string;
  taxLabel: string;
  rewardPoints: number;
};

export function ProductInfo({ name, price, taxLabel, rewardPoints }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();
  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-baseline gap-3">
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
          className="flex items-center gap-1.5 shrink-0"
          data-testid="product-points-info"
          aria-label={t("product.pointsAria")}
        >
          <Sparkles className="w-3.5 h-3.5 text-gold" />
          <span
            className="text-xs font-semibold text-gold"
            data-testid="product-points"
          >
            {t("product.earnPoints", { points: String(rewardPoints) })}
          </span>
        </button>
      </div>

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

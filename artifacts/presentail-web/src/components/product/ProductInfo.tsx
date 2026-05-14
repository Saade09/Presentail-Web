import { useState } from "react";
import { Sparkles } from "lucide-react";
import { LoyaltyInfoModal } from "@/components/loyalty/LoyaltyInfoModal";

type Props = {
  name: string;
  price: string;
  taxLabel: string;
  rewardPoints: number;
};

export function ProductInfo({ name, price, taxLabel, rewardPoints }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1
          className="font-serif text-3xl md:text-4xl leading-tight text-foreground"
          data-testid="product-title"
        >
          {name}
        </h1>
        <div className="mt-3 flex items-baseline gap-3">
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
      </div>

      <div className="text-right shrink-0">
        <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="w-7 h-7 rounded-full bg-gold flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </span>
          <span data-testid="product-points">Earn {rewardPoints} Points</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block mt-1 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline ml-auto"
          data-testid="product-points-info"
        >
          Presentail Points
        </button>
      </div>
      <LoyaltyInfoModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

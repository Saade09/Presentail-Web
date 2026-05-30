import { Sparkles } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

// Static, source-of-truth-mirrored copy of the loyalty tiers. The server's
// engine in `lib/loyalty.ts` carries the canonical version — keep these in
// sync if thresholds or discounts change. Used by both the account panel
// and the product page explainer modal.
export const LOYALTY_TIERS_INFO = [
  { key: "regular", label: "Regular", threshold: 300, discountPercent: 10 },
  { key: "loyal", label: "Loyal", threshold: 600, discountPercent: 15 },
  { key: "vip", label: "VIP", threshold: 1000, discountPercent: 20 },
] as const;

export function LoyaltyTiersExplainer({
  current,
  points,
}: {
  current?: string;
  points?: number;
}) {
  const { t } = useLocale();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t("loyalty.earnDescFull")}
      </p>
      <div className="rounded-2xl border border-border/60 divide-y divide-border/60 overflow-hidden bg-background/40">
        {LOYALTY_TIERS_INFO.map((tier) => {
          const isCurrent = current === tier.key;
          const reached =
            typeof points === "number" && points >= tier.threshold;
          return (
            <div
              key={tier.key}
              className={`flex items-center justify-between gap-4 px-4 py-3 ${
                isCurrent ? "bg-secondary/40" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    reached ? "bg-gold" : "bg-secondary"
                  }`}
                >
                  <Sparkles
                    className={`w-4 h-4 ${
                      reached ? "text-white" : "text-muted-foreground"
                    }`}
                  />
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{tier.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {tier.threshold} points
                  </div>
                </div>
              </div>
              <div className="text-sm font-medium text-right">
                {tier.discountPercent}% off
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Your tier coupon is single-use and personal to your account. If an
        order is cancelled or refunded, the points credited for it are
        reversed.
      </p>
    </div>
  );
}

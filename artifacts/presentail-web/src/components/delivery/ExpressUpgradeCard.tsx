import { Zap } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { buildFeeNode } from "@/lib/feeNode";

interface Props {
  /**
   * Dynamic "Arrives by [time]" promise line. `null` when an exact ETA is
   * unavailable — the card gracefully falls back to the "Within 90 minutes"
   * copy instead of showing a stale time.
   */
  arrival: string | null;
  /** Incremental price of upgrading (USD): express total fee − currently applied delivery fee/credit. */
  deltaUsd: number;
  /** Fired when the shopper taps Upgrade. Guarded against double-clicks by `upgrading`. */
  onUpgrade: () => void;
  /** True while the selection switch is in flight — disables the button. */
  upgrading?: boolean;
}

/**
 * Unselected Express upgrade card shown under the selected Standard delivery
 * row in the cart's Delivery Summary. Warm-cream background with a muted-teal
 * border, consistent with the storefront design system.
 */
export function ExpressUpgradeCard({ arrival, deltaUsd, onUpgrade, upgrading = false }: Props) {
  const { t } = useLocale();
  return (
    <div
      className="mt-3 flex items-center gap-3 rounded-xl border border-primary/25 bg-[#FBF7EF] px-4 py-3"
      data-testid="card-express-upgrade"
    >
      <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-muted-foreground" data-testid="text-express-upgrade-title">
          {t("delivery.promise.expressTitle")}
        </span>
        <span
          className="block text-sm font-semibold text-foreground whitespace-normal break-words"
          data-testid="text-express-upgrade-arrival"
        >
          {arrival ?? t("delivery.promise.within90")}
        </span>
        <span className="block text-[11px] text-muted-foreground" data-testid="text-express-upgrade-caption">
          {t("delivery.promise.within90")}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="whitespace-nowrap text-sm font-semibold text-primary tabular-nums" data-testid="text-express-upgrade-delta">
          {buildFeeNode(t("cart.expressDelta"), { amount: deltaUsd })}
        </span>
        <button
          type="button"
          onClick={onUpgrade}
          disabled={upgrading}
          aria-busy={upgrading}
          className="min-h-9 rounded-full border border-primary/30 bg-white px-4 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
          data-testid="button-express-upgrade"
        >
          {t("cart.expressUpgradeCta")}
        </button>
      </div>
    </div>
  );
}

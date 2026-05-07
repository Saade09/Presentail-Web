import { Truck } from "lucide-react";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";
import { useLocationSelection } from "@/contexts/LocationContext";
import { formatStorePrice } from "@/lib/currency";

type Props = {
  className?: string;
  /**
   * When provided, renders a dynamic progress banner showing how much more the
   * shopper needs to add (or a celebratory unlocked message). When omitted,
   * falls back to the static "Free delivery on orders above X" message.
   */
  subtotal?: number;
};

function parseThresholdAmount(label: string): number {
  const match = label.match(/[\d.,]+/);
  if (!match) return Number.NaN;
  return parseFloat(match[0].replace(/,/g, ""));
}

export function FreeDeliveryBanner({ className, subtotal }: Props) {
  const { freeDeliveryThreshold, expressDeliveryTimeLabel } =
    useDeliveryConfig();
  const { countryCode } = useLocationSelection();

  const showProgress = typeof subtotal === "number" && subtotal >= 0;
  const thresholdAmount = parseThresholdAmount(freeDeliveryThreshold);
  const hasThreshold = Number.isFinite(thresholdAmount) && thresholdAmount > 0;

  const remaining = showProgress && hasThreshold
    ? Math.max(thresholdAmount - subtotal!, 0)
    : 0;
  const unlocked = showProgress && hasThreshold && subtotal! >= thresholdAmount;
  const progressPct = showProgress && hasThreshold
    ? Math.min((subtotal! / thresholdAmount) * 100, 100)
    : 0;

  return (
    <div
      data-testid="free-delivery-banner"
      className={`flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3 ${className ?? ""}`}
    >
      <span className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-primary shrink-0">
        <Truck className="w-4 h-4" />
      </span>
      <div className="min-w-0 text-xs flex-1">
        {showProgress && hasThreshold ? (
          <>
            <p className="font-semibold text-foreground">
              {unlocked
                ? "You've unlocked Free Standard Delivery"
                : `Only ${formatStorePrice(remaining, countryCode)} left to unlock Free Standard Delivery`}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#d97706] transition-[width] duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="font-semibold text-foreground text-[11px] shrink-0">
                {formatStorePrice(subtotal!, countryCode)}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="font-semibold text-foreground">
              Free delivery on orders above {freeDeliveryThreshold}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {expressDeliveryTimeLabel} with express delivery.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

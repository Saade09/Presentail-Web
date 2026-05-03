import { Truck } from "lucide-react";
import { useDeliveryConfig } from "@/components/product/useDeliveryConfig";

type Props = {
  className?: string;
};

export function FreeDeliveryBanner({ className }: Props) {
  const { freeDeliveryThreshold, expressDeliveryTimeLabel } =
    useDeliveryConfig();

  return (
    <div
      data-testid="free-delivery-banner"
      className={`flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3 ${className ?? ""}`}
    >
      <span className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-primary shrink-0">
        <Truck className="w-4 h-4" />
      </span>
      <div className="min-w-0 text-xs">
        <p className="font-semibold text-foreground">
          Free delivery on orders above {freeDeliveryThreshold}
        </p>
        <p className="text-muted-foreground mt-0.5">
          {expressDeliveryTimeLabel} with express delivery.
        </p>
      </div>
    </div>
  );
}

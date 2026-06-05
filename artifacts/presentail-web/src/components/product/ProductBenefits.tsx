import type { ReactNode } from "react";
import { MapPin, Navigation, Truck } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  freeDeliveryThresholdNode: ReactNode;
  freeDeliveryEnabled?: boolean;
};

export function ProductBenefits({ freeDeliveryThresholdNode, freeDeliveryEnabled = true }: Props) {
  const { t } = useLocale();
  const items: { icon: ReactNode; title: string; sub: ReactNode }[] = [
    ...(freeDeliveryEnabled
      ? [
          {
            icon: <Truck className="w-5 h-5" />,
            title: t("product.benefit.freeDelivery.title"),
            sub: <>{t("cart.banner.onOrdersAbove")} {freeDeliveryThresholdNode}.</>,
          },
        ]
      : []),
    {
      icon: <MapPin className="w-5 h-5" />,
      title: t("product.benefit.noAddress.title"),
      sub: t("product.benefit.noAddress.sub"),
    },
    {
      icon: <Navigation className="w-5 h-5" />,
      title: t("product.benefit.tracking.title"),
      sub: t("product.benefit.tracking.sub"),
    },
  ];

  return (
    <div className="space-y-3" data-testid="product-benefits">
      {items.map((b) => (
        <div
          key={b.title}
          className="flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
        >
          <span className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0">
            {b.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{b.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{b.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

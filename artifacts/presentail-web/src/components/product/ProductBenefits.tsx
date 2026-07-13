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
            icon: <Truck className="w-4 h-4" />,
            title: t("product.benefit.freeDelivery.title"),
            sub: <>{t("cart.banner.onOrdersAbove")} {freeDeliveryThresholdNode}.</>,
          },
        ]
      : []),
    {
      icon: <MapPin className="w-4 h-4" />,
      title: t("product.benefit.noAddress.title"),
      sub: t("product.benefit.noAddress.sub"),
    },
    {
      icon: <Navigation className="w-4 h-4" />,
      title: t("product.benefit.tracking.title"),
      sub: t("product.benefit.tracking.sub"),
    },
  ];

  return (
    <div
      className="flex rounded-2xl border border-border bg-card shadow-sm rtl:flex-row-reverse"
      data-testid="product-benefits"
    >
      {items.map((b, i) => (
        <div key={b.title} className="flex-1 flex items-stretch">
          {i > 0 && <div className="w-px bg-border self-stretch shrink-0" />}
          <div className="flex-1 flex flex-col items-center text-center px-2 py-3 rtl:text-right">
            <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-primary shrink-0 mb-1.5">
              {b.icon}
            </span>
            <p className="text-[11px] font-semibold text-foreground leading-tight">{b.title}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{b.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

import { MapPin, Navigation, Truck } from "lucide-react";

type Props = {
  freeDeliveryThreshold: string;
};

export function ProductBenefits({ freeDeliveryThreshold }: Props) {
  const items = [
    {
      icon: <Truck className="w-5 h-5" />,
      title: "Free Standard Delivery",
      sub: `On orders above ${freeDeliveryThreshold}.`,
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      title: "No Address Hassle",
      sub: "We collect the recipient's address for you.",
    },
    {
      icon: <Navigation className="w-5 h-5" />,
      title: "Live Order Tracking",
      sub: "Real-time updates from atelier to door.",
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

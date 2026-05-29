import { Package, Bell, Sparkles, MapPin } from "lucide-react";

type ShortcutTab = "orders" | "notifications" | "loyalty" | "addresses";

interface ShortcutCardsProps {
  onNavigate: (tab: ShortcutTab) => void;
  ordersCount?: number;
}

const shortcuts = [
  {
    id: "orders" as const,
    icon: Package,
    labelKey: "account.orders",
    color: "text-primary bg-primary/8",
  },
  {
    id: "notifications" as const,
    icon: Bell,
    labelKey: "account.notifications",
    color: "text-blush-fg bg-blush/40",
  },
  {
    id: "loyalty" as const,
    icon: Sparkles,
    labelKey: "account.loyalty",
    color: "text-gold bg-gold/10",
  },
  {
    id: "addresses" as const,
    icon: MapPin,
    labelKey: "account.addresses",
    color: "text-teal-600 bg-teal-50",
  },
];

export function AccountShortcutCards({ onNavigate, ordersCount }: ShortcutCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      {shortcuts.map(({ id, icon: Icon, color }) => (
        <button
          key={id}
          type="button"
          onClick={() => onNavigate(id)}
          className="group flex flex-col items-center gap-2.5 bg-card rounded-2xl p-4 border border-border/60 hover:border-primary/20 hover:shadow-sm transition-all text-center"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <ShortcutLabel id={id} ordersCount={ordersCount} />
        </button>
      ))}
    </div>
  );
}

function ShortcutLabel({
  id,
  ordersCount,
}: {
  id: ShortcutTab;
  ordersCount?: number;
}) {
  const labels: Record<ShortcutTab, string> = {
    orders: "My Orders",
    notifications: "Notifications",
    loyalty: "Points",
    addresses: "Addresses",
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-medium text-foreground leading-tight">
        {labels[id]}
      </span>
      {id === "orders" && ordersCount != null && ordersCount > 0 && (
        <span className="text-xs text-muted-foreground">{ordersCount} total</span>
      )}
    </div>
  );
}

import { Package, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyOrder } from "@/lib/queries";

function statusConfig(status: string | null): { label: string; className: string } {
  if (!status) return { label: "", className: "" };
  const s = status.toLowerCase();
  if (s === "completed" || s === "delivered")
    return { label: status, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s === "processing" || s === "on-hold" || s === "pending")
    return { label: status, className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "cancelled" || s === "failed" || s === "refunded")
    return { label: status, className: "bg-red-50 text-red-700 border-red-200" };
  return { label: status, className: "bg-secondary text-secondary-foreground border-border" };
}

export function AccountOrderCardSkeleton() {
  return (
    <div className="bg-background rounded-2xl p-5 border border-border/50 space-y-3">
      <div className="flex justify-between items-start gap-4">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div className="space-y-1.5 items-end flex flex-col">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function AccountOrderCard({
  order,
  t,
}: {
  order: MyOrder;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const placed = new Date(order.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const itemWord =
    order.itemsCount === 1
      ? t("account.orders.itemCount")
      : t("account.orders.itemsCount");
  const totalLabel =
    order.total && order.currency ? `${order.currency} ${order.total}` : null;
  const { label: statusLabel, className: statusClass } = statusConfig(order.status);
  const hasItems = Array.isArray(order.items) && order.items.length > 0;

  return (
    <li
      className="bg-background rounded-2xl p-5 border border-border/50 hover:border-primary/15 transition-colors"
      data-testid={`order-row-${order.appOrderId}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("account.orders.orderNumber")} #{order.appOrderId}
            </span>
          </div>
          <div className="font-medium text-base">
            {order.itemsCount} {itemWord}
          </div>
          {order.recipientName ? (
            <div className="text-sm text-muted-foreground mt-0.5">
              {t("account.orders.deliveryFor")} {order.recipientName}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground mt-1">
            {t("account.orders.placedOn")} {placed}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {totalLabel && (
            <div className="font-semibold text-base">{totalLabel}</div>
          )}
          {statusLabel && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusClass}`}
            >
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* View details toggle */}
      {hasItems && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 pt-3 border-t border-border/40 w-full flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            {expanded ? "Hide details" : "View details"}
          </button>
          {expanded && (
            <ul className="mt-3 space-y-1.5">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.name}</span>
                  {item.quantity > 1 && (
                    <span className="text-muted-foreground text-xs">×{item.quantity}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

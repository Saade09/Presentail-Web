import { Package, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyOrder } from "@/lib/queries";
import { OrderDetail } from "./OrderDetail";

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
  const [detailOpen, setDetailOpen] = useState(false);
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
          {order.liveStatus && (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"
              title={t("account.orders.liveStatus")}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t("account.orders.liveStatus")}
            </span>
          )}
        </div>
      </div>

      {/* Footer row: track order + view details */}
      <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-3 flex-wrap">
        {order.wcOrderId != null && (
          <a
            href={`https://orderstatus.presentail.com?order=${order.wcOrderId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t("account.orders.trackOrder")}
          </a>
        )}
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className={`flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors${order.wcOrderId != null ? " ml-auto" : ""}`}
          data-testid={`order-view-details-${order.appOrderId}`}
        >
          {t("account.orders.viewDetails")}
        </button>
      </div>

      <OrderDetail
        order={order}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        t={t}
      />
    </li>
  );
}

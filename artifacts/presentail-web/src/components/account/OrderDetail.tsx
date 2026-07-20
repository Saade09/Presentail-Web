import { X, Package, MapPin, User, Phone, MessageSquare, CreditCard, ExternalLink, Calendar } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MyOrder } from "@/lib/queries";

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const abs = url.startsWith("http") ? url : `https://os.presentail.com${url}`;
  if (!abs.includes("os.presentail.com")) return null;
  return `/api/img/proxy?url=${encodeURIComponent(abs)}&w=160`;
}

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

function DetailSection({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  );
}

export function OrderDetail({
  order,
  open,
  onClose,
  t,
}: {
  order: MyOrder | null;
  open: boolean;
  onClose: () => void;
  t: (k: string) => string;
}) {
  if (!order) return null;

  const { label: statusLabel, className: statusClass } = statusConfig(order.status);

  const placed = new Date(order.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalLabel = order.total && order.currency ? `${order.currency} ${order.total}` : null;

  const hasItems = Array.isArray(order.items) && order.items.length > 0;
  const hasRecipient = !!(order.recipientName || order.recipientPhone || order.recipientAddress);
  const hasDelivery = !!(order.deliveryDate || order.deliverySlot);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto p-0"
        aria-label={t("account.orders.detail.ariaLabel")}
      >
        <SheetHeader className="px-6 py-5 border-b border-border/50 sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  {t("account.orders.orderNumber")} #{order.appOrderId}
                </span>
              </div>
              <SheetTitle className="font-serif text-xl leading-tight">
                {t("account.orders.detail.title")}
              </SheetTitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 mt-1 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              aria-label={t("account.orders.detail.close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-2">
            {statusLabel && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium capitalize ${statusClass}`}>
                {statusLabel}
              </span>
            )}
            {order.liveStatus && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t("account.orders.liveStatus")}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          {hasItems && (
            <DetailSection icon={Package} label={t("account.orders.detail.products")}>
              <ul className="space-y-3">
                {order.items.map((item, i) => {
                  const proxied = proxyImageUrl(item.image);
                  return (
                    <li key={i} className="flex items-center gap-3">
                      {proxied ? (
                        <img
                          src={proxied}
                          alt={item.name}
                          className="w-12 h-12 rounded-lg object-cover border border-border/50 shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg border border-border/50 bg-secondary/40 flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground leading-snug">{item.name}</div>
                        {item.quantity > 1 && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {t("account.orders.detail.qty")} {item.quantity}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </DetailSection>
          )}

          {hasDelivery && (
            <DetailSection icon={Calendar} label={t("account.orders.detail.deliveryInfo")}>
              <div className="space-y-2">
                {order.deliveryDate && (
                  <DetailRow label={t("account.orders.detail.deliveryDate")} value={order.deliveryDate} />
                )}
                {order.deliverySlot && (
                  <DetailRow label={t("account.orders.detail.deliverySlot")} value={order.deliverySlot} />
                )}
              </div>
            </DetailSection>
          )}

          {hasRecipient && (
            <DetailSection icon={User} label={t("account.orders.detail.recipient")}>
              <div className="space-y-2">
                {order.recipientName && (
                  <DetailRow label={t("account.orders.detail.recipientName")} value={order.recipientName} />
                )}
                {order.recipientPhone && (
                  <DetailRow label={t("account.orders.detail.recipientPhone")} value={
                    <a href={`tel:${order.recipientPhone}`} className="hover:underline text-primary">
                      {order.recipientPhone}
                    </a>
                  } />
                )}
                {order.recipientAddress && (
                  <DetailRow label={t("account.orders.detail.recipientAddress")} value={order.recipientAddress} />
                )}
              </div>
            </DetailSection>
          )}

          {order.cardMessage && (
            <DetailSection icon={MessageSquare} label={t("account.orders.detail.cardMessage")}>
              <p className="text-sm text-foreground italic leading-relaxed bg-secondary/30 rounded-lg px-4 py-3 border border-border/40">
                "{order.cardMessage}"
              </p>
            </DetailSection>
          )}

          <DetailSection icon={CreditCard} label={t("account.orders.detail.payment")}>
            <div className="space-y-2">
              <DetailRow
                label={t("account.orders.detail.paidAmount")}
                value={totalLabel ?? "—"}
              />
              <DetailRow label={t("account.orders.detail.placedOn")} value={placed} />
            </div>
          </DetailSection>

          {order.wcOrderId != null && (
            <a
              href={`https://orderstatus.presentail.com?order=${order.wcOrderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full justify-center text-sm font-medium text-primary hover:text-primary/80 border border-primary/30 rounded-xl px-4 py-3 hover:bg-primary/5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {t("account.orders.trackOrder")}
            </a>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

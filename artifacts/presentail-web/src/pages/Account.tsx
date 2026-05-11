import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { User, Package, MapPin, LogOut } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useMyOrders, type MyOrder } from "@/lib/queries";

type Tab = "profile" | "orders";

export default function Account() {
  const { user, token, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("profile");

  // Account routing is gated by <CustomerOnly> in App.tsx — by the time we
  // reach this component we know the user is signed in and a customer.
  // The conditional below is just a defensive render-loading fallback while
  // Clerk hydrates user.firstName/email from cache.
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/sign-in");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return <div className="min-h-screen pt-32 text-center">{t("account.loading")}</div>;

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-serif mb-12">{t("account.title")}</h1>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setTab("profile")}
              className={`w-full text-left p-4 rounded-xl border flex items-center gap-3 transition-colors ${
                tab === "profile"
                  ? "bg-secondary/50 border-primary/10"
                  : "border-transparent hover:bg-secondary/30"
              }`}
              data-testid="account-tab-profile"
            >
              <User className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("account.profile")}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("orders")}
              className={`w-full text-left p-4 rounded-xl border flex items-center gap-3 transition-colors ${
                tab === "orders"
                  ? "bg-secondary/50 border-primary/10"
                  : "border-transparent hover:bg-secondary/30"
              }`}
              data-testid="account-tab-orders"
            >
              <Package className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("account.orders")}</span>
            </button>
            <div
              className="p-4 rounded-xl flex items-center gap-3 opacity-60"
              aria-disabled="true"
              title="Coming soon"
            >
              <MapPin className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">{t("account.addresses")}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("account.soon")}
              </span>
            </div>
            <div
              className="p-4 hover:bg-destructive/10 hover:text-destructive rounded-xl cursor-pointer transition-colors flex items-center gap-3 text-muted-foreground mt-8"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">{t("account.signOut")}</span>
            </div>
          </div>

          <div className="md:col-span-2">
            {tab === "profile" ? (
              <ProfilePanel user={user} t={t} />
            ) : (
              <OrdersPanel signedIn={!!token} t={t} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePanel({
  user,
  t,
}: {
  user: { firstName?: string; lastName?: string; email: string; phone?: string };
  t: (k: string) => string;
}) {
  return (
    <div className="bg-secondary/30 rounded-3xl p-8 border border-border/50">
      <h2 className="text-2xl font-serif mb-6">{t("account.profile")}</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-1">{t("account.firstName")}</label>
            <p className="font-medium text-lg">{user.firstName || t("account.notProvided")}</p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground block mb-1">{t("account.lastName")}</label>
            <p className="font-medium text-lg">{user.lastName || t("account.notProvided")}</p>
          </div>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("account.email")}</label>
          <p className="font-medium text-lg">{user.email}</p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("account.phone")}</label>
          <p className="font-medium text-lg">{user.phone || t("account.notProvided")}</p>
        </div>
      </div>
    </div>
  );
}

function OrdersPanel({
  signedIn,
  t,
}: {
  signedIn: boolean;
  t: (k: string) => string;
}) {
  const { data, isLoading, isError } = useMyOrders(signedIn);

  return (
    <div className="bg-secondary/30 rounded-3xl p-8 border border-border/50" data-testid="orders-panel">
      <h2 className="text-2xl font-serif mb-6">{t("account.orders")}</h2>
      {isLoading ? (
        <p className="text-muted-foreground">{t("account.orders.loading")}</p>
      ) : isError ? (
        <p className="text-destructive" data-testid="orders-error">
          {t("account.orders.error")}
        </p>
      ) : !data?.orders || data.orders.length === 0 ? (
        <p className="text-muted-foreground" data-testid="orders-empty">
          {t("account.orders.empty")}
        </p>
      ) : (
        <ul className="space-y-4" data-testid="orders-list">
          {data.orders.map((o) => (
            <OrderRow key={o.appOrderId} order={o} t={t} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({ order, t }: { order: MyOrder; t: (k: string) => string }) {
  const placed = new Date(order.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const itemWord =
    order.itemsCount === 1 ? t("account.orders.itemCount") : t("account.orders.itemsCount");
  const totalLabel =
    order.total && order.currency ? `${order.currency} ${order.total}` : null;
  return (
    <li
      className="bg-background/60 rounded-2xl p-5 border border-border/50"
      data-testid={`order-row-${order.appOrderId}`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">
            {t("account.orders.orderNumber")} #{order.appOrderId}
          </div>
          <div className="font-medium mt-1">
            {order.itemsCount} {itemWord}
          </div>
          {order.recipientName ? (
            <div className="text-sm text-muted-foreground mt-1">
              {t("account.orders.deliveryFor")} {order.recipientName}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground mt-1">
            {t("account.orders.placedOn")} {placed}
          </div>
        </div>
        <div className="text-right">
          {totalLabel ? <div className="font-medium">{totalLabel}</div> : null}
          {order.status ? (
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
              {order.status}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

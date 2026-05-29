import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect, useState, useMemo } from "react";
import {
  User,
  Package,
  MapPin,
  LogOut,
  Sparkles,
  Heart,
  Bell,
  Plus,
  X,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useMyOrders } from "@/lib/queries";
import { useProducts } from "@/lib/queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import { LoyaltyPanel } from "@/components/loyalty/LoyaltyPanel";
import { ProductCard } from "@/components/ProductCard";
import { useFavorites } from "@/contexts/FavoritesContext";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountOrderCard, AccountOrderCardSkeleton } from "@/components/account/AccountOrderCard";
import { AccountShortcutCards } from "@/components/account/AccountShortcutCards";
import { AccountSidebar, MobileTabStrip } from "@/components/account/AccountSidebar";
import { EmptyState } from "@/components/account/EmptyState";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type AccountTab = "profile" | "orders" | "loyalty" | "favorites" | "addresses" | "notifications";

type MeUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: string | null;
  birthday?: string | null;
};

export default function Account() {
  const { user, token, logout, isLoading } = useAuth();
  const { isSignedIn } = useClerkAuth();
  const [, setLocation] = useLocation();
  const { t } = useLocale();
  const [tab, setTab] = useState<AccountTab>("profile");

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/sign-in");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user)
    return (
      <div className="min-h-screen pt-32 text-center text-muted-foreground">
        {t("account.loading")}
      </div>
    );

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-6xl">
        <h1 className="text-4xl font-serif mb-8 md:mb-10">{t("account.title")}</h1>

        <div className="flex gap-7 items-start">
          <AccountSidebar
            activeTab={tab}
            onSelect={(t) => setTab(t as AccountTab)}
            onLogout={handleLogout}
            t={t}
          />

          <div className="flex-1 min-w-0">
            <MobileTabStrip
              activeTab={tab}
              onSelect={(t) => setTab(t as AccountTab)}
              t={t}
            />

            {tab === "profile" && (
              <>
                <AccountShortcutCards
                  onNavigate={(id) => setTab(id as AccountTab)}
                />
                <ProfilePanel user={user} t={t} />
              </>
            )}
            {tab === "orders" && (
              <OrdersPanel signedIn={!!isSignedIn} t={t} />
            )}
            {tab === "loyalty" && <LoyaltySection t={t} />}
            {tab === "favorites" && <FavoritesSection t={t} />}
            {tab === "addresses" && <AddressesSection t={t} />}
            {tab === "notifications" && <NotificationsSection signedIn={!!isSignedIn} t={t} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
        <h2 className="text-xl font-serif">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  notAdded,
}: {
  label: string;
  value?: string | null;
  notAdded: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className={`text-base ${value ? "text-foreground" : "text-muted-foreground/60 italic"}`}>
        {value || notAdded}
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
  const [meUser, setMeUser] = useState<MeUser | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ ok: boolean; user: MeUser | null }>("/auth/me")
      .then((r) => {
        if (!cancelled && r.user) setMeUser(r.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const displayUser = meUser ?? user;
  const notAdded = t("account.notAddedYet");

  const formatBirthday = (bd: string | null | undefined) => {
    if (!bd) return null;
    try {
      return new Date(bd + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return bd;
    }
  };

  const genderLabel = (g: string | null | undefined) => {
    if (!g || g === "unspecified") return null;
    return g === "female" ? t("pi.gender.female") : t("pi.gender.male");
  };

  return (
    <SectionCard
      title={t("account.profile")}
      action={
        <button
          type="button"
          onClick={() => setLocation("/account/personal-information")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid="account-edit-personal-information"
        >
          {t("account.editPersonalInfo")}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      }
    >
      <div className="grid sm:grid-cols-2 gap-5">
        <ProfileField label={t("account.firstName")} value={(displayUser as any).firstName} notAdded={notAdded} />
        <ProfileField label={t("account.lastName")} value={(displayUser as any).lastName} notAdded={notAdded} />
        <ProfileField label={t("account.email")} value={displayUser.email} notAdded={notAdded} />
        <ProfileField label={t("account.phone")} value={(displayUser as any).phone} notAdded={notAdded} />
        <ProfileField
          label={t("account.dateOfBirth")}
          value={formatBirthday((meUser as any)?.birthday)}
          notAdded={notAdded}
        />
        <ProfileField
          label={t("account.gender")}
          value={genderLabel((meUser as any)?.gender)}
          notAdded={notAdded}
        />
      </div>
    </SectionCard>
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
  const [, setLocation] = useLocation();

  return (
    <SectionCard title={t("account.orders")}>
      {isLoading ? (
        <ul className="space-y-3" data-testid="orders-loading-skeleton">
          {[1, 2, 3].map((i) => (
            <AccountOrderCardSkeleton key={i} />
          ))}
        </ul>
      ) : isError ? (
        <p className="text-destructive text-sm" data-testid="orders-error">
          {t("account.orders.error")}
        </p>
      ) : !data?.orders || data.orders.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("account.orders.empty")}
          description={t("account.orders.emptyDesc")}
          cta={{ label: t("account.orders.shopCta"), href: "/shop" }}
        />
      ) : (
        <ul className="space-y-3" data-testid="orders-list">
          {data.orders.map((o) => (
            <AccountOrderCard key={o.appOrderId} order={o} t={t} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function LoyaltySection({ t }: { t: (k: string) => string }) {
  return (
    <div className="space-y-5">
      <LoyaltyPanel t={t} />
      <div className="bg-card rounded-2xl border border-border/60 p-6">
        <h3 className="text-base font-medium mb-2">{t("account.loyalty.howItWorks")}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("account.loyalty.howItWorksDesc")}
        </p>
      </div>
    </div>
  );
}

function FavoritesSection({ t }: { t: (k: string) => string }) {
  const { favorites, isLoaded } = useFavorites();
  const { language } = useLocale();
  const { countryCode, cityId } = useLocationSelection();
  const queryParams: { countryCode?: string; cityId?: string; lang?: string } = { lang: language };
  if (countryCode) queryParams.countryCode = countryCode;
  if (cityId) queryParams.cityId = cityId;

  const enabled = isLoaded && favorites.size > 0;
  const { data, isLoading } = useProducts(queryParams, enabled);

  const favoriteProducts = useMemo(() => {
    if (!data?.products) return [];
    return data.products.filter((p) => favorites.has(p.id)).slice(0, 6);
  }, [data, favorites]);

  return (
    <SectionCard
      title={t("account.favorites")}
      action={
        favorites.size > 6 ? (
          <Link
            href="/favorites"
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            {t("account.favorites.view")}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : null
      }
    >
      {!isLoaded || (isLoading && favorites.size > 0) ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : favoriteProducts.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t("account.favorites.empty")}
          description={t("account.favorites.emptyDesc")}
          cta={{ label: t("account.favorites.view"), href: "/favorites" }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {favoriteProducts.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
          {favorites.size > 0 && (
            <div className="mt-5 pt-4 border-t border-border/50 text-center">
              <Link
                href="/favorites"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                {t("account.favorites.view")}
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

type AddressData = {
  id: number;
  label: string;
  nickname?: string | null;
  isDefault: boolean;
  district?: string | null;
  addressLine?: string | null;
  building?: string | null;
  apartment?: string | null;
};

function AddressCard({
  address,
  onDelete,
  onSetDefault,
  t,
}: {
  address: AddressData;
  onDelete: () => void;
  onSetDefault: () => void;
  t: (k: string) => string;
}) {
  const labelChip: Record<string, string> = { home: "Home", work: "Work", other: "Other" };
  const line2 = [address.addressLine, address.building, address.apartment].filter(Boolean).join(" · ");

  return (
    <div
      className={`rounded-2xl p-5 border transition-colors ${
        address.isDefault ? "border-gold/50 bg-gold/5" : "border-border/60 bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded-full">
              {labelChip[address.label] ?? address.label}
            </span>
            {address.nickname && (
              <span className="text-sm text-muted-foreground">· {address.nickname}</span>
            )}
            {address.isDefault && (
              <span className="text-xs font-medium text-gold bg-gold/15 px-2 py-0.5 rounded-full">
                Default
              </span>
            )}
          </div>
          {address.district && (
            <div className="font-medium text-sm">{address.district}</div>
          )}
          {line2 && (
            <div className="text-sm text-muted-foreground mt-0.5">{line2}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {!address.isDefault && (
        <button
          type="button"
          onClick={onSetDefault}
          className="mt-3 text-xs font-medium text-primary hover:underline"
        >
          Set as default
        </button>
      )}
    </div>
  );
}

function AddAddressModal({
  open,
  onClose,
  onSaved,
  defaultCountryCode,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultCountryCode?: string;
  t: (k: string) => string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    recipientName: "",
    recipientPhone: "",
    recipientPhoneCountryCode: "+961",
    area: "",
    addressLine: "",
    details: "",
    countryCode: defaultCountryCode?.toUpperCase().slice(0, 2) || "LB",
    label: "home",
  });

  useEffect(() => {
    if (defaultCountryCode) {
      setForm((f) => ({
        ...f,
        countryCode: defaultCountryCode.toUpperCase().slice(0, 2),
      }));
    }
  }, [defaultCountryCode]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    const area = form.area.trim();
    const addressLine = form.addressLine.trim();
    if (!area) {
      toast({ title: "Area / District is required", variant: "destructive" });
      return;
    }
    if (!addressLine) {
      toast({ title: "Address is required", variant: "destructive" });
      return;
    }
    const countryCode = form.countryCode.trim().toUpperCase().slice(0, 2);
    if (!countryCode || countryCode.length !== 2) {
      toast({ title: "Please select a country", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/me/addresses", {
        method: "POST",
        body: JSON.stringify({
          label: form.label,
          countryCode,
          district: area,
          addressLine,
          building: null,
          apartment: null,
          directions: form.details.trim() || null,
          nickname: form.recipientName.trim() || null,
          recipientPhone: form.recipientPhone.trim() || null,
          recipientPhoneCountryCode: form.recipientPhone.trim()
            ? form.recipientPhoneCountryCode || null
            : null,
          isDefault: false,
        }),
      });
      toast({ title: "Address saved" });
      onSaved();
      onClose();
      setForm({
        recipientName: "",
        recipientPhone: "",
        recipientPhoneCountryCode: "+961",
        area: "",
        addressLine: "",
        details: "",
        countryCode: defaultCountryCode?.toUpperCase().slice(0, 2) || "LB",
        label: "home",
      });
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 404 || status === 501) {
        toast({
          title: "Address saving coming soon",
          description: "We're working on this feature. It'll be available shortly.",
        });
      } else {
        const msg =
          err?.message ??
          err?.response?.data?.message ??
          "Couldn't save address. Please check your details and try again.";
        toast({ title: "Couldn't save address", description: msg, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {t("account.addresses.add")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            {["home", "work", "other"].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => set("label", l)}
                className={`py-2 rounded-xl text-sm font-medium border transition-colors capitalize ${
                  form.label === l
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-secondary/40"
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Recipient name
            </Label>
            <Input
              value={form.recipientName}
              onChange={(e) => set("recipientName", e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Country <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.countryCode}
                onChange={(e) => set("countryCode", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="LB"
                maxLength={2}
                className="uppercase text-center"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Area / District <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="e.g. Hamra, Beirut"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Address <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.addressLine}
              onChange={(e) => set("addressLine", e.target.value)}
              placeholder="Street, building, floor..."
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Recipient phone
            </Label>
            <Input
              value={form.recipientPhone}
              onChange={(e) => set("recipientPhone", e.target.value)}
              placeholder="+961 70 000 000"
              inputMode="tel"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Extra details
            </Label>
            <Input
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Landmark, buzzer code..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-full">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy} className="rounded-full">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save address"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddressesSection({ t }: { t: (k: string) => string }) {
  const [addresses, setAddresses] = useState<AddressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();
  const { countryCode: activeCountryCode } = useLocationSelection();

  const load = () => {
    setLoading(true);
    apiFetch<{ ok: boolean; addresses: AddressData[] }>("/me/addresses")
      .then((r) => setAddresses(r.addresses ?? []))
      .catch(() => setAddresses([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/me/addresses/${id}`, { method: "DELETE" });
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch {
      toast({ title: "Couldn't delete address", variant: "destructive" });
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await apiFetch(`/me/addresses/${id}/default`, { method: "POST" });
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })));
    } catch {
      toast({ title: "Couldn't update address", variant: "destructive" });
    }
  };

  return (
    <>
      <SectionCard
        title={t("account.addresses")}
        action={
          <Button
            size="sm"
            variant="outline"
            className="rounded-full gap-1.5 h-8"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("account.addresses.add")}
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl p-5 border border-border/60">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-5 w-40 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title={t("account.addresses.empty")}
            description={t("account.addresses.emptyDesc")}
          />
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                address={addr}
                onDelete={() => handleDelete(addr.id)}
                onSetDefault={() => handleSetDefault(addr.id)}
                t={t}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <AddAddressModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={load}
        defaultCountryCode={activeCountryCode ?? "LB"}
        t={t}
      />
    </>
  );
}

function NotificationsSection({ signedIn, t }: { signedIn: boolean; t: (k: string) => string }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [, setLocation] = useLocation();
  const { data: ordersData, isLoading: ordersLoading } = useMyOrders(signedIn);

  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
    } else {
      setPermission(Notification.permission);
    }
  }, []);

  const statusLabel =
    permission === "granted"
      ? t("account.notifications.statusEnabled")
      : permission === "denied"
      ? t("account.notifications.statusDisabled")
      : permission === "unsupported"
      ? t("account.notifications.statusDefault")
      : t("account.notifications.statusDefault");

  const statusColor =
    permission === "granted"
      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
      : permission === "denied"
      ? "text-destructive bg-destructive/8 border-destructive/20"
      : "text-muted-foreground bg-secondary border-border/60";

  const hint =
    permission === "denied"
      ? t("account.notifications.blockedHint")
      : permission === "granted"
      ? null
      : t("account.notifications.enableHint");

  return (
    <div className="space-y-5">
      <SectionCard title={t("account.notifications")}>
        <div className="space-y-5">
          {/* Push permission status row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">
                {t("account.notifications.pushStatus")}
              </span>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusColor}`}
            >
              {statusLabel}
            </span>
          </div>

          {/* Hint / action */}
          {hint && (
            <div className="text-sm text-muted-foreground leading-relaxed">
              {hint}
            </div>
          )}

          {permission === "denied" && (
            <button
              type="button"
              onClick={() => {
                window.open(
                  "https://support.google.com/chrome/answer/3220216",
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {t("account.notifications.openSettings")}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </SectionCard>

      {/* Order updates section — shows real recent orders */}
      <SectionCard
        title={t("account.notifications.orderUpdates")}
        action={
          ordersData?.orders && ordersData.orders.length > 0 ? (
            <button
              type="button"
              onClick={() => setLocation("/orders")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {t("account.notifications.viewOrders")}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : null
        }
      >
        {ordersLoading ? (
          <ul className="space-y-3">
            {[1, 2].map((i) => (
              <AccountOrderCardSkeleton key={i} />
            ))}
          </ul>
        ) : ordersData?.orders && ordersData.orders.length > 0 ? (
          <ul className="space-y-3">
            {ordersData.orders.slice(0, 3).map((o) => (
              <AccountOrderCard key={o.appOrderId} order={o} t={t} />
            ))}
            {ordersData.orders.length > 3 && (
              <li className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setLocation("/orders")}
                  className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  {t("account.notifications.viewOrders")}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("account.notifications.orderUpdatesDesc")}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

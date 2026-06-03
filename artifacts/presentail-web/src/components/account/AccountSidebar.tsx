import {
  User,
  Package,
  Sparkles,
  Heart,
  MapPin,
  LogOut,
  Trash2,
  Bell,
  CalendarDays,
  Share2,
} from "lucide-react";

export type AccountTab =
  | "profile"
  | "orders"
  | "loyalty"
  | "favorites"
  | "addresses"
  | "notifications"
  | "occasions"
  | "referrals";

interface SidebarItem {
  id: AccountTab;
  icon: React.ElementType;
  labelKey: string;
  label: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "profile", icon: User, labelKey: "account.profile", label: "Profile Details" },
  { id: "orders", icon: Package, labelKey: "account.orders", label: "Order History" },
  { id: "loyalty", icon: Sparkles, labelKey: "account.loyalty", label: "Presentail Points" },
  { id: "favorites", icon: Heart, labelKey: "account.favorites", label: "Favorites" },
  { id: "addresses", icon: MapPin, labelKey: "account.addresses", label: "Saved Addresses" },
  { id: "occasions", icon: CalendarDays, labelKey: "account.occasions", label: "Occasions & Reminders" },
  { id: "referrals", icon: Share2, labelKey: "account.referrals", label: "Referrals" },
  { id: "notifications", icon: Bell, labelKey: "account.notifications", label: "Notifications" },
];

interface AccountSidebarProps {
  activeTab: AccountTab;
  onSelect: (tab: AccountTab) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  t: (key: string) => string;
  user?: { firstName?: string; lastName?: string; email: string };
  points?: number | null;
}

function buildInitials(firstName?: string, lastName?: string, email?: string): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (email) return email[0].toUpperCase();
  return "?";
}

export function AccountSidebar({ activeTab, onSelect, onLogout, onDeleteAccount, t, user, points }: AccountSidebarProps) {
  const initials = buildInitials(user?.firstName, user?.lastName, user?.email);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "";

  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-60 shrink-0 sticky top-28 self-start gap-0.5">
      {/* User greeting */}
      {user && (
        <div className="flex items-center gap-3 px-3.5 py-3.5 mb-2 rounded-2xl bg-secondary/40 border border-border/40">
          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0 select-none">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{displayName}</div>
            {points !== null && points !== undefined && (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Sparkles className="w-3 h-3 text-gold" />
                {points} {t("loyalty.points")}
              </div>
            )}
          </div>
        </div>
      )}

      {SIDEBAR_ITEMS.map(({ id, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-secondary/50 hover:text-foreground"
            }`}
            data-testid={`account-sidebar-${id}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{t(id === "loyalty" ? "account.loyalty" : `account.${id}`)}</span>
          </button>
        );
      })}

      <div className="mt-4 pt-4 border-t border-border/50 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onLogout}
          className="w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 text-sm font-medium text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-all"
          data-testid="account-sidebar-signout"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>{t("account.signOut")}</span>
        </button>
        <button
          type="button"
          onClick={onDeleteAccount}
          className="w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 text-sm font-medium text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-all"
          data-testid="account-sidebar-delete-account"
        >
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>{t("account.deleteAccount")}</span>
        </button>
      </div>
    </aside>
  );
}

interface MobileTabStripProps {
  activeTab: AccountTab;
  onSelect: (tab: AccountTab) => void;
  t: (key: string) => string;
}

export function MobileTabStrip({ activeTab, onSelect, t }: MobileTabStripProps) {
  return (
    <div className="flex md:hidden overflow-x-auto gap-2 pb-1 mb-5 -mx-4 px-4 scrollbar-none">
      {SIDEBAR_ITEMS.map(({ id, icon: Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium transition-all shrink-0 border ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground/80 border-border/60 hover:border-primary/30"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(id === "loyalty" ? "account.loyalty" : `account.${id}`)}
          </button>
        );
      })}
    </div>
  );
}

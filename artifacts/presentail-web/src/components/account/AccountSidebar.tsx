import { User, Package, Sparkles, Heart, MapPin, LogOut, Bell } from "lucide-react";

export type AccountTab = "profile" | "orders" | "loyalty" | "favorites" | "addresses" | "notifications";

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
  { id: "notifications" as AccountTab, icon: Bell, labelKey: "account.notifications", label: "Notifications" },
];

interface AccountSidebarProps {
  activeTab: AccountTab;
  onSelect: (tab: AccountTab) => void;
  onLogout: () => void;
  t: (key: string) => string;
}

export function AccountSidebar({ activeTab, onSelect, onLogout, t }: AccountSidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-56 lg:w-60 shrink-0 sticky top-28 self-start gap-0.5">
      {SIDEBAR_ITEMS.map(({ id, icon: Icon }) => {
        const isActive = activeTab === (id as any);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id as AccountTab)}
            className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-all ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground/80 hover:bg-secondary/50 hover:text-foreground"
            }`}
            data-testid={`account-sidebar-${id}`}
          >
            <Icon className="w-4.5 h-4.5 shrink-0" />
            <span>{t(`account.${id}` as string) || SIDEBAR_ITEMS.find(s => s.id === id)?.label}</span>
          </button>
        );
      })}

      <div className="mt-6 pt-4 border-t border-border/50">
        <button
          type="button"
          onClick={onLogout}
          className="w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 text-sm font-medium text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-all"
          data-testid="account-sidebar-signout"
        >
          <LogOut className="w-4.5 h-4.5 shrink-0" />
          <span>{t("account.signOut")}</span>
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
        const isActive = activeTab === (id as any);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id as AccountTab)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-full text-xs font-medium transition-all shrink-0 border ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground/80 border-border/60 hover:border-primary/30"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(`account.${id}` as string) || SIDEBAR_ITEMS.find(s => s.id === id)?.label}
          </button>
        );
      })}
    </div>
  );
}

import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  User,
  Package,
  Sparkles,
  Heart,
  MapPin,
  LogOut,
  Bell,
  CalendarDays,
  Share2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";

type DropdownTab =
  | "profile"
  | "orders"
  | "notifications"
  | "addresses"
  | "favorites"
  | "occasions"
  | "referrals"
  | "loyalty";

type MenuItem = {
  id: DropdownTab | "favorites-page";
  icon: React.ElementType;
  labelKey: string;
  badge?: React.ReactNode;
  href?: string;
};

function buildInitials(firstName?: string, lastName?: string, email?: string): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (email) return email[0].toUpperCase();
  return "?";
}

export function AccountDropdown() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 180);
  };

  const cancelClose = () => clearTimeout(closeTimerRef.current);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    apiFetch<{ ok: boolean; loyalty: { points: number } }>("/loyalty/me")
      .then((r) => { if (!cancelled) setPoints(r.loyalty.points); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const MENU_ITEMS: MenuItem[] = [
    { id: "profile", icon: User, labelKey: "account.profile" },
    { id: "orders", icon: Package, labelKey: "account.orders" },
    { id: "notifications", icon: Bell, labelKey: "account.notifications" },
    { id: "addresses", icon: MapPin, labelKey: "account.addresses" },
    { id: "favorites-page", icon: Heart, labelKey: "account.favorites", href: "/favorites" },
    { id: "occasions", icon: CalendarDays, labelKey: "account.occasions" },
    { id: "referrals", icon: Share2, labelKey: "account.referrals" },
    {
      id: "loyalty",
      icon: Sparkles,
      labelKey: "account.loyalty",
      badge:
        points !== null ? (
          <span className="text-[10px] font-bold bg-gold/20 text-gold px-1.5 py-0.5 rounded-full">
            {points}
          </span>
        ) : undefined,
    },
  ];

  const handleSelect = (item: MenuItem) => {
    setOpen(false);
    if (item.href) {
      setLocation(item.href);
    } else {
      setLocation(`/account?tab=${item.id}`);
    }
  };

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    setLocation("/");
  };

  if (!user) return null;

  const initials = buildInitials(user.firstName, user.lastName, user.email);
  const greeting = user.firstName
    ? t("account.dropdown.greeting").replace("{name}", user.firstName)
    : t("account.title");

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => { cancelClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="button-account"
        className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold hover:opacity-90 transition-opacity shrink-0 select-none"
        aria-label={t("nav.accountAria")}
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute top-full right-0 mt-2 w-72 bg-background rounded-2xl shadow-2xl border border-border/60 z-[80] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-4 border-b border-border/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0 select-none">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{greeting}</div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
            </div>

            {/* Menu items */}
            <nav className="py-1.5">
              {MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-secondary/60 transition-colors"
                    data-testid={`account-menu-${item.id}`}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-left">{t(item.labelKey)}</span>
                    {item.badge}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                  </button>
                );
              })}
            </nav>

            {/* Sign out */}
            <div className="px-3 py-2 border-t border-border/50">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-destructive/8 hover:text-destructive transition-colors"
                data-testid="account-dropdown-signout"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {t("account.signOut")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

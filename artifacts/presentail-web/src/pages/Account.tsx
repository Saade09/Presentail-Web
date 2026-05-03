import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { User, Package, MapPin, LogOut } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

export default function Account() {
  const { user, logout, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useLocale();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return <div className="min-h-screen pt-32 text-center">{t("account.loading")}</div>;

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-serif mb-12">{t("account.title")}</h1>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="space-y-2">
            <div className="p-4 bg-secondary/50 rounded-xl cursor-pointer border border-primary/10 flex items-center gap-3">
              <User className="w-5 h-5 text-primary" />
              <span className="font-medium">{t("account.profile")}</span>
            </div>
            <div
              className="p-4 rounded-xl flex items-center gap-3 opacity-60"
              aria-disabled="true"
              title="Coming soon"
            >
              <Package className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">{t("account.orders")}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("account.soon")}
              </span>
            </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}

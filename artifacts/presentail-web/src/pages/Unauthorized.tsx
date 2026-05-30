import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";

// Shown when a Clerk-authenticated user lands on a customer-only page but
// carries a non-customer `publicMetadata.userType` (driver / team / future
// roles). Public pages remain reachable; this is a friendly dead-end.
export default function Unauthorized() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-24 bg-background">
      <div className="max-w-md text-center space-y-6">
        <h1 className="text-4xl font-serif">{t("auth.unauthorized.title")}</h1>
        <p className="text-muted-foreground">
          {t("auth.unauthorized.desc")}
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/">
            <Button variant="default">{t("auth.unauthorized.backToShop")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

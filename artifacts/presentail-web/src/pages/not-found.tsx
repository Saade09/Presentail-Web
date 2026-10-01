import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/contexts/LocaleContext";

export default function NotFound() {
  const { t } = useLocale();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-24 bg-background">
      <div className="max-w-md text-center space-y-6">
        {/* contrast-ok: decorative numeral, aria-hidden; the <h1> and description below convey the error */}
        <p className="text-8xl font-serif text-foreground/20 leading-none select-none" aria-hidden="true">404</p>
        <div className="space-y-3">
          <h1 className="text-3xl font-serif">{t("notFound.title")}</h1>
          <p className="text-muted-foreground">{t("notFound.desc")}</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <Link href="/">
            <Button variant="default">{t("notFound.cta")}</Button>
          </Link>
          <Link href="/shop" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            {t("notFound.browse")} →
          </Link>
        </div>
      </div>
    </div>
  );
}

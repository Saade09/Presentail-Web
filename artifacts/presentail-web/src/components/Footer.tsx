import { Link } from "wouter";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocationSelection } from "@/contexts/LocationContext";
import { Logo } from "@/components/Logo";

export function Footer() {
  const { t, countryName } = useLocale();
  const { country } = useLocationSelection();
  const displayCountry = country ? countryName(country.code, country.name) : "";
  return (
    <footer className="bg-primary text-primary-foreground pt-20 pb-10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-1">
            <div className="mb-6">
              <Logo height={72} inverse />
            </div>
            <p className="text-primary-foreground/70 text-sm leading-relaxed mb-6">
              {t("footer.tagline")}
            </p>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6">{t("footer.shop")}</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li><Link href="/shop?category=hand-bouquets" className="hover:text-gold transition-colors">{t("shop.cat.handBouquets")}</Link></li>
              <li><Link href="/shop?category=flower-boxes" className="hover:text-gold transition-colors">{t("shop.cat.flowerBoxes")}</Link></li>
              <li><Link href="/shop?category=plants" className="hover:text-gold transition-colors">{t("shop.cat.plants")}</Link></li>
              <li><Link href="/shop?category=cakes" className="hover:text-gold transition-colors">{t("shop.cat.cakes")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6">{t("nav.occasions")}</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li><Link href="/shop?occasion=birthday" className="hover:text-gold transition-colors">{t("shop.occ.birthday")}</Link></li>
              <li><Link href="/shop?occasion=love-romance" className="hover:text-gold transition-colors">{t("shop.occ.romance")}</Link></li>
              <li><Link href="/shop?occasion=congratulations" className="hover:text-gold transition-colors">{t("shop.occ.congratulations")}</Link></li>
              <li><Link href="/shop?occasion=condolences" className="hover:text-gold transition-colors">{t("shop.occ.condolences")}</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6">{t("footer.help")}</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li>
                <a href="mailto:hello@presentail.com" className="hover:text-gold transition-colors">
                  {t("footer.contact")}
                </a>
              </li>
              <li className="text-primary-foreground/60">{t("footer.deliveryInfo")} — {t("footer.comingSoon")}</li>
              <li className="text-primary-foreground/60">{t("footer.faq")} — {t("footer.comingSoon")}</li>
              <li className="text-primary-foreground/60">{t("footer.terms")} — {t("footer.comingSoon")}</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-primary-foreground/50">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}

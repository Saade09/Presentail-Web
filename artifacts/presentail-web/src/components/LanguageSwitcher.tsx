import { useLocale } from "@/contexts/LocaleContext";
import { langsForCountry, parseLocalePath, type Lang } from "@/lib/locale-route";
import { useLocation } from "wouter";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<Lang, string> = {
  en: "EN",
  ar: "ع",
  fr: "FR",
  el: "ΕΛ",
};

type Props = {
  className?: string;
  variant?: "default" | "pill";
};

export function LanguageSwitcher({ className = "", variant = "default" }: Props) {
  const { language, setLanguage, t, dir } = useLocale();
  const [path] = useLocation();
  // Greek is offered only on the landing page (no country context) and for
  // Cyprus — the switcher derives the country from the current URL prefix.
  // Inside city storefronts the app router runs under a `/{lang}-{country}`
  // base, so wouter's path has the locale prefix stripped; read the full
  // browser pathname instead (`path` still subscribes us to navigation).
  const fullPath =
    typeof window !== "undefined" ? window.location.pathname : path;
  const { country } = parseLocalePath(fullPath);
  const availableLangs = langsForCountry(country);
  const align = dir === "rtl" ? "start" : "end";
  const isPill = variant === "pill";
  const triggerClass = isPill
    ? `flex items-center gap-1.5 rounded-full bg-white/70 hover:bg-white px-3 py-1 text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`
    : `flex items-center gap-1.5 hover:text-foreground transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={t(`lang.label.${language}`)}
        data-testid="language-switcher"
        className={triggerClass}
      >
        <span className="font-medium text-foreground">{LABELS[language]}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[8rem] z-[80] max-h-60">
        {availableLangs.map((lang) => {
          const active = language === lang;
          return (
            <DropdownMenuItem
              key={lang}
              onSelect={() => setLanguage(lang)}
              aria-label={t(`lang.label.${lang}`)}
              data-testid={`button-lang-${lang}`}
              className="flex items-center justify-between gap-2 text-xs cursor-pointer"
            >
              <span>{t(`lang.label.${lang}`)}</span>
              {active ? (
                <Check className="w-3.5 h-3.5 opacity-80" />
              ) : (
                <span className="text-muted-foreground">{LABELS[lang]}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

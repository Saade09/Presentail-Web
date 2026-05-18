import { useLocale } from "@/contexts/LocaleContext";
import { SUPPORTED_LANGS, type Lang } from "@/lib/locale-route";
import { Check, ChevronDown, Languages } from "lucide-react";
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
};

type Props = {
  className?: string;
  variant?: "default" | "pill";
};

export function LanguageSwitcher({ className = "", variant = "default" }: Props) {
  const { language, setLanguage, t, dir } = useLocale();
  const align = dir === "rtl" ? "start" : "end";
  const isPill = variant === "pill";
  const triggerClass = isPill
    ? `flex items-center gap-1.5 rounded-full bg-white/70 hover:bg-white px-3 py-1 text-foreground transition-colors outline-none ${className}`
    : `flex items-center gap-1.5 hover:text-foreground transition-colors outline-none ${className}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={t(`lang.label.${language}`)}
        data-testid="language-switcher"
        className={triggerClass}
      >
        {isPill && <Languages className="w-3.5 h-3.5 opacity-70" />}
        <span className="font-medium text-foreground">{LABELS[language]}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[8rem] z-[80] max-h-60">
        {SUPPORTED_LANGS.map((lang) => {
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

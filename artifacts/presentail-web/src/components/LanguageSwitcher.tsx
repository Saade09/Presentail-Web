import { useLocale } from "@/contexts/LocaleContext";
import { SUPPORTED_LANGS, type Lang } from "@/lib/locale-route";
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
};

type Props = {
  className?: string;
};

export function LanguageSwitcher({ className = "" }: Props) {
  const { language, setLanguage, t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={t(`lang.label.${language}`)}
        data-testid="language-switcher"
        className={`flex items-center gap-1.5 hover:text-foreground transition-colors outline-none ${className}`}
      >
        <span className="font-medium text-foreground">{LABELS[language]}</span>
        <ChevronDown className="w-3 h-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
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

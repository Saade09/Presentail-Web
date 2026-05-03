import { useLocale } from "@/contexts/LocaleContext";
import { SUPPORTED_LANGS, type Lang } from "@/lib/locale-route";

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
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label="Language"
      data-testid="language-switcher"
    >
      {SUPPORTED_LANGS.map((lang) => {
        const active = language === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            aria-pressed={active}
            aria-label={t(`lang.label.${lang}`)}
            data-testid={`button-lang-${lang}`}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}

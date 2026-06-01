import { useState } from "react";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { CountryFlag } from "@/components/CountryFlag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

/** Maps currency code → ISO flag code for CountryFlag */
const CURRENCY_FLAG: Record<string, string> = {
  USD: "US",
  AED: "AE",
  EUR: "EU",
  GBP: "GB",
  CAD: "CA",
  AUD: "AU",
  QAR: "QA",
  SAR: "SA",
  KWD: "KW",
  OMR: "OM",
  CHF: "CH",
};

type Props = {
  triggerClassName?: string;
};

export function CurrencySwitcher({ triggerClassName }: Props) {
  const { t } = useLocale();
  const {
    currencyCode,
    setCurrencyCode,
    setManualPersistent,
    clearManualCurrency,
    isManual,
    isManualPersistent,
    supportedCurrencies,
  } = useDisplayCurrency();

  // Default to "remember" on — matches the mobile experience. Once a manual
  // currency is set, mirror its actual persistence state.
  const [remember, setRemember] = useState<boolean>(
    () => (isManual ? isManualPersistent : true),
  );

  function handleSelect(code: string) {
    setCurrencyCode(code, { persist: remember });
  }

  function handleRememberToggle(checked: boolean) {
    setRemember(checked);
    // If a manual currency is already set, update its persistence live.
    if (isManual) {
      setManualPersistent(checked);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="currency-switcher"
          className={
            triggerClassName ??
            "inline-flex items-center gap-2 bg-white text-primary px-3 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors outline-none"
          }
        >
          {CURRENCY_FLAG[currencyCode] && (
            <CountryFlag
              code={CURRENCY_FLAG[currencyCode]}
              className="w-5 aspect-[3/2] shrink-0"
            />
          )}
          <span>{currencyCode}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="min-w-[11rem] max-h-80 overflow-y-auto z-[80]"
      >
        {supportedCurrencies.map(({ code, name }) => {
          const active = code === currencyCode;
          const flagCode = CURRENCY_FLAG[code];
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => handleSelect(code)}
              data-testid={`button-currency-${code.toLowerCase()}`}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              {flagCode && (
                <CountryFlag code={flagCode} className="w-5 aspect-[3/2] shrink-0" />
              )}
              <span className="w-10 shrink-0 text-sm font-medium">{code}</span>
              <span className="flex-1 text-xs text-muted-foreground truncate">{name}</span>
              {active && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
            </DropdownMenuItem>
          );
        })}

        <Separator className="my-1" />

        {/* "Use automatic" reset — only shown when a persistent manual currency is saved */}
        {isManualPersistent && (
          <DropdownMenuItem
            onSelect={() => {
              clearManualCurrency();
              setRemember(true);
            }}
            data-testid="button-currency-auto"
            className="flex items-center gap-2.5 cursor-pointer text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span className="text-xs">{t("currency.useAutomatic")}</span>
          </DropdownMenuItem>
        )}

        {/* "Remember this choice" toggle — keep the dropdown open on click */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="flex items-center gap-2.5 cursor-default focus:bg-transparent"
        >
          <Switch
            id="currency-remember"
            checked={remember}
            onCheckedChange={handleRememberToggle}
            className="shrink-0 scale-90"
          />
          <label
            htmlFor="currency-remember"
            className="text-xs text-muted-foreground cursor-pointer select-none"
          >
            {t("currency.rememberChoice")}
          </label>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

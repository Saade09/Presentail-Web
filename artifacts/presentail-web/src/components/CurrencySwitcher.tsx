import { Check, ChevronDown } from "lucide-react";
import { useDisplayCurrency } from "@/lib/useDisplayCurrency";
import { CountryFlag } from "@/components/CountryFlag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Maps currency code → ISO flag code for CountryFlag */
const CURRENCY_FLAG: Record<string, string> = {
  USD: "US",
  AED: "AE",
  EUR: "EU",
  GBP: "GB",
};

type Props = {
  className?: string;
  triggerClassName?: string;
};

export function CurrencySwitcher({ triggerClassName }: Props) {
  const { currencyCode, setCurrencyCode, supportedCurrencies } = useDisplayCurrency();

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
              className="w-5 h-auto rounded-[2px]"
            />
          )}
          <span>{currencyCode}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[10rem] z-[80]">
        {supportedCurrencies.map(({ code, name }) => {
          const active = code === currencyCode;
          const flagCode = CURRENCY_FLAG[code];
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => setCurrencyCode(code)}
              data-testid={`button-currency-${code.toLowerCase()}`}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              {flagCode && (
                <CountryFlag code={flagCode} className="w-5 h-auto rounded-[2px] shrink-0" />
              )}
              <span className="flex-1 text-sm">{code}</span>
              <span className="text-xs text-muted-foreground truncate max-w-[80px]">{name}</span>
              {active && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

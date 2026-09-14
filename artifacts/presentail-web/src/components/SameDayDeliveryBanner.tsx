import { Truck } from "lucide-react";
import { CountryFlag } from "@/components/CountryFlag";
import { useLocale } from "@/contexts/LocaleContext";

type SupportedCountryCode = "AE" | "LB";

type Props = {
  countryCode: SupportedCountryCode;
};

export function SameDayDeliveryBanner({ countryCode }: Props) {
  const { t } = useLocale();

  return (
    <div
      className="flex w-full max-w-[600px] items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium leading-snug text-emerald-950"
      data-testid="same-day-delivery-banner"
      data-country-code={countryCode}
      role="status"
    >
      <span data-testid="same-day-delivery-flag">
        <CountryFlag code={countryCode} className="w-5 aspect-[3/2] shrink-0" />
      </span>
      <Truck
        className="h-4 w-4 shrink-0 text-emerald-700"
        aria-hidden="true"
        data-testid="same-day-delivery-icon"
      />
      <span data-testid="same-day-delivery-copy">{t("shop.sameDayDelivery")}</span>
    </div>
  );
}
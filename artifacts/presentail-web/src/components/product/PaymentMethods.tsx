import { isPayMethodSupported } from "@workspace/pay-methods";
import { useLocale } from "@/contexts/LocaleContext";
import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import tabbyLogo from "@/assets/payment-logos/tabby.svg";

type Logo = { name: string; src: string; maxH?: string; fill?: boolean; noBorder?: boolean };

type PaymentMethodsProps = {
  label?: string | null;
  labelClassName?: string;
  className?: string;
  countryCode?: string | null;
  /**
   * Active display currency. Defaults to "USD" (the store's base currency).
   * Controls which payment method logos are shown using the same
   * `@workspace/pay-methods` rules as the checkout and mobile app.
   */
  currencyCode?: string | null;
  /**
   * Renders badges at a reduced size with no wrapping — used in the footer
   * where horizontal space is limited. Does not affect the label or outer
   * container layout.
   */
  compact?: boolean;
};

export function PaymentMethods({
  label,
  labelClassName,
  className,
  countryCode,
  currencyCode,
  compact = false,
}: PaymentMethodsProps = {}) {
  const { t } = useLocale();
  const resolvedLabel = label !== undefined ? label : t("product.waysToPayLabel");
  const currency = currencyCode ?? "USD";
  const ctx = { country: countryCode?.toUpperCase() ?? undefined };

  // Card networks (Amex/Visa/MC) are shown when Stripe card OR Mamo is
  // available — both process major card networks, just for different currencies.
  const showCards =
    isPayMethodSupported("card", currency, ctx) ||
    isPayMethodSupported("mamo", currency, ctx);
  const showWallet =
    isPayMethodSupported("apple_pay", currency, ctx) ||
    isPayMethodSupported("google_pay", currency, ctx);
  const showWhish = isPayMethodSupported("whish", currency, ctx);
  const showPayPal = isPayMethodSupported("paypal", currency, ctx);
  const showTabby = isPayMethodSupported("tabby", currency, ctx);

  // Ordered: Amex → GPay → Apple Pay → Visa → MC → Whish → PayPal → Tabby
  const logos: Logo[] = [
    ...(showCards
      ? [
          { name: "American Express", src: amexLogo, fill: true, noBorder: true },
        ]
      : []),
    ...(showWallet
      ? [
          { name: "Google Pay", src: googlePayLogo, maxH: "max-h-[14px]" },
          { name: "Apple Pay", src: applePayLogo, maxH: "max-h-[14px]" },
        ]
      : []),
    ...(showCards
      ? [
          { name: "Visa", src: visaLogo, fill: true },
          { name: "Mastercard", src: mastercardLogo, fill: true },
        ]
      : []),
    ...(showWhish ? [{ name: "Whish Money", src: whishLogo, fill: true }] : []),
    ...(showPayPal ? [{ name: "PayPal", src: paypalLogo, fill: true }] : []),
    ...(showTabby ? [{ name: "Tabby", src: tabbyLogo, fill: true }] : []),
  ];

  return (
    <div
      className={className ?? "flex flex-row items-center gap-3"}
      data-testid="payment-methods"
    >
      {resolvedLabel ? (
        <p
          className={
            labelClassName ??
            "text-[11px] tracking-wide text-muted-foreground shrink-0"
          }
        >
          {resolvedLabel}
        </p>
      ) : null}

      <div className={compact ? "flex flex-nowrap items-center justify-center gap-1 min-w-0" : "flex flex-1 flex-wrap items-center justify-center gap-2 sm:gap-[5px] min-w-0"}>
        {logos.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            className={
              logo.fill
                ? `inline-flex shrink-0 overflow-hidden rounded-[4px] ${logo.noBorder ? "" : "border border-gray-200 "}shadow-sm ${compact ? "w-[34px] h-[22px]" : "w-[42px] h-7"}`
                : `inline-flex shrink-0 items-center justify-center bg-white rounded-[4px] border border-gray-200 shadow-sm overflow-hidden p-[3px] ${compact ? "w-[34px] h-[22px]" : "w-[42px] h-7"}`
            }
          >
            <img
              src={logo.src}
              alt={logo.name}
              className={
                logo.fill
                  ? "block w-full h-full object-fill"
                  : `block ${compact ? "max-w-[22px]" : "max-w-[26px]"} object-contain ${logo.maxH ?? ""}`
              }
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

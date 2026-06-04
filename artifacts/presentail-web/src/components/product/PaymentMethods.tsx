import { isPayMethodSupported } from "@workspace/pay-methods";
import { useLocale } from "@/contexts/LocaleContext";
import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";

type Logo = { name: string; src: string; maxH?: string; fill?: boolean };

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
};

export function PaymentMethods({
  label,
  labelClassName,
  className,
  countryCode,
  currencyCode,
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
  const showWallet = isPayMethodSupported("wallet", currency, ctx);
  const showWhish = isPayMethodSupported("whish", currency, ctx);
  const showPayPal = isPayMethodSupported("paypal", currency, ctx);

  // Ordered: Amex → GPay → Apple Pay → Visa → MC → Whish → PayPal
  const logos: Logo[] = [
    ...(showCards
      ? [
          { name: "American Express", src: amexLogo, fill: true },
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
          { name: "Visa", src: visaLogo, maxH: "max-h-[14px]" },
          { name: "Mastercard", src: mastercardLogo, maxH: "max-h-[18px]" },
        ]
      : []),
    ...(showWhish ? [{ name: "Whish Money", src: whishLogo, fill: true }] : []),
    ...(showPayPal ? [{ name: "PayPal", src: paypalLogo, fill: true }] : []),
  ];

  return (
    <div
      className={className ?? "flex flex-col sm:flex-row sm:items-center gap-3"}
      data-testid="payment-methods"
    >
      {resolvedLabel ? (
        <p
          className={
            labelClassName ??
            "text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:shrink-0"
          }
        >
          {resolvedLabel}
        </p>
      ) : null}

      <div className="flex flex-nowrap items-center gap-[8px] overflow-x-auto">
        {logos.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            className={
              logo.fill
                ? "inline-flex overflow-hidden rounded-[4px] shadow-sm"
                : "inline-flex items-center justify-center bg-white rounded-[4px] shadow-sm overflow-hidden p-[4px]"
            }
            style={{ width: 48, height: 34 }}
          >
            <img
              src={logo.src}
              alt={logo.name}
              className={
                logo.fill
                  ? "block w-full h-full object-fill"
                  : `block max-w-[30px] object-contain ${logo.maxH ?? ""}`
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

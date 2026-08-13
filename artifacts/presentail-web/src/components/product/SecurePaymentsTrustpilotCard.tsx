import { Lock } from "lucide-react";
import { isPayMethodSupported } from "@workspace/pay-methods";
import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import tabbyLogo from "@/assets/payment-logos/tabby.svg";

type Logo = { name: string; src: string; padded?: boolean; maxW?: string; noBorder?: boolean };

type Props = {
  countryCode?: string | null;
  currencyCode?: string | null;
};

export function SecurePaymentsTrustpilotCard({ countryCode, currencyCode }: Props) {
  const currency = currencyCode ?? "USD";
  const ctx = { country: countryCode?.toUpperCase() ?? undefined };

  const showCards =
    isPayMethodSupported("card", currency, ctx) ||
    isPayMethodSupported("mamo", currency, ctx);
  const showWallet =
    isPayMethodSupported("apple_pay", currency, ctx) ||
    isPayMethodSupported("google_pay", currency, ctx);
  const showWhish = isPayMethodSupported("whish", currency, ctx);
  const showPayPal = isPayMethodSupported("paypal", currency, ctx);
  const showTabby = isPayMethodSupported("tabby", currency, ctx);

  const logos: Logo[] = [
    ...(showCards ? [{ name: "American Express", src: amexLogo, noBorder: true }] : []),
    ...(showWallet
      ? [
          { name: "Google Pay", src: googlePayLogo, padded: true, maxW: "max-w-[22px] sm:max-w-[14px]" },
          { name: "Apple Pay", src: applePayLogo, padded: true, maxW: "max-w-[22px] sm:max-w-[14px]" },
        ]
      : []),
    ...(showCards
      ? [
          { name: "Visa", src: visaLogo },
          { name: "Mastercard", src: mastercardLogo },
        ]
      : []),
    ...(showWhish ? [{ name: "Whish Money", src: whishLogo }] : []),
    ...(showPayPal ? [{ name: "PayPal", src: paypalLogo }] : []),
    ...(showTabby ? [{ name: "Tabby", src: tabbyLogo }] : []),
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Row 1: Secure payments label + payment logos */}
      <div className="flex items-center gap-2 px-3 py-2.5 min-w-0">
        {/* Left: lock + label — shrinks if needed but won't wrap */}
        <div className="flex items-center gap-1 shrink-0">
          <Lock className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">{/* // i18n-ignore */}Ways to pay</span>
        </div>

        {/* Right: logos — fixed small size, no wrap, right-aligned */}
        <div className="flex-1 flex flex-nowrap items-center justify-end gap-[3px] min-w-0">
          {logos.map((logo) => (
            <span
              key={logo.name}
              title={logo.name}
              className={
                logo.padded
                  ? "inline-flex shrink-0 items-center justify-center bg-white rounded-[3px] border border-gray-200 shadow-sm overflow-hidden p-[2px] w-[32px] h-[22px] sm:w-[22px] sm:h-[14px]"
                  : `inline-flex shrink-0 overflow-hidden rounded-[3px] ${logo.noBorder ? "" : "border border-gray-200 "}shadow-sm w-[32px] h-[22px] sm:w-[22px] sm:h-[14px]`
              }
            >
              <img
                src={logo.src}
                alt={logo.name}
                className={
                  logo.padded
                    ? `block object-contain ${logo.maxW ?? "max-w-full"}`
                    : "block w-full h-full object-fill"
                }
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </span>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-100 mx-3" />

      {/* Row 2: Trustpilot inline treatment */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-2.5">
        <span className="text-[12px] font-semibold text-foreground">{/* // i18n-ignore */}Excellent</span>
        <span className="text-[11px] text-muted-foreground">{/* // i18n-ignore */}4.6 out of 5</span>
        <span className="text-[13px] leading-none" style={{ color: "#00b67a" }} aria-hidden="true">{/* // i18n-ignore */}★</span>
        <a
          href="https://www.trustpilot.com/review/presentail.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-foreground hover:underline"
        >{/* // i18n-ignore */}Trustpilot</a>
        <span className="sr-only">{/* // i18n-ignore */}Rated Excellent 4.6 out of 5 on Trustpilot</span>
      </div>
    </div>
  );
}

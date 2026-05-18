import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";

type Logo = { name: string; src: string; maxH: string };

const BASE_LOGOS: Logo[] = [
  { name: "American Express", src: amexLogo, maxH: "max-h-[18px]" },
  { name: "Google Pay", src: googlePayLogo, maxH: "max-h-[14px]" },
  { name: "Apple Pay", src: applePayLogo, maxH: "max-h-[14px]" },
  { name: "Visa", src: visaLogo, maxH: "max-h-[14px]" },
  { name: "Mastercard", src: mastercardLogo, maxH: "max-h-[18px]" },
];

const WHISH_LOGO: Logo = { name: "Whish Money", src: whishLogo, maxH: "max-h-[14px]" };

type PaymentMethodsProps = {
  label?: string | null;
  labelClassName?: string;
  className?: string;
  countryCode?: string | null;
};

export function PaymentMethods({
  label = "Ways to Pay",
  labelClassName,
  className,
  countryCode,
}: PaymentMethodsProps = {}) {
  const logos: Logo[] =
    countryCode?.toUpperCase() === "LB"
      ? [...BASE_LOGOS, WHISH_LOGO]
      : BASE_LOGOS;

  return (
    <div
      className={className ?? "flex flex-col sm:flex-row sm:items-center gap-3"}
      data-testid="payment-methods"
    >
      {label ? (
        <p
          className={
            labelClassName ??
            "text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:shrink-0"
          }
        >
          {label}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-[14px]">
        {logos.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            className="inline-flex items-center justify-center bg-white rounded-[4px] shadow-sm"
            style={{ width: 40, height: 28 }}
          >
            <img
              src={logo.src}
              alt={logo.name}
              className={`block max-w-[30px] object-contain ${logo.maxH}`}
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

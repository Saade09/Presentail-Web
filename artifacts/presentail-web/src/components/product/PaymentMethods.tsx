import applePayLogo from "@/assets/payment-logos/applepay.svg";
import googlePayLogo from "@/assets/payment-logos/googlepay.svg";
import visaLogo from "@/assets/payment-logos/visa.svg";
import mastercardLogo from "@/assets/payment-logos/mastercard.svg";
import amexLogo from "@/assets/payment-logos/amex.svg";
import paypalLogo from "@/assets/payment-logos/paypal.svg";
import whishLogo from "@/assets/payment-logos/whish.svg";

type Logo = { name: string; src: string; maxH: string };

// Each source SVG has its own viewBox/aspect ratio. We use an equal-
// width grid for the cells so columns line up perfectly, and a per-logo
// max-height to make the *visible* glyphs read as the same vertical
// weight (square AMEX needs more headroom; tightly-packed Mastercard
// circles need a tighter cap so they don't dominate).
const BASE_LOGOS: Logo[] = [
  { name: "Mastercard", src: mastercardLogo, maxH: "max-h-5" },
  { name: "Visa", src: visaLogo, maxH: "max-h-5" },
  { name: "Google Pay", src: googlePayLogo, maxH: "max-h-5" },
  { name: "Apple Pay", src: applePayLogo, maxH: "max-h-5" },
  { name: "American Express", src: amexLogo, maxH: "max-h-8" },
  { name: "PayPal", src: paypalLogo, maxH: "max-h-5" },
];

const WHISH_LOGO: Logo = { name: "whish", src: whishLogo, maxH: "max-h-5" };

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
      className={
        className ?? "flex flex-col sm:flex-row sm:items-center gap-3"
      }
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
      <div
        className="grid min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-sm sm:gap-3 sm:px-4"
        style={{ gridTemplateColumns: `repeat(${logos.length}, minmax(0, 1fr))` }}
      >
        {logos.map((logo) => (
          <span
            key={logo.name}
            title={logo.name}
            className="flex h-8 w-full items-center justify-center"
          >
            <img
              src={logo.src}
              alt={logo.name}
              className={`block max-w-full object-contain ${logo.maxH}`}
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

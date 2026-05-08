import type { ReactElement, SVGProps } from "react";

type Logo = {
  name: string;
  width: number;
  Mark: (props: SVGProps<SVGSVGElement>) => ReactElement;
};

const BASE_LOGOS: Logo[] = [
  { name: "Apple Pay", width: 44, Mark: ApplePayMark },
  { name: "Google Pay", width: 56, Mark: GooglePayMark },
  { name: "Visa", width: 38, Mark: VisaMark },
  { name: "Mastercard", width: 32, Mark: MastercardMark },
  { name: "American Express", width: 38, Mark: AmexMark },
  { name: "PayPal", width: 50, Mark: PayPalMark },
];

const WHISH_LOGO: Logo = { name: "whish", width: 48, Mark: WhishMark };

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        {logos.map(({ name, width, Mark }) => (
          <span
            key={name}
            title={name}
            className="inline-flex items-center justify-center"
            style={{ width, height: 22 }}
          >
            <Mark role="img" aria-label={name} focusable="false" />
          </span>
        ))}
      </div>
    </div>
  );
}

function VisaMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 38 22"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="38" height="22" rx="3" fill="#1A1F71" />
      <text
        x="19"
        y="15.5"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="11"
        letterSpacing="0.4"
        fill="#FFFFFF"
      >
        VISA
      </text>
    </svg>
  );
}

function MastercardMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 22"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="13" cy="11" r="7" fill="#EB001B" />
      <circle cx="19" cy="11" r="7" fill="#F79E1B" />
      <path
        d="M16 5.7a7 7 0 0 0 0 10.6 7 7 0 0 0 0-10.6z"
        fill="#FF5F00"
      />
    </svg>
  );
}

function WhishMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 48 20"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="48" height="20" rx="4" fill="#E6007E" />
      <text
        x="24"
        y="14.2"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="11"
        letterSpacing="-0.3"
        fill="#FFFFFF"
      >
        whish
      </text>
    </svg>
  );
}

function AmexMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 38 22"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="38" height="22" rx="3" fill="#2E77BC" />
      <text
        x="19"
        y="10"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="6"
        letterSpacing="0.4"
        fill="#FFFFFF"
      >
        AMERICAN
      </text>
      <text
        x="19"
        y="17"
        textAnchor="middle"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontSize="6.4"
        letterSpacing="0.4"
        fill="#FFFFFF"
      >
        EXPRESS
      </text>
    </svg>
  );
}

function ApplePayMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 44 18"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g fill="#000000">
        <path d="M7.6 4.4c-.5.6-1.3 1.1-2.1 1-.1-.8.3-1.7.8-2.2.5-.6 1.4-1 2.1-1 .1.8-.2 1.6-.8 2.2zm.8.9c-1.2-.1-2.2.7-2.7.7-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.2 2.1-.3 5.3.9 7 .6.8 1.3 1.7 2.2 1.7.9 0 1.2-.6 2.2-.6s1.3.6 2.2.6c.9 0 1.5-.8 2.1-1.6.7-.9.9-1.8.9-1.8s-1.8-.7-1.8-2.7c0-1.7 1.4-2.5 1.4-2.5-.8-1.1-2-1.2-2.4-1.2z" />
        <text
          x="13"
          y="13.2"
          fontFamily="'Helvetica Neue', Arial, sans-serif"
          fontWeight="600"
          fontSize="9"
          letterSpacing="-0.2"
          fill="#000000"
        >
          Pay
        </text>
      </g>
    </svg>
  );
}

function GooglePayMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 56 18"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g fontFamily="'Helvetica Neue', Arial, sans-serif" fontWeight="600" fontSize="10">
        <text x="0" y="13">
          <tspan fill="#4285F4">G</tspan>
          <tspan fill="#EA4335">o</tspan>
          <tspan fill="#FBBC04">o</tspan>
          <tspan fill="#4285F4">g</tspan>
          <tspan fill="#34A853">l</tspan>
          <tspan fill="#EA4335">e</tspan>
        </text>
        <text x="35" y="13" fill="#5F6368" fontWeight="500">
          Pay
        </text>
      </g>
    </svg>
  );
}

function PayPalMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 50 16"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <text
        x="0"
        y="12.5"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontWeight="800"
        fontStyle="italic"
        fontSize="13"
        letterSpacing="-0.4"
      >
        <tspan fill="#003087">Pay</tspan>
        <tspan fill="#009CDE">Pal</tspan>
      </text>
    </svg>
  );
}

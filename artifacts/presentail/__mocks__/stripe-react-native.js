/**
 * Web shim for @stripe/stripe-react-native.
 *
 * @stripe/stripe-react-native ships native codegen specs that crash the Metro
 * web bundler. This file is substituted by metro.config.js whenever the
 * target platform is "web" so CI web builds and the Expo web preview continue
 * to work. The shim is never used on iOS/Android where the real native SDK is
 * linked instead.
 */
const React = require("react");

function StripeProvider({ children }) {
  return children ?? null;
}

function CardField() {
  return null;
}

function useStripe() {
  return {
    confirmPayment: async () => ({
      error: { message: "Stripe is not available on web" }, // i18n-ignore
    }),
    handleNextAction: async () => ({
      error: { message: "Stripe is not available on web" }, // i18n-ignore
    }),
    createPaymentMethod: async () => ({
      error: { message: "Stripe is not available on web" }, // i18n-ignore
    }),
    // Native wallet (Apple Pay / Google Pay) — always unavailable on web.
    isPlatformPaySupported: async () => false,
    confirmPlatformPayPayment: async () => ({
      error: { code: "Failed", message: "Stripe native wallet is not available on web" }, // i18n-ignore
    }),
  };
}

/**
 * PlatformPay namespace shim — mirrors the enum values used in checkout.tsx
 * so that `PlatformPay.PaymentType.Immediate` resolves without crashing on web.
 */
const PlatformPay = {
  PaymentType: {
    Immediate: "Immediate",
    Deferred: "Deferred",
    Recurring: "Recurring",
  },
};

module.exports = {
  StripeProvider,
  CardField,
  useStripe,
  PlatformPay,
};

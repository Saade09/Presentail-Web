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
  };
}

module.exports = {
  StripeProvider,
  CardField,
  useStripe,
};

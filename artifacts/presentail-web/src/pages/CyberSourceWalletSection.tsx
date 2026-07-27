// CyberSource Unified Checkout — Apple Pay & Google Pay wallet buttons.
//
// Renders above the CyberSource Microform card form inside the checkout
// payment section, but ONLY when senderCountryCode === "LB" && currency === "USD".
//
// Flow:
//   1. Parent supplies `getOrderId` (lazy, called once on first render).
//   2. This component fetches the wallet capture context from the new backend
//      route (POST /api/payment/cybersource/wallet-capture-context).
//   3. The response carries per-wallet enable flags (applePayEnabled,
//      googlePayEnabled) and the merchantId needed for Google Pay.
//   4. Apple Pay availability is confirmed client-side via ApplePaySession.
//   5. Google Pay availability is confirmed via the Google Pay JS API.
//   6. Wallet buttons are rendered for whichever wallet passes all gates.
//   7. On payment:
//        Apple Pay  → ApplePaySession → CyberSource merchant session → transient token
//        Google Pay → PaymentsClient.loadPaymentData → transient token
//   8. Transient token sent to POST /api/payment/cybersource/wallet-charge.
//   9. paymentRef passed to onPaymentSuccess so the parent can finalize the order.
//
// Error isolation: any uncaught error is caught by the WalletErrorBoundary
// wrapper (defined and exported below) so only this section disappears — the
// card form stays operational.
//
// Environment variables consumed (via the wallet-capture-context API response):
//   CYBERSOURCE_WALLETS_ENABLED       — master on/off (default off)
//   CYBERSOURCE_APPLE_PAY_ENABLED     — per-wallet flag (default on when wallets enabled)
//   CYBERSOURCE_GOOGLE_PAY_ENABLED    — per-wallet flag (default on when wallets enabled)

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { useCybersourceWalletCaptureContext, useCybersourceWalletCharge } from "@/lib/queries";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CyberSourceWalletSectionProps = {
  isLebanonUsd: boolean;
  items: { wcId: number; osSlug?: string; quantity: number }[];
  getOrderId: () => Promise<string>;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  cityId?: string;
  deliveryDate?: string;
  senderFirstName?: string;
  senderLastName?: string;
  senderEmail?: string;
  disabled?: boolean;
  onPaymentSuccess: (paymentRef: string) => void;
  onPaymentError: (message: string) => void;
  onSetProcessing?: (processing: boolean) => void;
};

// ── Script loaders ────────────────────────────────────────────────────────────

const _scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = _scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    if (document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`)); // i18n-ignore
    document.head.appendChild(s);
  });
  _scriptCache.set(src, p);
  return p;
}

const GPAY_SCRIPT = "https://pay.google.com/gp/p/js/pay.js";

// ── Google Pay helpers ────────────────────────────────────────────────────────

const GPAY_API_VERSION = 2;
const GPAY_API_VERSION_MINOR = 0;
const GPAY_ALLOWED_AUTH_METHODS = ["PAN_ONLY", "CRYPTOGRAM_3DS"];
const GPAY_ALLOWED_CARD_NETWORKS = ["VISA", "MASTERCARD", "AMEX"]; // i18n-ignore

function buildGpayBaseRequest() {
  return { apiVersion: GPAY_API_VERSION, apiVersionMinor: GPAY_API_VERSION_MINOR };
}

function buildGpayTokenizationSpec(merchantId: string) {
  return {
    type: "PAYMENT_GATEWAY", // i18n-ignore
    parameters: {
      gateway: "cybersource", // i18n-ignore
      gatewayMerchantId: merchantId,
    },
  };
}

function buildGpayCardPaymentMethod(merchantId: string) {
  return {
    type: "CARD", // i18n-ignore
    parameters: {
      allowedAuthMethods: GPAY_ALLOWED_AUTH_METHODS,
      allowedCardNetworks: GPAY_ALLOWED_CARD_NETWORKS,
    },
    tokenizationSpecification: buildGpayTokenizationSpec(merchantId),
  };
}

function buildGpayIsReadyToPayRequest(merchantId: string) {
  return {
    ...buildGpayBaseRequest(),
    allowedPaymentMethods: [buildGpayCardPaymentMethod(merchantId)],
  };
}

function buildGpayPaymentDataRequest(opts: {
  gatewayMerchantId: string;
  googlePayMerchantId: string;
  totalAmount: string;
  currency: string;
  countryCode: string;
}) {
  return {
    ...buildGpayBaseRequest(),
    merchantInfo: {
      // Google Pay merchant ID registered in the Google Pay Business Console
      // (sourced from the backend's CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID env var).
      merchantId: opts.googlePayMerchantId, // i18n-ignore
      merchantName: "Presentail", // i18n-ignore
    },
    allowedPaymentMethods: [buildGpayCardPaymentMethod(opts.gatewayMerchantId)],
    transactionInfo: {
      totalPriceStatus: "FINAL", // i18n-ignore
      totalPrice: opts.totalAmount,
      currencyCode: opts.currency,
      countryCode: opts.countryCode,
    },
  };
}

// ── Apple Pay helpers ─────────────────────────────────────────────────────────

function isApplePayAvailable(): boolean {
  return typeof (window as any).ApplePaySession !== "undefined" &&
    (window as any).ApplePaySession.canMakePayments() === true;
}

// ── CyberSource Flex wallet init ──────────────────────────────────────────────
// Load the same Flex SDK as CyberSourceSection but initialise it in wallet mode.
// The Flex SDK exposes startApplePaySession() when the capture context was
// generated with APPLEPAY in allowedPaymentTypes.

function getFlexScriptUrl(environment: "test" | "live"): string {
  return environment === "live"
    ? "https://flex.cybersource.com/microform/bundle/v2/flex-microform.min.js"
    : "https://testflex.cybersource.com/microform/bundle/v2/flex-microform.min.js";
}

// ── Main component ────────────────────────────────────────────────────────────

function CyberSourceWalletSectionInner({
  isLebanonUsd,
  items,
  getOrderId,
  district,
  expressDelivery,
  noAddress,
  deliverySlot,
  deliverySlotId,
  cityId,
  deliveryDate,
  senderFirstName,
  senderLastName,
  senderEmail,
  disabled = false,
  onPaymentSuccess,
  onPaymentError,
  onSetProcessing,
}: CyberSourceWalletSectionProps) {
  const { t } = useLocale();
  const walletCapture = useCybersourceWalletCaptureContext();
  const walletCharge = useCybersourceWalletCharge();

  const [state, setState] = useState<
    "idle" | "loading" | "ready" | "error" | "paying"
  >("idle");

  const [applePayReady, setApplePayReady] = useState(false);
  const [googlePayReady, setGooglePayReady] = useState(false);

  const captureContextRef = useRef<string | null>(null);
  const environmentRef = useRef<"test" | "live">("test");
  // CyberSource gateway merchant ID (used as gatewayMerchantId in Google Pay tokenization spec).
  const merchantIdRef = useRef<string>("");
  // Google Pay merchant ID registered in the Google Pay Business Console —
  // distinct from the CyberSource merchantId; sourced from backend env var
  // CYBERSOURCE_GOOGLE_PAY_MERCHANT_ID.
  const googlePayMerchantIdRef = useRef<string>("");
  const orderIdRef = useRef<string | null>(null);
  const gpayClientRef = useRef<any>(null);
  const flexRef = useRef<any>(null);

  // Initialise wallets when isLebanonUsd becomes true.
  useEffect(() => {
    if (!isLebanonUsd) return;

    let cancelled = false;
    setState("loading");

    (async () => {
      try {
        // 1. Resolve orderId
        const oid = await getOrderId();
        if (cancelled) return;
        orderIdRef.current = oid;

        // 2. Fetch wallet capture context
        const ctx = await walletCapture.mutateAsync({
          items,
          orderId: oid,
          district,
          expressDelivery,
          noAddress,
          deliverySlot,
          deliverySlotId,
          cityId,
          deliveryDate,
          targetOrigin: window.location.origin,
        });

        if (cancelled) return;

        if (!ctx.ok || !ctx.captureContext) {
          // Server disabled wallets — render nothing silently.
          setState("error");
          return;
        }

        captureContextRef.current = ctx.captureContext;
        environmentRef.current = ctx.environment ?? "test";
        merchantIdRef.current = ctx.merchantId ?? "";
        googlePayMerchantIdRef.current = (ctx as any).googlePayMerchantId ?? "";

        // 3. Load Flex SDK (for Apple Pay CyberSource merchant session handling)
        await loadScript(getFlexScriptUrl(environmentRef.current));
        if (cancelled) return;

        const Flex = (window as any).Flex;
        if (Flex) {
          try {
            flexRef.current = new Flex(captureContextRef.current);
          } catch {
            // Flex init failure is non-fatal; Apple Pay button will still attempt
            // to open a session — just won't have CS merchant validation support.
            flexRef.current = null;
          }
        }

        // 4. Check Apple Pay availability (server flag + browser capability)
        if (ctx.applePayEnabled !== false && isApplePayAvailable()) {
          setApplePayReady(true);
        }

        // 5. Check Google Pay availability
        if (ctx.googlePayEnabled !== false && merchantIdRef.current) {
          try {
            await loadScript(GPAY_SCRIPT);
            if (cancelled) return;

            const PaymentsClient = (window as any).google?.payments?.api?.PaymentsClient;
            if (PaymentsClient) {
              const client = new PaymentsClient({
                environment: environmentRef.current === "live" ? "PRODUCTION" : "TEST", // i18n-ignore
              });
              gpayClientRef.current = client;

              const { result } = await client.isReadyToPay(
                buildGpayIsReadyToPayRequest(merchantIdRef.current),
              );
              if (!cancelled && result === true) {
                setGooglePayReady(true);
              }
            }
          } catch {
            // Google Pay unavailable — not an error
          }
        }

        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLebanonUsd]);

  // ── Apple Pay payment handler ───────────────────────────────────────────────
  const handleApplePay = useCallback(async () => {
    const ApplePaySession = (window as any).ApplePaySession;
    if (!ApplePaySession || !captureContextRef.current || !orderIdRef.current) return;

    setState("paying");
    onSetProcessing?.(true);

    try {
      // Decode totalAmount from the Flex capture context payload
      // (second JWT segment is base64-encoded JSON with order info).
      let totalAmount = "0.00";
      try {
        const payload = JSON.parse(
          atob(captureContextRef.current.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        totalAmount = payload?.ctx?.[0]?.data?.totalAmount ?? "0.00";
      } catch { /* use default */ }

      const request: ApplePayJS.ApplePayPaymentRequest = {
        countryCode: "LB", // i18n-ignore
        currencyCode: "USD", // i18n-ignore
        total: { label: "Presentail", amount: totalAmount }, // i18n-ignore
        supportedNetworks: ["visa", "masterCard", "amex"], // i18n-ignore
        merchantCapabilities: ["supports3DS"], // i18n-ignore
      };

      const session = new ApplePaySession(3, request);

      session.onvalidatemerchant = (event: ApplePayJS.ApplePayValidateMerchantEvent) => {
        // CyberSource Flex SDK handles merchant validation when Apple Pay
        // is in the capture context's allowedPaymentTypes.
        const flex = flexRef.current;
        if (flex && typeof flex.startApplePaySession === "function") {
          flex.startApplePaySession(event.validationURL, (err: any, merchantSession: any) => {
            if (err) {
              session.abort();
              setState("ready");
              onSetProcessing?.(false);
              onPaymentError(t("checkout.cybersource.walletDeclinedDesc") as string);
            } else {
              session.completeMerchantValidation(merchantSession);
            }
          });
        } else {
          // Merchant validation requires the Apple Pay certificate to be
          // provisioned on the backend. Abort gracefully until cert is in place.
          session.abort();
          setState("ready");
          onSetProcessing?.(false);
        }
      };

      session.onpaymentauthorized = async (event: ApplePayJS.ApplePayPaymentAuthorizedEvent) => {
        try {
          // The Flex SDK provides a method to create a transient token from the
          // Apple Pay payment token. If unavailable, use a placeholder that the
          // backend will reject cleanly (avoids UI hang).
          const flex = flexRef.current;
          let transientToken: string | null = null;

          if (flex && typeof flex.createTransientTokenFromApplePayToken === "function") {
            transientToken = await new Promise<string>((resolve, reject) => {
              flex.createTransientTokenFromApplePayToken(
                event.payment.token,
                (err: any, token: string) => err ? reject(err) : resolve(token),
              );
            });
          }

          if (!transientToken || transientToken.split(".").length !== 3) {
            session.completePayment({ status: (ApplePaySession as any).STATUS_FAILURE });
            setState("ready");
            onSetProcessing?.(false);
            onPaymentError(t("checkout.cybersource.walletDeclinedDesc") as string);
            return;
          }

          const chargeRes = await walletCharge.mutateAsync({
            orderId: orderIdRef.current!,
            transientTokenJwt: transientToken,
            items,
            district,
            expressDelivery,
            noAddress,
            deliverySlot,
            deliverySlotId,
            cityId,
            deliveryDate,
            billingDetails: {
              firstName: senderFirstName,
              lastName: senderLastName,
              email: senderEmail,
            },
            selectedWallet: "apple_pay",
          });

          if (chargeRes.ok && chargeRes.paymentRef) {
            session.completePayment({ status: (ApplePaySession as any).STATUS_SUCCESS });
            setState("ready");
            onSetProcessing?.(false);
            onPaymentSuccess(chargeRes.paymentRef);
          } else {
            session.completePayment({ status: (ApplePaySession as any).STATUS_FAILURE });
            setState("ready");
            onSetProcessing?.(false);
            onPaymentError(chargeRes.message ?? t("checkout.cybersource.walletDeclinedDesc") as string);
          }
        } catch (err: any) {
          session.completePayment({ status: (ApplePaySession as any).STATUS_FAILURE });
          setState("ready");
          onSetProcessing?.(false);
          onPaymentError(err?.message ?? t("checkout.cybersource.walletDeclinedDesc") as string);
        }
      };

      session.oncancel = () => {
        setState("ready");
        onSetProcessing?.(false);
      };

      session.begin();
    } catch (err: any) {
      setState("ready");
      onSetProcessing?.(false);
      onPaymentError(err?.message ?? t("checkout.cybersource.walletDeclinedDesc") as string);
    }
  }, [
    items, district, expressDelivery, noAddress, deliverySlot, deliverySlotId,
    cityId, deliveryDate, senderFirstName, senderLastName, senderEmail,
    onPaymentSuccess, onPaymentError, onSetProcessing, t, walletCharge,
  ]);

  // ── Google Pay payment handler ──────────────────────────────────────────────
  const handleGooglePay = useCallback(async () => {
    const client = gpayClientRef.current;
    if (!client || !captureContextRef.current || !orderIdRef.current) return;

    setState("paying");
    onSetProcessing?.(true);

    try {
      let totalAmount = "0.00";
      try {
        const payload = JSON.parse(
          atob(captureContextRef.current.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        totalAmount = payload?.ctx?.[0]?.data?.totalAmount ?? "0.00";
      } catch { /* use default */ }

      const paymentDataRequest = buildGpayPaymentDataRequest({
        gatewayMerchantId: merchantIdRef.current,
        googlePayMerchantId: googlePayMerchantIdRef.current,
        totalAmount,
        currency: "USD", // i18n-ignore
        countryCode: "LB", // i18n-ignore
      });

      const paymentData = await client.loadPaymentData(paymentDataRequest);

      // Extract the Google Pay token from paymentData.
      // CyberSource expects the token passed as the transient token JWT; the
      // gateway parameter in the request instructs Google to encrypt the token
      // for CyberSource. The raw token string is a JSON payload that
      // CyberSource's /pts/v2/payments endpoint accepts directly.
      const googleToken = paymentData?.paymentMethodData?.tokenizationData?.token;
      if (!googleToken) {
        setState("ready");
        onSetProcessing?.(false);
        onPaymentError(t("checkout.cybersource.walletDeclinedDesc") as string);
        return;
      }

      // The Flex SDK wraps the Google Pay token into a transient JWT when
      // createTransientTokenFromGooglePayToken is available.
      const flex = flexRef.current;
      let transientToken: string | null = null;
      if (flex && typeof flex.createTransientTokenFromGooglePayToken === "function") {
        transientToken = await new Promise<string>((resolve, reject) => {
          flex.createTransientTokenFromGooglePayToken(googleToken, (err: any, token: string) =>
            err ? reject(err) : resolve(token),
          );
        });
      }

      if (!transientToken || transientToken.split(".").length !== 3) {
        setState("ready");
        onSetProcessing?.(false);
        onPaymentError(t("checkout.cybersource.walletDeclinedDesc") as string);
        return;
      }

      const chargeRes = await walletCharge.mutateAsync({
        orderId: orderIdRef.current!,
        transientTokenJwt: transientToken,
        items,
        district,
        expressDelivery,
        noAddress,
        deliverySlot,
        deliverySlotId,
        cityId,
        deliveryDate,
        billingDetails: {
          firstName: senderFirstName,
          lastName: senderLastName,
          email: senderEmail,
        },
        selectedWallet: "google_pay",
      });

      if (chargeRes.ok && chargeRes.paymentRef) {
        setState("ready");
        onSetProcessing?.(false);
        onPaymentSuccess(chargeRes.paymentRef);
      } else {
        setState("ready");
        onSetProcessing?.(false);
        onPaymentError(chargeRes.message ?? t("checkout.cybersource.walletDeclinedDesc") as string);
      }
    } catch (err: any) {
      // Google Pay session cancelled by user — not a hard error
      const isCancelled = err?.statusCode === "CANCELED" || err?.statusCode === "USER_CANCELED"; // i18n-ignore
      setState("ready");
      onSetProcessing?.(false);
      if (!isCancelled) {
        onPaymentError(err?.message ?? t("checkout.cybersource.walletDeclinedDesc") as string);
      }
    }
  }, [
    items, district, expressDelivery, noAddress, deliverySlot, deliverySlotId,
    cityId, deliveryDate, senderFirstName, senderLastName, senderEmail,
    onPaymentSuccess, onPaymentError, onSetProcessing, t, walletCharge,
  ]);

  // Google Pay button container ref — the GPay SDK renders into this element
  const gpayButtonContainerRef = useRef<HTMLDivElement>(null);

  // Mount the Google Pay button into the container once client + ready state
  // are both confirmed.
  useEffect(() => {
    if (!googlePayReady || !gpayClientRef.current || !gpayButtonContainerRef.current) return;
    const container = gpayButtonContainerRef.current;
    if (container.children.length > 0) return; // already mounted
    try {
      const button = gpayClientRef.current.createButton({
        onClick: () => { if (!disabled && state !== "paying") void handleGooglePay(); },
        buttonType: "pay", // i18n-ignore
        buttonColor: "black", // i18n-ignore
        buttonSizeMode: "fill", // i18n-ignore
      });
      container.appendChild(button);
    } catch {
      // Button creation failed — suppress; the container stays empty
    }
  }, [googlePayReady, disabled, state, handleGooglePay]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!isLebanonUsd) return null;

  const hasAnyWallet = applePayReady || googlePayReady;
  const isPaying = state === "paying";
  const isLoading = state === "loading" || walletCapture.isPending;

  // While loading or when no wallets are available (after the check), render
  // nothing — don't show a loading skeleton so we don't shift layout.
  if (state === "error" || (!isLoading && !hasAnyWallet)) return null;
  if (isLoading) return null;

  return (
    <div className="mt-2" data-testid="cybersource-wallet-section">
      {applePayReady && (
        <div className="mb-2">
            {/* Apple Pay button: WebkitAppearance renders the native Safari Pay button.
              The -apple-pay-button-style / -apple-pay-button-type CSS custom props
              are non-standard and cannot be set via React's inline style object
              without casting; use a data-attribute to carry them safely. */}
          <button
            type="button"
            data-testid="apple-pay-button"
            disabled={disabled || isPaying}
            onClick={() => { if (!disabled && !isPaying) void handleApplePay(); }}
            style={
              Object.assign(
                {
                  display: "block",
                  width: "100%",
                  height: "44px",
                  borderRadius: "8px",
                  cursor: disabled || isPaying ? "not-allowed" : "pointer",
                  opacity: disabled || isPaying ? 0.5 : 1,
                  WebkitAppearance: "-apple-pay-button",
                  border: "none",
                  background: "transparent",
                } as React.CSSProperties,
                {
                  // Non-standard WebKit-only CSS properties for Apple Pay button appearance.
                  // TypeScript doesn't know about them, so we merge them separately.
                  "-apple-pay-button-style": "black",
                  "-apple-pay-button-type": "pay",
                }
              )
            }
            aria-label="Apple Pay" // i18n-ignore
          />
        </div>
      )}
      {googlePayReady && (
        <div
          ref={gpayButtonContainerRef}
          className="mb-2"
          style={{
            height: "44px",
            borderRadius: "8px",
            overflow: "hidden",
            opacity: disabled || isPaying ? 0.5 : 1,
            pointerEvents: disabled || isPaying ? "none" : undefined,
          }}
          data-testid="gpay-button-container"
        />
      )}
      {/* "or pay with card" divider — only rendered when at least one wallet button is visible */}
      <div className="flex items-center gap-3 my-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground shrink-0">
          {t("checkout.cybersource.orPayWithCard")}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────
// Wraps the wallet section so any uncaught error silently hides only the wallet
// buttons — the CyberSource card form (CyberSourceSection) is unaffected.

type BoundaryState = { hasError: boolean };

class WalletErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Wallet section failed silently — card form remains usable.
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ── Public exports ────────────────────────────────────────────────────────────
// The default export is the error-boundary-wrapped component.
// Checkout.tsx uses React.lazy() so this chunk is never loaded for non-LB/USD.

export function CyberSourceWalletSection(props: CyberSourceWalletSectionProps) {
  return (
    <WalletErrorBoundary>
      <CyberSourceWalletSectionInner {...props} />
    </WalletErrorBoundary>
  );
}

export default CyberSourceWalletSection;

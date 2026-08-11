/**
 * CyberSource Unified Checkout (UC) Microform v2 section.
 *
 * Loads the CyberSource Flex Microform SDK, renders hosted card-number and CVV
 * iframes, and exposes a `createToken` imperative handle so the parent
 * checkout form can collect a transient token on submit.
 *
 * The SDK URL differs between test and production environments — the backend
 * capture-context endpoint returns which environment is active so the client
 * can load the matching SDK script.
 *
 * UC 3DS lifecycle (inline combined payer-auth approach):
 *   - Frictionless flows: the backend's first `POST /pts/v2/payments` with
 *     `payerAuthEnrollService.run="true"` completes immediately with AUTHORIZED.
 *   - Challenge-required flows: the backend returns `{ pending3DS: true, stepUpUrl,
 *     accessToken }` with csStatus=PENDING_AUTHENTICATION. The parent Checkout
 *     shows the Cs3dsChallenge overlay which submits `JWT=accessToken` into an
 *     iframe targeting stepUpUrl (the ACS challenge URL). After the shopper
 *     completes the challenge, the ACS POSTs to our /3ds-return endpoint which
 *     postMessages the transactionId back. The parent then makes a second
 *     `POST /pts/v2/payments` with `payerAuthValidateService.run="true"` and
 *     the transactionId, completing the validation and capturing the payment.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Types from the CyberSource Flex Microform v2 SDK ─────────────────────────
// The SDK exposes a global `Flex` constructor and a `MicroformInstance`.
type MicroformField = {
  load: (selector: string) => void;
  on: (event: string, handler: (data?: Record<string, unknown>) => void) => void;
};

type MicroformInstance = {
  createField: (
    type: "number" | "securityCode",
    options?: Record<string, unknown>,
  ) => MicroformField;
  createToken: (
    options: Record<string, unknown>,
    callback: (err: { message?: string } | null, token?: string) => void,
  ) => void;
};

type FlexConstructor = new (captureContext: string) => {
  microform: (options?: Record<string, unknown>) => MicroformInstance;
};

declare global {
  interface Window {
    Flex?: FlexConstructor;
  }
}

// ── SDK URL selection ─────────────────────────────────────────────────────────
const CS_SDK_TEST =
  "https://testflex.cybersource.com/microform/bundle/v2/flex-microform.min.js";
const CS_SDK_PROD =
  "https://flex.cybersource.com/microform/bundle/v2/flex-microform.min.js";

function getSdkUrl(environment: "test" | "production"): string {
  return environment === "production" ? CS_SDK_PROD : CS_SDK_TEST;
}

// ── Component interface ───────────────────────────────────────────────────────

export type CyberSourceSectionHandle = {
  /** Returns the transient token or throws on failure. */
  createToken: (
    expirationMonth: string,
    expirationYear: string,
  ) => Promise<string>;
};

type Props = {
  captureContext: string;
  environment: "test" | "production";
  disabled?: boolean;
};

const CARD_FIELD_ID = "cs-card-number";
const CVV_FIELD_ID = "cs-security-code";

/** CSS injected into the hosted iframes via the Microform styles API. */
const MICROFORM_STYLES = {
  input: {
    "font-size": "16px",
    "font-family": "inherit",
    color: "#111",
  },
  "::placeholder": { color: "#aaa" },
  ":focus": { color: "#111" },
  valid: { color: "#111" },
  invalid: { color: "#ef4444" },
};

export const CyberSourceCheckoutSection = forwardRef<
  CyberSourceSectionHandle,
  Props
>(function CyberSourceCheckoutSection({ captureContext, environment, disabled }, ref) {
  const [sdkLoaded, setSdkLoaded] = useState(() => !!window.Flex);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [microformReady, setMicroformReady] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    number?: string;
    cvv?: string;
  }>({});
  const microformRef = useRef<MicroformInstance | null>(null);

  // ── Load the UC SDK script ──────────────────────────────────────────────
  useEffect(() => {
    if (window.Flex) {
      setSdkLoaded(true);
      return undefined;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${getSdkUrl(environment)}"]`,
    );
    if (existing) {
      const onLoad = () => setSdkLoaded(true);
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }

    const script = document.createElement("script");
    script.src = getSdkUrl(environment);
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () =>
      setSdkError(
        "Failed to load the secure card entry SDK. Please refresh and try again.",
      );
    document.head.appendChild(script);
    return undefined;
  }, [environment]);

  // ── Initialise the Microform once the SDK is loaded ─────────────────────
  useEffect(() => {
    if (!sdkLoaded || !window.Flex || !captureContext) return;

    let mounted = true;

    try {
      const flex = new window.Flex(captureContext);
      const microform = flex.microform({ styles: MICROFORM_STYLES });
      microformRef.current = microform;

      const numberField = microform.createField("number", {
        placeholder: "Card number",
      });
      const cvvField = microform.createField("securityCode", {
        placeholder: "CVV",
      });

      // Attach validation listeners.
      numberField.on("change", (data) => {
        const hasError =
          data && "valid" in data && !(data as { valid: boolean }).valid;
        setFieldErrors((prev) => ({
          ...prev,
          number: hasError ? "Please check your card number." : undefined,
        }));
      });
      cvvField.on("change", (data) => {
        const hasError =
          data && "valid" in data && !(data as { valid: boolean }).valid;
        setFieldErrors((prev) => ({
          ...prev,
          cvv: hasError ? "Please check your CVV." : undefined,
        }));
      });

      numberField.load(`#${CARD_FIELD_ID}`);
      cvvField.load(`#${CVV_FIELD_ID}`);

      if (mounted) setMicroformReady(true);
    } catch (err) {
      if (mounted)
        setSdkError(
          "Could not initialise the secure card form. Please refresh and try again.",
        );
    }

    return () => {
      mounted = false;
    };
    // Intentionally omit captureContext from deps: re-initialising destroys the
    // iframes and triggers a fresh SDK call. captureContext is stable for the
    // lifetime of the component (parent fetches once per checkout attempt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkLoaded]);

  // ── Imperative handle for the parent submit handler ─────────────────────
  useImperativeHandle(ref, () => ({
    createToken: (expirationMonth, expirationYear) =>
      new Promise<string>((resolve, reject) => {
        const microform = microformRef.current;
        if (!microform) {
          reject(new Error("Secure card form is not ready. Please wait."));
          return;
        }
        const options = {
          expirationMonth,
          expirationYear,
        };
        microform.createToken(options, (err, token) => {
          if (err || !token) {
            reject(
              new Error(
                err?.message ??
                  "Could not collect your card details. Please try again.",
              ),
            );
          } else {
            resolve(token);
          }
        });
      }),
  }));

  // ── Render ──────────────────────────────────────────────────────────────

  if (sdkError) {
    return (
      <p className="mt-3 ms-8 text-sm text-destructive leading-relaxed">
        {sdkError}
      </p>
    );
  }

  return (
    <div className="mt-3 ms-8 space-y-3">
      {!microformReady && (
        <p className="text-sm text-muted-foreground">
          Loading secure card form… {/* i18n-ignore */}
        </p>
      )}

      {/* Card number iframe mount point */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Card number {/* i18n-ignore */}
        </label>
        <div
          id={CARD_FIELD_ID}
          className={`h-10 border rounded-lg px-3 flex items-center transition-colors ${
            disabled ? "opacity-50 pointer-events-none" : ""
          } ${fieldErrors.number ? "border-destructive" : "border-input"}`}
          style={{ backgroundColor: "hsl(var(--background))" }}
          aria-label="Secure card number input" // i18n-ignore
        />
        {fieldErrors.number && (
          <p className="text-xs text-destructive">{fieldErrors.number}</p>
        )}
      </div>

      {/* Expiry and CVV row — expiry inputs are plain HTML, CVV is hosted */}
      <div className="grid grid-cols-3 gap-2">
        {/* Expiry month / year inputs rendered by parent (plain HTML inputs
            passed down via the csExpiryMonth / csExpiryYear props). The parent
            reads them directly in the submit handler. */}
        <div className="col-span-2 grid grid-cols-2 gap-2" id="cs-expiry-root" />

        {/* CVV iframe mount point */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            CVV {/* i18n-ignore */}
          </label>
          <div
            id={CVV_FIELD_ID}
            className={`h-10 border rounded-lg px-3 flex items-center transition-colors ${
              disabled ? "opacity-50 pointer-events-none" : ""
            } ${fieldErrors.cvv ? "border-destructive" : "border-input"}`}
            style={{ backgroundColor: "hsl(var(--background))" }}
            aria-label="Secure CVV input" // i18n-ignore
          />
          {fieldErrors.cvv && (
            <p className="text-xs text-destructive">{fieldErrors.cvv}</p>
          )}
        </div>
      </div>
    </div>
  );
});

CyberSourceCheckoutSection.displayName = "CyberSourceCheckoutSection";

// ── CyberSource Unified Checkout (v1) widget ─────────────────────────────────
// Replaces the Microform card fields + manual Payer Auth orchestration
// (CyberSourceSection + CyberSourceDeviceDataFrame + CyberSourceChallengeModal)
// for the LB+USD flow when CYBERSOURCE_UNIFIED_CHECKOUT_ENABLED is on.
//
// Flow — everything payment-related happens inside the widget; none of the
// /payer-auth/* endpoints are ever called on this path:
//   1. POST /payment/cybersource/unified-checkout/session → session JWT whose
//      completeMandate is { type: "CAPTURE", consumerAuthentication: "3DS" },
//      plus the clientLibrary URL + SRI integrity hash extracted from it.
//   2. Load the UC SDK <script> from that clientLibrary URL (never hardcoded —
//      the URL is per-environment and per-session, per CyberSource docs; the
//      test/live distinction is baked into it by the server-side session).
//   3. `client = await VAS.UnifiedCheckout(sessionJwt)` — the SDK validates
//      the JWT and that the current page origin is in targetOrigins.
//   4. `checkout = await client.createCheckout({ autoProcessing: true })` then
//      `checkout.mount(...)` renders the card form. Because the session has a
//      completeMandate, the SDK runs 3DS device-data collection, enrollment,
//      any issuer challenge, and the authorization+capture itself when the
//      shopper presses its Pay button.
//   5. mount()'s long-lived promise resolves with the completed-payment-result
//      JWT → decoded here (tolerantly) and handed to onResult so Checkout.tsx
//      can call /unified-checkout/complete + finalize the order. A rejection
//      (cancelled/failed challenge, declined card, SDK error) goes to onError
//      and the order is never marked paid.
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  useCybersourceUnifiedCheckoutSession,
  type CsUnifiedCheckoutResult,
  type PayCartItem,
} from "@/lib/queries";

export type CyberSourceUnifiedCheckoutPayload = {
  items: PayCartItem[];
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  cityId?: string;
  deliveryDate?: string;
  targetOrigin?: string;
  billingDetails?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  paymentAttemptId?: string;
};

type Props = {
  /** Full request body for the session endpoint (server recomputes totals). */
  payload: CyberSourceUnifiedCheckoutPayload;
  /**
   * Serialized fee-affecting inputs. When it changes the current widget is
   * torn down and a fresh session (with the new server-side total) is created.
   */
  sessionKey: string;
  /** Completed payment result — caller posts it to /unified-checkout/complete. */
  onResult: (result: CsUnifiedCheckoutResult) => void | Promise<void>;
  /** Widget/SDK/session failure — caller shows a toast; order stays unpaid. */
  onError: (message: string, reason?: string) => void;
};

// Client-side mirror of the server's approved-status allowlist — used only to
// pre-compute the `approved` convenience flag; the server re-derives it.
const UC_APPROVED_STATUSES = new Set([
  "AUTHORIZED",
  "PARTIAL_AUTHORIZED",
  "AUTHORIZED_PENDING_REVIEW",
  "PENDING_REVIEW",
]);

function decodeJwtPayloadBrowser(jwt: string): unknown {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("not a JWT"); // i18n-ignore — developer error, never shown
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const json = decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join(""),
  );
  return JSON.parse(json);
}

function pickString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
  }
  return undefined;
}

// The exact claim layout of the completed-payment-result JWT is not publicly
// documented, so extraction is deliberately tolerant across the shapes
// CyberSource uses elsewhere (flat, data-wrapped, ctx-wrapped). The backend
// applies the same tolerance when cross-checking the raw JWT.
/* eslint-disable @typescript-eslint/no-explicit-any */
function parseUcPaymentResult(resultJwt: string): CsUnifiedCheckoutResult {
  let p: any = {};
  try {
    p = decodeJwtPayloadBrowser(resultJwt) ?? {};
  } catch {
    // Undecodable — return only the raw JWT; the server will reject the
    // missing flat fields via its strict paid gate.
    return { paymentResultJwt: resultJwt };
  }
  const roots: any[] = [p, p?.data, p?.ctx?.[0]?.data, p?.paymentResponse, p?.data?.paymentResponse].filter(
    (r) => r && typeof r === "object",
  );
  const first = (fn: (r: any) => unknown): string | undefined =>
    pickString(...roots.map((r) => fn(r)));

  const requestId = first((r) => r?.id) ?? first((r) => r?.requestId);
  const status = first((r) => r?.status);
  const authInfo = roots
    .map((r) => r?.consumerAuthenticationInformation)
    .find((a) => a && typeof a === "object") as any | undefined;
  const authenticationStatus =
    pickString(authInfo?.status, authInfo?.authenticationStatus) ??
    first((r) => r?.authenticationStatus);
  const ecommerceIndicator =
    pickString(authInfo?.indicator, authInfo?.ecommerceIndicator, authInfo?.eciRaw, authInfo?.eci) ??
    first((r) => r?.ecommerceIndicator);
  const cavv = pickString(authInfo?.cavv);
  const directoryServerTransactionId =
    pickString(authInfo?.directoryServerTransactionId) ??
    first((r) => r?.directoryServerTransactionId);
  const specificationVersion =
    pickString(authInfo?.specificationVersion, authInfo?.paSpecificationVersion) ??
    first((r) => r?.specificationVersion);
  const challengeRequired = [authInfo?.challengeRequired, ...roots.map((r) => r?.challengeRequired)]
    .map((v) => (typeof v === "string" ? v.toUpperCase() === "Y" || v.toLowerCase() === "true" : v))
    .find((v) => typeof v === "boolean") as boolean | undefined;

  return {
    approved: status !== undefined && UC_APPROVED_STATUSES.has(status),
    requestId,
    status,
    authenticationStatus,
    ecommerceIndicator,
    cavvPresent: cavv !== undefined ? true : undefined,
    directoryServerTransactionId,
    specificationVersion,
    challengeRequired,
    paymentResultJwt: resultJwt,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Load the UC SDK script exactly once per URL, with the SRI integrity value
// from the session JWT (docs require integrity + crossorigin="anonymous").
const ucScriptStates = new Map<string, Promise<void>>();
function loadUcScript(src: string, integrity?: string): Promise<void> {
  const existing = ucScriptStates.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    if (integrity) {
      el.integrity = integrity;
      el.crossOrigin = "anonymous"; // i18n-ignore
    }
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => {
      ucScriptStates.delete(src); // allow a retry after a transient CDN failure
      reject(new Error("Unified Checkout SDK failed to load")); // i18n-ignore — mapped to i18n toast by caller
    });
    document.head.appendChild(el);
  });
  ucScriptStates.set(src, promise);
  return promise;
}

export default function CyberSourceUnifiedCheckout({ payload, sessionKey, onResult, onError }: Props) {
  const { t } = useLocale();
  const sessionMutation = useCybersourceUnifiedCheckoutSession();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");

  // Latest-value refs so the long-lived mount() promise and the session effect
  // never capture stale closures (and so callback identity changes don't
  // recreate the widget).
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const sessionMutationRef = useRef(sessionMutation);
  sessionMutationRef.current = sessionMutation;

  useEffect(() => {
    let cancelled = false;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let ucClient: any = null;
    let ucCheckout: any = null;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    setPhase("loading");

    (async () => {
      try {
        const session = await sessionMutationRef.current.mutateAsync(payloadRef.current);
        if (cancelled) return;
        if (!session.ok || !session.captureContext) {
          throw new Error(session.message || "unified checkout session failed"); // i18n-ignore — mapped to i18n toast below
        }
        if (!session.clientLibrary) {
          // The SDK URL must come from the session JWT; without it we cannot
          // safely load the widget.
          throw new Error("unified checkout session missing clientLibrary"); // i18n-ignore — mapped to i18n toast below
        }

        await loadUcScript(session.clientLibrary, session.clientLibraryIntegrity);
        if (cancelled) return;

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const VAS = (window as any).VAS;
        if (!VAS?.UnifiedCheckout) {
          throw new Error("unified checkout SDK unavailable after load"); // i18n-ignore — mapped to i18n toast below
        }

        ucClient = await VAS.UnifiedCheckout(session.captureContext);
        if (cancelled) return;

        // autoProcessing (default when the session has a completeMandate):
        // the SDK itself performs 3DS + CAPTURE when the shopper presses Pay.
        ucCheckout = await ucClient.createCheckout({ autoProcessing: true });
        if (cancelled) return;

        // Reveal the container once the widget signals ready; keep a fallback
        // in case this SDK version doesn't emit the event.
        try {
          ucCheckout.on?.("ready", () => {
            if (!cancelled) setPhase("ready");
          });
        } catch {
          // event API unavailable — fallback timer below handles it
        }
        window.setTimeout(() => {
          if (!cancelled) setPhase((prev) => (prev === "loading" ? "ready" : prev));
        }, 2500);

        // Embedded mode: both panels render inline inside our container div
        // (#cybersource-unified-checkout) instead of the sliding sidebar.
        // This promise stays pending until the shopper completes payment.
        const resultJwt: unknown = await ucCheckout.mount({
          paymentSelection: "#cybersource-uc-selection", // i18n-ignore
          paymentScreen: "#cybersource-uc-screen", // i18n-ignore
        });
        if (cancelled) return;

        if (typeof resultJwt === "string" && resultJwt.split(".").length === 3) {
          await onResultRef.current(parseUcPaymentResult(resultJwt));
        } else if (resultJwt && typeof resultJwt === "object") {
          // Defensive: some SDK builds may resolve with an object envelope.
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const maybeJwt = pickString((resultJwt as any).token, (resultJwt as any).jwt);
          if (maybeJwt && maybeJwt.split(".").length === 3) {
            await onResultRef.current(parseUcPaymentResult(maybeJwt));
          } else {
            throw new Error("unified checkout returned an unrecognized result"); // i18n-ignore — mapped to i18n toast below
          }
        } else {
          throw new Error("unified checkout returned an empty result"); // i18n-ignore — mapped to i18n toast below
        }
      } catch (err) {
        if (cancelled) return;
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const reason = (err as any)?.reason as string | undefined;
        const message = (err as any)?.message ?? String(err);
        /* eslint-enable @typescript-eslint/no-explicit-any */
        setPhase("error");
        onErrorRef.current(message, reason);
      }
    })();

    return () => {
      cancelled = true;
      // Destroy widget + client so a re-render never double-mounts.
      try {
        ucCheckout?.destroy?.();
      } catch {
        // already torn down
      }
      try {
        ucClient?.destroy?.();
      } catch {
        // already torn down
      }
    };
    // sessionKey is the deliberate single dependency: it serializes every
    // fee-affecting input, and refs above carry the latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  return (
    <div className="mt-3">
      {phase === "loading" && (
        <div
          className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/30 py-6 text-sm text-muted-foreground"
          data-testid="loading-unified-checkout"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("checkout.cybersource.loading")}</span>
        </div>
      )}
      {phase === "error" && (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          data-testid="error-unified-checkout"
        >
          {t("checkout.toast.cybersourceUnavailableDesc")}
        </div>
      )}
      <div id="cybersource-unified-checkout" className={phase === "ready" ? "block" : "hidden"}>
        <div id="cybersource-uc-selection" />
        <div id="cybersource-uc-screen" />
      </div>
    </div>
  );
}

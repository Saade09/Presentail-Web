// CyberSource Microform v2 card form component.
//
// KEY RULES:
// 1. Load the SDK from the capture-context JWT's `clientLibrary` field — never
//    hardcode a URL.  The JWT specifies an exact versioned bundle (e.g. v2.12.1)
//    that matches the capture context.  Loading the generic /v2/ bundle causes
//    the iframe to load the wrong URL and show "refused to connect".
// 2. Containers must be ALWAYS in the DOM and ALWAYS VISIBLE when load() is
//    called — if they are display:none at that moment the SDK injects 0-height
//    iframes that appear as "broken content".
// 3. Call (flex as any).microform({ styles }) — OPTIONS ONLY, no type string.
//    The SDK warns "Defaulting to 'card'" — that warning is expected and harmless.
// 4. Never create iframes manually.  createField(...).load(selector) is the only
//    supported way to inject the secure iframe.

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { useLocale } from "@/contexts/LocaleContext";

// ── JWT helpers ───────────────────────────────────────────────────────────────

function decodeCaptureContextPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Extract the versioned SDK URL, SRI hash, targetOrigins and expiry from the capture-context JWT. */
function extractSdkInfo(captureContext: string): {
  url: string | null;
  integrity: string | null;
  targetOrigins: string[];
  exp: number | null;
  flexOrigin: string | null;
} {
  const payload = decodeCaptureContextPayload(captureContext);
  if (!payload) return { url: null, integrity: null, targetOrigins: [], exp: null, flexOrigin: null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = Array.isArray((payload as any).ctx) ? (payload as any).ctx[0]?.data : undefined;
  return {
    url: ctx?.clientLibrary ?? null,
    integrity: ctx?.clientLibraryIntegrity ?? null,
    targetOrigins: Array.isArray(ctx?.targetOrigins) ? ctx.targetOrigins : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exp: typeof (payload as any).exp === "number" ? (payload as any).exp : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flexOrigin: (payload as any).flx?.origin ?? null,
  };
}

// ── SDK loader ────────────────────────────────────────────────────────────────
// Cached per URL so the script is only injected once per session even when the
// component re-mounts (e.g. user navigates away and back to checkout).

const _scriptCache = new Map<string, Promise<void>>();

function loadFlexScript(url: string, integrity?: string | null): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).Flex) return Promise.resolve();
  const cached = _scriptCache.get(url);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (existing) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).Flex) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`CyberSource SDK failed to load: ${url}`))); // i18n-ignore
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`CyberSource SDK failed to load: ${url}`)); // i18n-ignore
    document.head.appendChild(s);
  });
  _scriptCache.set(url, p);
  return p;
}

// ── Component ─────────────────────────────────────────────────────────────────

export type CyberSourceSectionRef = {
  createToken: () => Promise<string>;
};

export type CyberSourceSectionProps = {
  captureContext: string;
  disabled?: boolean;
  className?: string;
  prefetchError?: string | null;
  /** Passed for logging only; SDK URL is always read from the JWT. */
  environment?: "test" | "live";
  onFieldsReady?: () => void;
  onFieldsFailed?: (message: string) => void;
};

const NUMBER_CONTAINER_ID = "cs-number-container";
const CVV_CONTAINER_ID = "cs-cvv-container";

const CyberSourceSection = forwardRef<CyberSourceSectionRef, CyberSourceSectionProps>(
  (
    {
      captureContext,
      disabled = false,
      className,
      prefetchError,
      environment = "test",
      onFieldsReady,
      onFieldsFailed,
    },
    ref,
  ) => {
    const { t } = useLocale();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const microformRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const numberFieldRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cvvFieldRef = useRef<any>(null);

    // Stable callback refs — prevent effect re-runs when parent re-renders.
    const onFieldsReadyRef = useRef(onFieldsReady);
    const onFieldsFailedRef = useRef(onFieldsFailed);
    useEffect(() => { onFieldsReadyRef.current = onFieldsReady; }, [onFieldsReady]);
    useEffect(() => { onFieldsFailedRef.current = onFieldsFailed; }, [onFieldsFailed]);

    const [sdkState, setSdkState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [sdkError, setSdkError] = useState<string | null>(null);
    const [expiry, setExpiry] = useState("");
    const [expiryError, setExpiryError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      createToken: async () => {
        if (!microformRef.current) throw new Error("Card form not initialised"); // i18n-ignore
        const parsed = parseExpiry(expiry);
        if (!parsed) throw new Error("Invalid expiry date"); // i18n-ignore
        setExpiryError(null);
        return new Promise<string>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          microformRef.current.createToken(
            { expirationMonth: parsed.month, expirationYear: parsed.year },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (err: any, token: string) => {
              if (err) { setExpiryError(err?.message ?? null); reject(err); }
              else resolve(token);
            },
          );
        });
      },
    }), [expiry]);

    // ── Single-phase initialisation ──────────────────────────────────────────
    // CRITICAL RULES enforced here:
    // • SDK URL comes from JWT clientLibrary — never hardcoded.
    // • Containers are ALWAYS visible (no display:none) when load() is called.
    // • No manual iframe construction — only createField().load() is used.
    useEffect(() => {
      if (!captureContext) return;
      let cancelled = false;
      setSdkState("loading");
      setSdkError(null);
      numberFieldRef.current = null;
      cvvFieldRef.current = null;

      const clearContainers = () => {
        const nc = document.getElementById(NUMBER_CONTAINER_ID);
        const cc = document.getElementById(CVV_CONTAINER_ID);
        if (nc) nc.innerHTML = "";
        if (cc) cc.innerHTML = "";
      };
      clearContainers();

      // Step 1: extract the versioned SDK URL + targetOrigins + expiry from the JWT.
      const {
        url: sdkUrl,
        integrity: sdkIntegrity,
        targetOrigins: jwtTargetOrigins,
        exp: jwtExp,
        flexOrigin,
      } = extractSdkInfo(captureContext);

      if (import.meta.env.DEV) {
        const currentOrigin = window.location.origin;
        // frame-ancestors is checked against EVERY ancestor origin — when the
        // app runs inside the Replit workspace preview iframe, replit.com must
        // also be present in targetOrigins or the flex iframe is blocked with
        // "refused to connect" even though its src URL is correct.
        const ancestorOrigins =
          typeof window.location.ancestorOrigins !== "undefined"
            ? Array.from(window.location.ancestorOrigins)
            : [];
        const blockedAncestors = ancestorOrigins.filter((o) => !jwtTargetOrigins.includes(o));
        const nowSec = Math.floor(Date.now() / 1000);
        console.log("[CyberSource] origin check:", {
          currentOrigin,
          jwtTargetOrigins,
          originAllowed: jwtTargetOrigins.includes(currentOrigin),
          sdkUrl,
          iframeSrc: null, // not yet created — logged again after load()
          ancestorOrigins,
          blockedAncestors,
          jwtExpiresInSec: jwtExp != null ? jwtExp - nowSec : null,
          jwtExpired: jwtExp != null ? jwtExp <= nowSec : null,
          flexOrigin,
          envProp: environment, // from parent — for reference only
          sdkIntegrity: sdkIntegrity?.slice(0, 20),
        });
        if (blockedAncestors.length > 0) {
          console.warn(
            "[CyberSource] BLOCKING ISSUE: ancestor origin(s) missing from targetOrigins — " +
              "the browser will show 'refused to connect' in the Microform iframes:",
            blockedAncestors,
          );
        }
        if (jwtExp != null && jwtExp <= nowSec) {
          console.warn("[CyberSource] BLOCKING ISSUE: capture-context JWT is expired.");
        }
      }

      if (!sdkUrl) {
        const msg = "Capture context JWT missing clientLibrary — cannot load SDK"; // i18n-ignore
        setSdkError(msg);
        setSdkState("error");
        onFieldsFailedRef.current?.(msg);
        return;
      }

      // Step 2: load the exact versioned SDK with SRI integrity.
      loadFlexScript(sdkUrl, sdkIntegrity)
        .then(() => {
          if (cancelled) return;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Flex = (window as any).Flex;
          if (!Flex) throw new Error("Flex not found after script load"); // i18n-ignore

          // Step 3: init Microform — OPTIONS ONLY, no type string.
          // Internal iframe input styles sized to match the other 44px
          // checkout inputs (Stripe fields).
          const flex = new Flex(captureContext);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const microform = (flex as any).microform({
            styles: {
              input: {
                "font-size": "16px",
                "font-family": "Arial, sans-serif",
                color: "#111827",
                height: "44px",
                padding: "0 14px",
              },
              "::placeholder": { color: "#9ca3af" },
              ":focus": { color: "#111827" },
              valid: { color: "#111827" },
              invalid: { color: "#dc2626" },
            },
          });

          // Step 4: create fields and load into ALWAYS-VISIBLE containers.
          // Empty placeholders by design — the fields render blank until the
          // shopper types (the labels above them already say what goes where).
          const numberField = microform.createField("number", { placeholder: "" });
          const cvvField = microform.createField("securityCode", { placeholder: "" });

          numberFieldRef.current = numberField;
          cvvFieldRef.current = cvvField;
          microformRef.current = microform;

          // Containers are in the DOM and visible — load() creates correct-size iframes.
          numberField.load(`#${NUMBER_CONTAINER_ID}`);
          cvvField.load(`#${CVV_CONTAINER_ID}`);

          if (import.meta.env.DEV) {
            // Report injected iframe src values after the SDK has a moment to create them.
            setTimeout(() => {
              const ni = document.querySelector<HTMLIFrameElement>(`#${NUMBER_CONTAINER_ID} iframe`);
              const ci = document.querySelector<HTMLIFrameElement>(`#${CVV_CONTAINER_ID} iframe`);
              const currentOrigin = window.location.origin;
              console.log("[CyberSource] after load():", {
                currentOrigin,
                jwtTargetOrigins,
                originAllowed: jwtTargetOrigins.includes(currentOrigin),
                sdkUrl,
                iframeSrc: ni?.src ?? null,
                number: { found: !!ni, w: ni?.offsetWidth, h: ni?.offsetHeight },
                cvv:    { found: !!ci, src: ci?.src, w: ci?.offsetWidth, h: ci?.offsetHeight },
              });
            }, 1500);
          }

          if (!cancelled) {
            setSdkState("ready");
            onFieldsReadyRef.current?.();
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .catch((e: any) => {
          if (cancelled) return;
          const msg = e?.message ?? "Could not load payment form"; // i18n-ignore
          setSdkError(msg);
          setSdkState("error");
          onFieldsFailedRef.current?.(msg);
        });

      return () => {
        cancelled = true;
        microformRef.current = null;
        numberFieldRef.current = null;
        cvvFieldRef.current = null;
        clearContainers();
      };
    }, [captureContext, environment]);

    function parseExpiry(raw: string): { month: string; year: string } | null {
      const stripped = raw.replace(/\s/g, "");
      const parts = stripped.split("/");
      if (parts.length !== 2) return null;
      const mm = parts[0].trim().padStart(2, "0");
      const yy = parts[1].trim();
      if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(yy)) return null;
      const month = parseInt(mm, 10);
      if (month < 1 || month > 12) return null;
      return { month: mm, year: `20${yy}` };
    }

    const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      if (val.length === 2 && expiry.length === 1 && !val.includes("/")) val = val + " / ";
      if (val.length > 7) return;
      setExpiry(val);
      setExpiryError(null);
    };

    const isLoading = sdkState === "loading" || (sdkState === "idle" && !!captureContext);

    const displayError = !captureContext && prefetchError
      ? (t("checkout.toast.cybersourceUnavailableDesc") as string)
      : sdkState === "error"
        ? (sdkError ?? t("checkout.toast.cybersourceUnavailableDesc") as string)
        : null;

    // Containers are ALWAYS display:block — never conditionally hidden.
    // Fixed 44px height matching the Stripe inputs; the secure iframe inside
    // fills the container exactly (see the <style> rules below).
    const containerCss: React.CSSProperties = {
      display: "block",
      width: "100%",
      height: "44px",
      minHeight: "44px",
      maxHeight: "44px",
      overflow: "hidden",
      borderRadius: "12px",
      background: "#ffffff",
      pointerEvents: (disabled || isLoading) ? "none" : "auto",
    };

    return (
      <div className={className} data-testid="cybersource-section">
        <style>{`
          #${NUMBER_CONTAINER_ID} iframe,
          #${CVV_CONTAINER_ID} iframe {
            width: 100% !important;
            height: 44px !important;
            min-height: 44px !important;
            border: 0;
            display: block;
          }
        `}</style>

        {displayError && (
          <p className="text-sm text-destructive py-2">{displayError}</p>
        )}

        {/* ── Card number — container ALWAYS visible ───────────────────── */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("checkout.cybersource.cardNumber")}
          </label>
          <div
            id={NUMBER_CONTAINER_ID}
            className="border border-input"
            style={containerCss}
          />
        </div>

        {/* ── Expiry + CVV ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("checkout.cybersource.expiry")}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={expiry}
              onChange={handleExpiryChange}
              placeholder={t("checkout.cybersource.expiryPlaceholder")}
              disabled={disabled || isLoading}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              data-testid="cs-expiry"
              maxLength={7}
              autoComplete="cc-exp"
            />
            {expiryError && (
              <p className="text-xs text-destructive mt-1">{expiryError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("checkout.cybersource.cvv")}
            </label>
            {/* CVV container — ALWAYS visible, no conditional hiding */}
            <div
              id={CVV_CONTAINER_ID}
              className="border border-input"
              style={containerCss}
            />
          </div>
        </div>

        {isLoading && !displayError && (
          <p className="text-xs text-muted-foreground mt-2 animate-pulse">
            {t("checkout.cybersource.loading")}
          </p>
        )}
      </div>
    );
  },
);

CyberSourceSection.displayName = "CyberSourceSection";

export { CyberSourceSection };
export type { CyberSourceSectionRef as CyberSourceRef };

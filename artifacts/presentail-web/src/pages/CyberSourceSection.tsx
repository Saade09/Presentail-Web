// CyberSource Microform v2 card form component.
//
// Rendered inside the checkout payment section when the user picks the
// CyberSource tile.  Uses the CyberSource Flex Microform JS SDK to mount
// two iframes (card-number + CVV) into the page so raw card data never
// touches the Presentail server.
//
// Lifecycle:
//   1. Parent passes `captureContext` (JWT from POST /payment/cybersource/capture-context).
//   2. This component loads the CyberSource SDK script lazily, initialises the
//      Flex instance, and mounts the number + CVV microform fields.
//   3. Parent calls `tokenizeRef.current()` on submit to get the transient
//      token JWT back, then passes it to POST /payment/cybersource/charge.

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { CreditCard } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

// CyberSource Flex Microform SDK script URL (test vs live).
// Derived from the `environment` prop passed by the parent (which reads it
// from the capture-context API response).  Defaults to "test" so local dev
// works without extra config.
function getFlexScriptUrl(environment: "test" | "live"): string {
  return environment === "live"
    ? "https://flex.cybersource.com/microform/bundle/v2/flex-microform.min.js"
    : "https://testflex.cybersource.com/microform/bundle/v2/flex-microform.min.js";
}

// Cache script-load promises keyed by src URL so test and live can coexist
// without re-injecting and the same promise is reused on re-mounts.
const _flexScriptCache = new Map<string, Promise<void>>();

function loadFlexScript(environment: "test" | "live"): Promise<void> {
  const src = getFlexScriptUrl(environment);
  const cached = _flexScriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if ((window as any).Flex) { resolve(); return; }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("CyberSource SDK failed to load"))); // i18n-ignore
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("CyberSource SDK failed to load")); // i18n-ignore
    document.head.appendChild(s);
  });
  _flexScriptCache.set(src, p);
  return p;
}

// ── Public API exposed to parent via ref ──────────────────────────────────────
export type CyberSourceSectionRef = {
  // Returns the transient token JWT on success, or throws with an Error.
  // Expiry is read from the component's own managed input.
  createToken: () => Promise<string>;
};

export type CyberSourceSectionProps = {
  captureContext: string;
  disabled?: boolean;
  // Forwarded to the container div for styling.
  className?: string;
  // Error from the parent's prefetch attempt (e.g. 503 when CS is not configured).
  // When set and captureContext is still empty, shows this instead of the
  // loading skeleton so the user is never stuck staring at a blank form.
  prefetchError?: string | null;
  // "test" uses testflex.cybersource.com SDK; "live" uses flex.cybersource.com.
  // Derived from the capture-context API response.  Defaults to "test".
  environment?: "test" | "live";
};

const NUMBER_CONTAINER_ID = "cs-number-container";
const CVV_CONTAINER_ID = "cs-cvv-container";

const CyberSourceSection = forwardRef<CyberSourceSectionRef, CyberSourceSectionProps>(
  ({ captureContext, disabled = false, className, prefetchError, environment = "test" }, ref) => {
    const { t } = useLocale();
    const microformRef = useRef<any>(null);
    const [sdkState, setSdkState] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [sdkError, setSdkError] = useState<string | null>(null);

    // Expiry input managed locally; only used when createToken() is called.
    const [expiry, setExpiry] = useState("");
    const [expiryError, setExpiryError] = useState<string | null>(null);

    // ── Expose createToken() to parent ───────────────────────────────────────
    useImperativeHandle(ref, () => ({
      createToken: async () => {
        if (!microformRef.current) throw new Error("Card form not initialised"); // i18n-ignore
        const parsed = parseExpiry(expiry);
        if (!parsed) throw new Error("Invalid expiry date"); // i18n-ignore
        setExpiryError(null);
        return new Promise<string>((resolve, reject) => {
          microformRef.current.createToken(
            { expirationMonth: parsed.month, expirationYear: parsed.year },
            (err: any, token: string) => {
              if (err) { setExpiryError(err?.message ?? null); reject(err); }
              else resolve(token);
            },
          );
        });
      },
    }), [expiry]);

    // ── Mount microform fields when captureContext changes ────────────────────
    useEffect(() => {
      if (!captureContext) return;

      let cancelled = false;
      setSdkState("loading");
      setSdkError(null);

      loadFlexScript(environment)
        .then(() => {
          if (cancelled) return;
          const Flex = (window as any).Flex;
          if (!Flex) throw new Error("Flex SDK not found after script load"); // i18n-ignore

          const flex = new Flex(captureContext);
          const microform = flex.microform({
            styles: {
              input: {
                "font-size": "14px",
                "font-family": "inherit",
                color: "#111827",
              },
              "::placeholder": { color: "#9ca3af" },
              ":focus": { color: "#111827" },
              valid: { color: "#111827" },
              invalid: { color: "#dc2626" },
            },
          });

          const numberField = microform.createField("number", {
            placeholder: "•••• •••• •••• ••••",
          });
          const cvvField = microform.createField("securityCode", {
            placeholder: "•••",
          });

          numberField.load(`#${NUMBER_CONTAINER_ID}`);
          cvvField.load(`#${CVV_CONTAINER_ID}`);

          microformRef.current = microform;
          if (!cancelled) setSdkState("ready");
        })
        .catch((e: any) => {
          if (cancelled) return;
          setSdkError(e?.message ?? "Could not load payment form"); // i18n-ignore
          setSdkState("error");
        });

      return () => {
        cancelled = true;
        microformRef.current = null;
      };
    }, [captureContext]);

    // ── Parse expiry MM/YY → { month, year } ─────────────────────────────────
    // Returns null if the format is invalid.
    function parseExpiry(raw: string): { month: string; year: string } | null {
      const stripped = raw.replace(/\s/g, "");
      const parts = stripped.split("/");
      if (parts.length !== 2) return null;
      const mm = parts[0].trim().padStart(2, "0");
      const yy = parts[1].trim();
      if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(yy)) return null;
      const month = parseInt(mm, 10);
      if (month < 1 || month > 12) return null;
      const fullYear = `20${yy}`;
      return { month: mm, year: fullYear };
    }

    // Expose parsed expiry for the parent's createToken call.
    // The parent drives submit; we only validate + expose here.
    (CyberSourceSection as any)._parseExpiry = parseExpiry;

    const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      // Auto-insert slash after two digits.
      if (val.length === 2 && expiry.length === 1 && !val.includes("/")) {
        val = val + " / ";
      }
      if (val.length > 7) return;
      setExpiry(val);
      setExpiryError(null);
    };

    const isReady = sdkState === "ready";
    const isLoading = sdkState === "loading";

    // Show loading skeleton while either:
    //   (a) waiting for the parent to supply captureContext (prefetch in progress), or
    //   (b) the Microform SDK is initialising.
    // Stop showing it if the parent's prefetch already failed (show error instead).
    const showLoading = (!captureContext && !prefetchError) || isLoading;
    // Surface an error from either the prefetch or the SDK initialisation.
    const displayError = !captureContext && prefetchError
      ? (t("checkout.toast.cybersourceUnavailableDesc") as string)
      : sdkState === "error"
        ? (sdkError ?? t("checkout.toast.cybersourceUnavailableDesc") as string)
        : null;

    return (
      <div className={className} data-testid="cybersource-section">
        {showLoading && !displayError && (
          <div className="space-y-3 animate-pulse">
            <div>
              <div className="h-3 w-24 rounded bg-muted mb-1.5" />
              <div className="h-10 rounded-lg border border-input bg-muted/40" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="h-3 w-20 rounded bg-muted mb-1.5" />
                <div className="h-10 rounded-lg border border-input bg-muted/40" />
              </div>
              <div>
                <div className="h-3 w-10 rounded bg-muted mb-1.5" />
                <div className="h-10 rounded-lg border border-input bg-muted/40" />
              </div>
            </div>
          </div>
        )}
        {displayError && (
          <p className="text-sm text-destructive py-2">{displayError}</p>
        )}

        <div style={{ display: isReady ? undefined : "none" }}>
          {/* Card number iframe */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t("checkout.cybersource.cardNumber")}
            </label>
            <div
              className="flex items-center h-10 rounded-lg border border-input bg-background ps-3 pe-3 gap-2 text-sm"
              style={{ pointerEvents: disabled ? "none" : undefined }}
            >
              <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
              <div id={NUMBER_CONTAINER_ID} className="flex-1 h-full" />
            </div>
          </div>

          {/* Expiry + CVV row */}
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
                disabled={disabled}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              <div
                id={CVV_CONTAINER_ID}
                className="h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                style={{ pointerEvents: disabled ? "none" : undefined }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

CyberSourceSection.displayName = "CyberSourceSection";

export { CyberSourceSection };
export type { CyberSourceSectionRef as CyberSourceRef };
// Expiry parser — used only inside this module.
function parseCsExpiry(raw: string): { month: string; year: string } | null {
  const stripped = raw.replace(/\s/g, "");
  const parts = stripped.split("/");
  if (parts.length !== 2) return null;
  const mm = parts[0].trim().padStart(2, "0");
  const yy = parts[1].trim();
  if (!/^\d{2}$/.test(mm) || !/^\d{2}$/.test(yy)) return null;
  const month = parseInt(mm, 10);
  if (month < 1 || month > 12) return null;
  const fullYear = `20${yy}`;
  return { month: mm, year: fullYear };
}

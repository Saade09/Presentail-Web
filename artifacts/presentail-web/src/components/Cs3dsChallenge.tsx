/**
 * Cs3dsChallenge
 *
 * Full-screen overlay that presents a CyberSource 3DS step-up challenge to the
 * shopper inside an <iframe>. The flow:
 *
 *   1. On mount, this component auto-submits a hidden form into the iframe.
 *      The form POSTs JWT=<accessToken> to <stepUpUrl> (the ACS challenge URL
 *      returned by CyberSource when the authorization returns PENDING_AUTHENTICATION).
 *   2. The ACS renders the challenge inside the iframe; the shopper completes it.
 *   3. After the challenge the ACS POSTs back to our /api/payment/cybersource/3ds-return
 *      server endpoint, which renders a tiny HTML page that calls
 *      window.parent.postMessage({ type: 'cs3dsReturn', transactionId }, origin).
 *   4. This component's message listener receives the postMessage and calls
 *      onComplete(transactionId) so Checkout can make the validation authorize call.
 *
 * The parent Checkout component calls /authorize a second time with
 *   threeDSAuthData: { authenticationTransactionId: transactionId }
 * to complete the payment.
 *
 * Security model:
 * - The message listener validates `evt.source === iframe.contentWindow` (i.e. the
 *   message came specifically from our challenge iframe) rather than just checking
 *   `evt.origin`. This is more precise: it accepts postMessages only from the exact
 *   window that was created for this challenge session, regardless of which
 *   configured origin the /3ds-return endpoint was served from. A rogue frame at the
 *   same origin cannot inject a fake transactionId.
 */

import { useEffect, useRef } from "react";

export type Cs3dsChallengeProps = {
  stepUpUrl: string;
  accessToken: string;
  onComplete: (transactionId: string) => void;
  onCancel: () => void;
};

export function Cs3dsChallenge({
  stepUpUrl,
  accessToken,
  onComplete,
  onCancel,
}: Cs3dsChallengeProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const didSubmit = useRef(false);

  // Auto-submit the form into the iframe on first render.
  useEffect(() => {
    if (!didSubmit.current && formRef.current) {
      didSubmit.current = true;
      formRef.current.submit();
    }
  }, []);

  // Listen for the postMessage from /payment/cybersource/3ds-return.
  // Security: validate that the message came from OUR challenge iframe
  // (`evt.source === iframeRef.current?.contentWindow`). This is stricter than
  // an origin check because it binds the listener to this specific window
  // object — a different frame at the same origin (or a different configured
  // origin in CYBERSOURCE_ALLOWED_ORIGINS) cannot inject a fake transactionId.
  useEffect(() => {
    function handleMessage(evt: MessageEvent) {
      // Accept only messages from the specific challenge iframe window.
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || evt.source !== iframeWindow) return;

      if (
        evt.data &&
        typeof evt.data === "object" &&
        (evt.data as Record<string, unknown>).type === "cs3dsReturn"
      ) {
        const tid = (evt.data as Record<string, unknown>).transactionId;
        if (typeof tid === "string" && tid.length > 0) {
          onComplete(tid);
        } else {
          // ACS returned without a transaction ID — treat as failure.
          onCancel();
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onComplete, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div className="bg-background rounded-xl shadow-2xl flex flex-col w-full max-w-md mx-4 overflow-hidden"
           style={{ height: 520 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">{/* // i18n-ignore */}Complete card verification</span>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Cancel 3DS verification" // i18n-ignore
          >
            ✕
          </button>
        </div>

        {/* ACS challenge iframe — must have a name so the auto-submitted form
            targets it. We also hold a ref so the message listener can verify
            that postMessages come specifically from this window. */}
        <iframe
          ref={iframeRef}
          name="cs3ds-challenge-frame"
          title="Card verification" // i18n-ignore
          className="flex-1 border-0 w-full"
          sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        />

        {/* Hidden form — auto-submitted into the iframe above */}
        <form
          ref={formRef}
          method="POST"
          action={stepUpUrl}
          target="cs3ds-challenge-frame"
          style={{ display: "none" }}
        >
          {/* CyberSource expects `JWT` as the field name for the accessToken */}
          <input name="JWT" defaultValue={accessToken} readOnly />
        </form>
      </div>
    </div>
  );
}

export default Cs3dsChallenge;

// CyberSource Payer Authentication (3DS) Challenge Modal.
//
// Renders the issuer step-up URL inside a centred responsive Dialog.
// The step-up URL + accessToken are posted via a dynamically-created form
// into the iframe.  Listens for the Cardinal Cruise postMessage
// { Status: "Y"/"N"/... } signalling challenge completion.
//
// Props:
//   stepUpUrl       - issuer challenge URL
//   accessToken     - JWT to post as "JWT" field
//   onComplete(status) - called with the Status string on success/failure
//   onCancel()      - called when the shopper dismisses the dialog or after
//                     the 5-minute timeout

import { useEffect, useRef } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  stepUpUrl: string;
  accessToken: string;
  onComplete: (status: string) => void;
  onCancel: () => void;
};

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function CyberSourceChallengeModal({ stepUpUrl, accessToken, onComplete, onCancel }: Props) {
  const { t } = useLocale();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    let settled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const settleComplete = (status: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      onCompleteRef.current(status);
    };

    const settleCancel = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      onCancelRef.current();
    };

    const handleMessage = (evt: MessageEvent) => {
      let data: unknown;
      try {
        data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;
      const payload = data as Record<string, unknown>;

      // 1. Completion relay from our own returnUrl page: when the issuer
      //    challenge finishes, the step-up iframe navigates to
      //    /api/payment/cybersource/payer-auth/return (same origin as the
      //    checkout), and that page posts this message. The payload is only
      //    a completion signal — the checkout validates the authentication
      //    server-side using the enrollment's transaction id, never data
      //    from this message.
      if (evt.origin === window.location.origin) {
        if (payload["MessageType"] === "cybersource.stepUpComplete") {
          settleComplete(
            typeof payload["Status"] === "string" ? (payload["Status"] as string) : "COMPLETE", // i18n-ignore
          );
        }
        return;
      }

      // 2. Direct Cardinal Cruise postMessage from the step-up origin (some
      //    issuer flows post { Status } straight from the challenge window).
      try {
        const origin = new URL(stepUpUrl).origin;
        if (evt.origin !== origin) return;
      } catch {
        return;
      }
      if (typeof payload["Status"] === "string" || typeof payload["Status"] === "boolean") {
        settleComplete(String(payload["Status"]));
      }
    };

    window.addEventListener("message", handleMessage);
    // 5-minute timeout — treat as cancellation so the shopper can retry.
    timerId = setTimeout(() => settleCancel(), TIMEOUT_MS);

    // Post the step-up form into the named iframe using a parent-document
    // form with target="cs-3ds-challenge".  This is more reliable than
    // contentDocument.write(), which returns null for sandboxed iframes in
    // many browsers, leaving the dialog blank.
    try {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = stepUpUrl;
      form.target = "cs-3ds-challenge"; // i18n-ignore — must match iframe name
      form.style.display = "none";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "JWT"; // i18n-ignore — CyberSource field name
      input.value = accessToken;
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      // Remove form from parent DOM after submission
      requestAnimationFrame(() => {
        if (document.body.contains(form)) document.body.removeChild(form);
      });
    } catch {
      settleCancel();
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepUpUrl, accessToken]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancelRef.current(); }}>
      <DialogContent
        className="flex flex-col p-0 gap-0 overflow-hidden"
        style={{ maxWidth: "480px", width: "95vw", height: "70vh", maxHeight: "600px" }}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-sm font-medium">
            {t("checkout.cybersource.challengeTitle")}
          </DialogTitle>
        </DialogHeader>
        <iframe
          ref={iframeRef}
          name="cs-3ds-challenge" // i18n-ignore — must match form target below
          title="3ds-challenge" // i18n-ignore
          className="flex-1 w-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation-by-user-activation"
          onError={() => onCancelRef.current()}
        />
      </DialogContent>
    </Dialog>
  );
}

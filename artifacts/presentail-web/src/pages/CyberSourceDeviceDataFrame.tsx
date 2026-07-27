// CyberSource Device Data Collection iframe.
//
// Renders an invisible, zero-dimension iframe that posts the CyberSource
// `accessToken` to `deviceDataCollectionUrl` via a dynamically-created HTML
// form.  Listens for the CyberSource Cardinal Cruise postMessage
// (MessageType: "profile.completed") and calls onComplete(success) when
// collection finishes, or onComplete(false) after a 10-second timeout.
//
// No visible chrome; never blocks checkout permanently on timeout.

import { useEffect, useRef } from "react";

type Props = {
  deviceDataCollectionUrl: string;
  accessToken: string;
  onComplete: (success: boolean) => void;
};

const TIMEOUT_MS = 10_000;

export function CyberSourceDeviceDataFrame({ deviceDataCollectionUrl, accessToken, onComplete }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    let settled = false;
    let timerId: ReturnType<typeof setTimeout>;

    const settle = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      onCompleteRef.current(success);
    };

    const handleMessage = (evt: MessageEvent) => {
      // Accept postMessages from the deviceDataCollectionUrl origin only.
      try {
        const origin = new URL(deviceDataCollectionUrl).origin;
        if (evt.origin !== origin) return;
      } catch {
        return;
      }
      let data: unknown;
      try {
        data = typeof evt.data === "string" ? JSON.parse(evt.data) : evt.data;
      } catch {
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        (data as Record<string, unknown>)["MessageType"] === "profile.completed"
      ) {
        const status = (data as Record<string, unknown>)["Status"];
        settle(status === true);
      }
    };

    window.addEventListener("message", handleMessage);
    timerId = setTimeout(() => settle(false), TIMEOUT_MS);

    // Inject the form and submit it into the iframe.
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      try {
        const doc = iframe.contentDocument;
        doc.open();
        doc.write("<!DOCTYPE html><html><body></body></html>");
        doc.close();
        const form = doc.createElement("form");
        form.method = "POST";
        form.action = deviceDataCollectionUrl;
        const input = doc.createElement("input");
        input.type = "hidden";
        input.name = "JWT";
        input.value = accessToken;
        form.appendChild(input);
        doc.body.appendChild(form);
        form.submit();
      } catch {
        // Cross-origin guard triggered — settle(false) so we never hang.
        settle(false);
      }
    } else {
      // Iframe not ready — settle after timeout.
    }

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceDataCollectionUrl, accessToken]);

  return (
    <iframe
      ref={iframeRef}
      title="cs-device-data" // i18n-ignore
      aria-hidden="true"
      style={{ display: "none", width: 0, height: 0, border: 0, position: "absolute" }}
      sandbox="allow-scripts allow-forms allow-same-origin"
    />
  );
}

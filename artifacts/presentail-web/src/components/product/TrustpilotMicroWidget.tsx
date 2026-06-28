import { useEffect, useRef } from "react";
import { injectTrustpilotScript } from "@/lib/trustpilot";

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 250;

export function TrustpilotMicroWidget() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;

    const tryLoad = () => {
      if (!window.Trustpilot) {
        if (pollAttempts < MAX_POLL_ATTEMPTS) {
          pollAttempts++;
          pollTimer = setTimeout(tryLoad, POLL_INTERVAL_MS);
        }
        return;
      }
      window.Trustpilot.loadFromElement(el, true);
    };

    injectTrustpilotScript(tryLoad);

    return () => {
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-locale="en-US"
      data-template-id="5419b637fa0340045cd0c936"
      data-businessunit-id="5d1782b3588afe00012431d9"
      data-style-height="20px"
      data-style-width="100%"
      data-theme="light"
    >
      <a
        href="https://www.trustpilot.com/review/presentail.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Trustpilot
      </a>{/* // i18n-ignore */}
    </div>
  );
}

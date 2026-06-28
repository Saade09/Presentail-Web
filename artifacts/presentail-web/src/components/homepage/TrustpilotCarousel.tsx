import { useEffect, useRef } from "react";
import { injectTrustpilotScript } from "@/lib/trustpilot";

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

export function TrustpilotCarousel() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 20;
    const POLL_INTERVAL_MS = 250;

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

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            injectTrustpilotScript(tryLoad);
          }
        }
      },
      { rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (pollTimer !== null) clearTimeout(pollTimer);
    };
  }, []);

  return (
    <div style={{ overflow: "hidden", height: "120px" }}>
      <div
        ref={ref}
        className="trustpilot-widget"
        data-locale="en-US"
        data-template-id="53aa8912dec7e10d38f59f36"
        data-businessunit-id="5d1782b3588afe00012431d9"
        data-style-height="140px"
        data-style-width="100%"
        data-token="2e28fd98-db91-4197-8630-5fe45b26dbfb"
        data-stars="4,5"
        data-review-languages="en"
      >
        <a
          href="https://www.trustpilot.com/review/presentail.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Trustpilot
        </a>
      </div>
    </div>
  );
}

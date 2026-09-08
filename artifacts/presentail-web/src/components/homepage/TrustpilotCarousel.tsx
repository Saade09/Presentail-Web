import { useEffect, useRef } from "react";
import { injectTrustpilotScript, pollAndLoadTrustpilotWidget } from "@/lib/trustpilot";

declare global {
  interface Window {
    Trustpilot?: {
      loadFromElement: (element: Element, force?: boolean) => void;
    };
  }
}

export function TrustpilotCarousel({
  onVisible,
  onFailed,
  locale = "en-US",
}: {
  onVisible?: () => void;
  onFailed?: () => void;
  locale?: string;
} = {}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const { onScriptLoad, cleanup } = pollAndLoadTrustpilotWidget(el, onFailed);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.disconnect();
            onVisible?.();
            injectTrustpilotScript(onScriptLoad, onFailed);
          }
        }
      },
      { rootMargin: "200px", threshold: 0 },
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      cleanup();
    };
  // locale is embedded in the DOM attribute and read once by the widget on load;
  // if locale changes we do not re-initialize (would require a full widget remount).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ overflow: "hidden", minHeight: "240px", height: "240px" }}>
      <div
        ref={ref}
        className="trustpilot-widget"
        data-locale={locale}
        data-template-id="54ad5defc6454f065c28af8b"
        data-businessunit-id="5d1782b3588afe00012431d9"
        data-style-height="240px"
        data-style-width="100%"
        data-token="4e76b3f7-36c6-4f7e-917d-d70346cd3a40"
        data-stars="1,2,3,4,5"
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

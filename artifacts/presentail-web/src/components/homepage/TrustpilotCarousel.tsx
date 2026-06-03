import { useEffect, useRef } from "react";

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
    if (ref.current && window.Trustpilot) {
      window.Trustpilot.loadFromElement(ref.current, true);
    }
  }, []);

  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-locale="en-US"
      data-template-id="53aa8912dec7e10d38f59f36"
      data-businessunit-id="5d1782b3588afe00012431d9"
      data-style-height="140px"
      data-style-width="100%"
      data-token="2e28fd98-db91-4197-8630-5fe45b26dbfb"
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
  );
}

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  injectTrustpilotScript,
  pollAndLoadTrustpilotWidget,
  TRUSTPILOT_PROFILE_URL,
} from "@/lib/trustpilot";

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
  const onVisibleRef = useRef(onVisible);
  const onFailedRef = useRef(onFailed);
  const { t } = useLocale();
  const [status, setStatus] = useState<"pending" | "loaded" | "failed">("pending");
  const fallbackLabel = t("campaign.redesign.trustpilot.fallback");
  onVisibleRef.current = onVisible;
  onFailedRef.current = onFailed;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setStatus("pending");
    let active = true;
    const handleFailure = () => {
      if (!active) return;
      setStatus("failed");
      onFailedRef.current?.();
    };

    const { onScriptLoad, cleanup } = pollAndLoadTrustpilotWidget(
      el,
      handleFailure,
      () => {
        if (active) {
          el.parentElement?.setAttribute("data-trustpilot-state", "loaded");
        }
      },
    );

    if (typeof IntersectionObserver === "undefined") {
      injectTrustpilotScript(onScriptLoad, handleFailure);
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              observer.disconnect();
              onVisibleRef.current?.();
              injectTrustpilotScript(onScriptLoad, handleFailure);
            }
          }
        },
        { rootMargin: "200px", threshold: 0 },
      );

      observer.observe(el);

      return () => {
        active = false;
        observer.disconnect();
        cleanup();
      };
    }

    return () => {
      active = false;
      cleanup();
    };
  }, [locale]);

  return (
    <div
      style={{ overflow: "hidden", minHeight: "240px", height: "240px" }}
      data-trustpilot-state={status}
      aria-busy={status === "pending"}
    >
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
          href={TRUSTPILOT_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={
            status === "failed"
              ? "flex min-h-[240px] items-center justify-center px-5 text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              : "flex min-h-[240px] items-center justify-center px-5 text-center text-sm text-primary underline-offset-4 hover:underline"
          }
          data-testid={status === "failed" ? "link-trustpilot-fallback" : undefined}
        >
          {fallbackLabel}
        </a>
      </div>
    </div>
  );
}

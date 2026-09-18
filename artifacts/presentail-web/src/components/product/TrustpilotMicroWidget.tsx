import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import {
  injectTrustpilotScript,
  pollAndLoadTrustpilotWidget,
  TRUSTPILOT_PROFILE_URL,
} from "@/lib/trustpilot";

export function TrustpilotMicroWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLocale();
  const [status, setStatus] = useState<"pending" | "loaded" | "failed">("pending");
  const fallbackLabel = t("campaign.redesign.trustpilot.fallback");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let active = true;
    setStatus("pending");
    const handleFailure = () => {
      if (active) setStatus("failed");
    };
    const { onScriptLoad, cleanup } = pollAndLoadTrustpilotWidget(
      el,
      handleFailure,
      () => {
        if (active) setStatus("loaded");
      },
    );
    injectTrustpilotScript(onScriptLoad, handleFailure);

    return () => {
      active = false;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="trustpilot-widget"
      data-trustpilot-state={status}
      aria-busy={status === "pending"}
      data-locale="en-US"
      data-template-id="5419b637fa0340045cd0c936"
      data-businessunit-id="5d1782b3588afe00012431d9"
      data-style-height="20px"
      data-style-width="100%"
      data-theme="light"
    >
      <a
        href={TRUSTPILOT_PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-5 items-center text-primary underline-offset-4 hover:underline"
        data-testid={status === "failed" ? "link-trustpilot-fallback" : undefined}
      >
        {fallbackLabel}
      </a>{/* // i18n-ignore */}
    </div>
  );
}

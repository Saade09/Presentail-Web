import { AlertTriangle, Info, Loader2, X } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { buildFeeNode } from "@/lib/feeNode";

/**
 * UI state for the district-change revalidation flow. Owned by Checkout.tsx;
 * rendered here (inline notice under the district dropdown) and mirrored by
 * the Order Summary "Delivery selection required" card.
 */
export type DistrictRevalState =
  | { status: "idle" }
  /** Waiting for /api/delivery-locations to resolve the newly picked district. */
  | { status: "pending"; districtName: string; cityId?: string; epoch: number; oldFeeUsd: number }
  /** Availability data failed to load for the newly picked district. */
  | { status: "error"; districtName: string; cityId?: string; epoch: number; oldFeeUsd: number }
  /** The previous selection is not available in the new district — must re-pick. */
  | { status: "invalid"; districtName: string; cityId?: string; reason: "express" | "slot" }
  /** Selection kept, but the delivery fee changed — informational only. */
  | { status: "feeChanged"; districtName: string; cityId?: string; oldFeeUsd: number; newFeeUsd: number };

/** True when the state must block Continue-to-Payment. */
export function isDeliveryGateBlocked(state: DistrictRevalState): boolean {
  return (
    state.status === "invalid" ||
    state.status === "pending" ||
    state.status === "error"
  );
}

interface DistrictChangeNoticeProps {
  state: DistrictRevalState;
  /** Localized display name of the district the notice refers to. */
  districtLabel: string;
  countryCode: string | null;
  onRetry: () => void;
  onDismiss: () => void;
  noticeRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Persistent inline notice rendered between the district dropdown and the
 * address field. The outer live region always mounts so screen readers
 * announce state changes; the visible card appears only when there is
 * something to say. Amber conveys "action needed / heads-up" and is always
 * paired with an icon + heading + body text so state is never color-only.
 */
export function DistrictChangeNotice({
  state,
  districtLabel,
  countryCode,
  onRetry,
  onDismiss,
  noticeRef,
}: DistrictChangeNoticeProps) {
  const { t } = useLocale();

  // Market-appropriate terminology for the invalid-selection body copy.
  const invalidBody = (reason: "express" | "slot"): string => {
    if (countryCode === "AE") {
      return t(
        reason === "express"
          ? "checkout.districtChange.expressUnavailableEmirate"
          : "checkout.districtChange.slotUnavailableEmirate",
      );
    }
    if (countryCode === "LB") {
      return t(
        reason === "express"
          ? "checkout.districtChange.expressUnavailableGovernorate"
          : "checkout.districtChange.slotUnavailableGovernorate",
      );
    }
    return t(
      reason === "express"
        ? "checkout.districtChange.expressUnavailableDistrict"
        : "checkout.districtChange.slotUnavailableDistrict",
    );
  };

  return (
    <div aria-live="polite" role="status">
      {state.status === "invalid" && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          data-testid="district-change-notice"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900" data-testid="text-district-notice-title">
                {t("checkout.districtChange.updatedFor", { district: districtLabel })}
              </p>
              <p className="text-sm text-amber-800 mt-0.5" data-testid="text-district-notice-body">
                {invalidBody(state.reason)}
              </p>
            </div>
          </div>
        </div>
      )}
      {state.status === "feeChanged" && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          data-testid="district-change-notice"
        >
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900" data-testid="text-district-notice-title">
                {t("checkout.districtChange.feeUpdatedTitle", { district: districtLabel })}
              </p>
              <p className="text-sm text-amber-800 mt-0.5" data-testid="text-district-notice-body">
                {buildFeeNode(t("checkout.districtChange.feeUpdatedBody"), {
                  oldFee: state.oldFeeUsd,
                  newFee: state.newFeeUsd,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 -my-1 -mx-1 flex h-8 w-8 items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              aria-label={t("checkout.districtChange.dismiss")}
              data-testid="button-district-notice-dismiss"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
      {state.status === "pending" && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 focus:outline-none"
          data-testid="district-change-notice"
        >
          <div className="flex items-center gap-2.5 text-sm text-amber-900">
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-amber-600" aria-hidden />
            <span data-testid="text-district-notice-body">
              {t("checkout.districtChange.checking", { district: districtLabel })}
            </span>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          data-testid="district-change-notice"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900" data-testid="text-district-notice-body">
                {t("checkout.districtChange.loadFailed", { district: districtLabel })}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
                data-testid="button-district-notice-retry"
              >
                {t("checkout.retry")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { User, Clock } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";

type DeliveryMode = "express" | "schedule";

type Props = {
  recipientFirstName: string;
  recipientLastName: string;
  district: string;
  address: string;
  /**
   * True when the recipient will provide their own address at delivery time
   * (matches the `noAddress` checkout state).
   */
  recipientWillProvideAddress: boolean;
  /**
   * True when the sender and recipient are the same person (self-delivery).
   * Takes lower priority than recipientWillProvideAddress.
   */
  selfRecipient: boolean;
  /**
   * Explicit delivery mode driving distinct timing messages.
   * "express" → immediate express delivery
   * "schedule" → standard (today) or scheduled (future date) — distinguished
   *              by the formatted deliveryRowText value
   */
  deliveryMode: DeliveryMode;
  /**
   * Pre-formatted delivery date/time row produced by formatDeliveryRow().
   * Covers all timing sub-states: express label, today-slot, and future-date.
   */
  deliveryRowText: string | null;
  onEdit: () => void;
};

export function DeliveryRecap({
  recipientFirstName,
  recipientLastName,
  district: _district,
  address: _address,
  recipientWillProvideAddress: _recipientWillProvideAddress,
  selfRecipient: _selfRecipient,
  deliveryMode,
  deliveryRowText,
  onEdit,
}: Props) {
  const { t } = useLocale();

  const recipientName =
    [recipientFirstName, recipientLastName].filter(Boolean).join(" ") || "—";

  // Timing state: deliveryRowText already covers all three sub-states —
  //   express ("Express Delivery"), standard ("Today · HH:MM – HH:MM"),
  //   and scheduled ("Wed 13 · HH:MM – HH:MM") — via formatDeliveryRow().
  // deliveryMode is also available here for icon/colour differentiation
  // if the design calls for it in a future iteration.
  const timingLabel = deliveryRowText ?? null;
  void deliveryMode; // retained as an explicit prop for future rendering branches

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest">
          {t("checkout.recap.title")}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-medium text-primary underline underline-offset-2 hover:opacity-70 transition-opacity"
          data-testid="link-edit-delivery"
        >
          {t("checkout.recap.edit")}
        </button>
      </div>
      <div className="space-y-2.5">
        <div className="flex items-start gap-2.5">
          <User className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{recipientName}</span>
        </div>
        {timingLabel && (
          <div className="flex items-start gap-2.5">
            <Clock className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">{timingLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

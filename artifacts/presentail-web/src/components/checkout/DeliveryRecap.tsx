import { User, MapPin, Clock } from "lucide-react";
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
  district,
  address,
  recipientWillProvideAddress,
  selfRecipient,
  deliveryMode,
  deliveryRowText,
  onEdit,
}: Props) {
  const { t } = useLocale();

  const recipientName =
    [recipientFirstName, recipientLastName].filter(Boolean).join(" ") || "—";

  // Address state: three mutually exclusive branches (priority order)
  //  1. recipientWillProvideAddress — recipient shares their address at door
  //  2. selfRecipient               — sender == recipient (self-delivery)
  //  3. normal address              — district + address entered by sender
  let locationText: string;
  if (recipientWillProvideAddress) {
    locationText = t("checkout.recap.recipientProvidesAddress");
  } else if (selfRecipient) {
    locationText = t("checkout.recap.selfDelivery");
  } else {
    const parts = [district, address].filter(Boolean);
    locationText = parts.join(" · ") || "—";
  }

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
        <div className="flex items-start gap-2.5">
          <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm text-muted-foreground leading-snug line-clamp-2">{locationText}</span>
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

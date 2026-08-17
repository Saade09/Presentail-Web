import { useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  /** Mirrors the "Ask the recipient for the address" toggle — switches the copy. */
  askRecipientForAddress: boolean;
  /** Fired every time the tooltip transitions from closed → open. */
  onOpen?: () => void;
};

/**
 * Compact "why we need the phone number" info tooltip for the checkout
 * Delivery Details step.
 *
 * Built on Radix Popover (not Tooltip) so the same interaction works for
 * click, tap, and keyboard (Enter/Space toggles; Escape, outside click/tap,
 * and focus loss dismiss — all Radix built-ins with modal={false}).
 *
 * Accessibility:
 * - Real <button> trigger with an accessible label; Radix wires
 *   aria-expanded/aria-controls between trigger and content.
 * - Focus stays on the button when opened (no focus trap / layout jump);
 *   the content carries role="status" so screen readers announce the copy
 *   when it appears.
 * - Visible focus ring; ≥44×44px touch target via padding + negative margin
 *   so the visual icon stays small and the layout never shifts.
 */
export function PhoneInfoTooltip({ askRecipientForAddress, onOpen }: Props) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen?.();
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("checkout.phoneInfoButtonLabel")}
          data-testid="button-phone-info"
          className="relative ms-1 inline-flex items-center justify-center rounded-full p-3 -m-3 text-primary hover:opacity-75 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="status"
        side="top"
        align="start"
        collisionPadding={16}
        onOpenAutoFocus={(e) => e.preventDefault()}
        data-testid="tooltip-phone-info"
        className="w-auto max-w-[min(280px,calc(100vw-2rem))] rounded-xl border-0 bg-primary px-3.5 py-2.5 text-xs leading-relaxed text-primary-foreground shadow-lg"
      >
        {askRecipientForAddress
          ? t("checkout.phoneInfoAskOn")
          : t("checkout.phoneInfoAskOff")}
      </PopoverContent>
    </Popover>
  );
}

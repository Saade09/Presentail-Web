import { useEffect } from "react";
import { X } from "lucide-react";
import { LoyaltyTiersExplainer } from "./LoyaltyTiersInfo";

export function LoyaltyInfoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      data-testid="loyalty-info-modal"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative bg-background rounded-3xl border border-border/60 shadow-xl max-w-md w-full p-6 max-h-[85vh] overflow-auto">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h3 className="text-xl font-serif">Presentail Points</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <LoyaltyTiersExplainer />
      </div>
    </div>
  );
}

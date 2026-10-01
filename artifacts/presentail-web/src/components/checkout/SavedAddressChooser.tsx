import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MapPin, Pencil, Plus, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type CheckoutSavedAddress = {
  id: number;
  label: string;
  nickname?: string | null;
  isDefault: boolean;
  countryCode?: string | null;
  district?: string | null;
  addressLine?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  directions?: string | null;
  recipientFirstName?: string | null;
  recipientLastName?: string | null;
  recipientPhone?: string | null;
  recipientPhoneCountryCode?: string | null;
};

type Props = {
  open: boolean;
  addresses: CheckoutSavedAddress[];
  activeAddressId: number | null;
  loading?: boolean;
  error?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (address: CheckoutSavedAddress) => void;
  onEdit: (address: CheckoutSavedAddress) => void;
  onAdd: () => void;
  onRetry: () => void;
  t: (key: string) => string;
};

export function savedAddressLabel(address: CheckoutSavedAddress): string {
  return address.nickname?.trim() ||
    address.label.charAt(0).toUpperCase() + address.label.slice(1);
}

function addressLines(address: CheckoutSavedAddress): string[] {
  return [
    address.addressLine,
    address.building,
    address.floor,
    address.apartment,
  ].filter((line): line is string => Boolean(line?.trim()));
}

function recipientName(address: CheckoutSavedAddress): string {
  return [address.recipientFirstName, address.recipientLastName]
    .filter(Boolean)
    .join(" ");
}

function recipientPhone(address: CheckoutSavedAddress): string {
  return [address.recipientPhoneCountryCode, address.recipientPhone]
    .filter(Boolean)
    .join(" ");
}

function AddressDetails({
  address,
  selected,
  active,
  onSelect,
  onEdit,
  t,
}: {
  address: CheckoutSavedAddress;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  t: (key: string) => string;
}) {
  const lines = addressLines(address);
  const name = recipientName(address);
  const phone = recipientPhone(address);
  const title = savedAddressLabel(address);

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-colors",
        selected ? "border-primary bg-primary/[0.045] shadow-sm" : "border-border/70 bg-card",
      )}
      data-testid={`saved-address-card-${address.id}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-start gap-3 text-start min-h-[44px]"
          role="radio"
          aria-checked={selected}
          data-testid={`saved-address-select-${address.id}`}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
              selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
            )}
            aria-hidden
          >
            {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{title}</span>
              {address.isDefault && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  {t("checkout.defaultLabel")}
                </span>
              )}
              {active && (
                <span className="text-[11px] font-medium text-primary">
                  {t("checkout.savedAddressSelected")}
                </span>
              )}
            </span>
            {address.district && (
              <span className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{address.district}</span>
              </span>
            )}
            {lines.map((line) => (
              <span key={line} className="block truncate text-sm text-muted-foreground">{line}</span>
            ))}
            {name && <span className="mt-1 block text-sm">{name}</span>}
            {phone && <span className="block text-sm text-muted-foreground">{phone}</span>}
            {address.directions && (
              <span className="mt-1 block truncate text-xs italic text-muted-foreground">{address.directions}</span>
            )}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={onEdit}
          aria-label={`${t("checkout.savedAddressEdit")} ${title}`}
          data-testid={`saved-address-edit-${address.id}`}
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function AddressChooserBody({
  addresses,
  activeAddressId,
  pendingId,
  setPendingId,
  loading,
  error,
  onEdit,
  onAdd,
  onRetry,
  onConfirm,
  onDismiss,
  t,
}: Omit<Props, "open" | "onOpenChange"> & {
  pendingId: number | null;
  setPendingId: (id: number) => void;
  onDismiss: () => void;
}) {
  const pendingAddress = useMemo(
    () => addresses.find((address) => address.id === pendingId) ?? null,
    [addresses, pendingId],
  );

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-1">
        {loading ? (
          <div className="space-y-3" data-testid="saved-addresses-loading" aria-label={t("checkout.savedAddressesLoading")}>
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-2xl border border-border/60 p-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-3 h-4 w-48" />
                <Skeleton className="mt-2 h-4 w-36" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center" role="alert" data-testid="saved-addresses-error">
            <p className="text-sm font-medium">{t("checkout.savedAddressesLoadError")}</p>
            <Button type="button" variant="outline" className="mt-4 min-h-[44px] rounded-full" onClick={onRetry} data-testid="saved-addresses-retry">
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t("checkout.retry")}
            </Button>
          </div>
        ) : addresses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center" data-testid="saved-addresses-empty">
            {/* contrast-ok: decorative aria-hidden empty-state icon; the message below conveys the meaning */}
            <MapPin className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t("checkout.savedAddressesEmpty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("checkout.savedAddressesEmptyDesc")}</p>
          </div>
        ) : (
          <div className="space-y-3" role="radiogroup" aria-label={t("checkout.savedAddresses")}>
            {addresses.map((address) => (
              <AddressDetails
                key={address.id}
                address={address}
                selected={address.id === pendingId}
                active={address.id === activeAddressId}
                onSelect={() => setPendingId(address.id)}
                onEdit={() => {
                  onDismiss();
                  window.setTimeout(() => onEdit(address), 0);
                }}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 bg-background pt-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.25rem)" }}>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="min-h-[44px] flex-1 rounded-full" onClick={() => {
            onDismiss();
            window.setTimeout(onAdd, 0);
          }} data-testid="saved-address-add">
            <Plus className="h-4 w-4" aria-hidden />
            {t("checkout.savedAddressAdd")}
          </Button>
          <Button
            type="button"
            className="min-h-[44px] flex-1 rounded-full"
            disabled={!pendingAddress}
            onClick={() => {
              if (!pendingAddress) return;
              onConfirm(pendingAddress);
              onDismiss();
            }}
            data-testid="saved-address-confirm"
          >
            {t("checkout.savedAddressUse")}
          </Button>
        </div>
      </div>
    </>
  );
}

export function SavedAddressChooser({
  open,
  addresses,
  activeAddressId,
  loading = false,
  error = false,
  onOpenChange,
  onConfirm,
  onEdit,
  onAdd,
  onRetry,
  t,
}: Props) {
  const isMobile = useIsMobile();
  const [pendingId, setPendingId] = useState<number | null>(activeAddressId);
  const pushedHistoryRef = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    if (open) setPendingId(activeAddressId ?? addresses[0]?.id ?? null);
  }, [open, activeAddressId, addresses]);

  useEffect(() => {
    if (pendingId != null && !addresses.some((address) => address.id === pendingId)) {
      setPendingId(activeAddressId ?? addresses[0]?.id ?? null);
    }
  }, [addresses, pendingId, activeAddressId]);

  // A chooser is a temporary decision. Give mobile/browser Back a local
  // history entry so it dismisses the sheet instead of navigating away from a
  // checkout whose active address and delivery window have not changed.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const state = { ...(window.history.state ?? {}), savedAddressChooser: true };
    window.history.pushState(state, "", window.location.href);
    pushedHistoryRef.current = true;
    const onPopState = () => {
      pushedHistoryRef.current = false;
      onOpenChangeRef.current(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (pushedHistoryRef.current) {
        pushedHistoryRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pushedHistoryRef.current && typeof window !== "undefined") {
      pushedHistoryRef.current = false;
      window.history.back();
    }
    onOpenChange(nextOpen);
  };

  const bodyProps = {
    addresses,
    activeAddressId,
    pendingId,
    setPendingId,
    loading,
    error,
    onEdit,
    onAdd,
    onRetry,
    onConfirm,
    onDismiss: () => handleOpenChange(false),
    t,
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(88vh,760px)] flex-col rounded-t-3xl p-4 pt-6 [&>button:first-child]:h-11 [&>button:first-child]:w-11"
          data-testid="saved-address-chooser-sheet"
        >
          <SheetHeader className="shrink-0 pe-12 text-start">
            <SheetTitle className="font-serif text-xl">{t("checkout.savedAddresses")}</SheetTitle>
            <SheetDescription>{t("checkout.savedAddressesChoose")}</SheetDescription>
          </SheetHeader>
          <AddressChooserBody {...bodyProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(82vh,680px)] flex-col gap-4 rounded-2xl p-6" data-testid="saved-address-chooser-dialog">
        <DialogHeader className="shrink-0 pe-8 text-start">
          <DialogTitle className="font-serif text-xl">{t("checkout.savedAddresses")}</DialogTitle>
          <DialogDescription>{t("checkout.savedAddressesChoose")}</DialogDescription>
        </DialogHeader>
        <AddressChooserBody {...bodyProps} />
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocation } from "wouter";
import {
  useLocationSelection,
  type DeliveryCity,
  type DeliveryCountry,
} from "@/contexts/LocationContext";
import { useCart } from "@/contexts/CartContext";
import { useLocale } from "@/contexts/LocaleContext";
import { LocationPicker } from "./LocationPicker";
import { FreeDeliveryChangedModal } from "@/components/cart/FreeDeliveryChangedModal";

type Props = {
  children: React.ReactNode;
};

type FdcWarning = {
  cityName: string;
  thresholdUsd: number | null;
  subtotalUsd: number;
};

function resolveThreshold(city: DeliveryCity, country: DeliveryCountry | null): number | null {
  return city.freeDeliveryThresholdUsd ?? country?.freeDeliveryThresholdUsd ?? null;
}

function isFreeDeliveryEnabled(city: DeliveryCity, country: DeliveryCountry | null): boolean {
  return city.freeDeliveryEnabled ?? country?.freeDeliveryEnabled ?? true;
}

export function LocationPickerGate({ children }: Props) {
  const {
    isPickerOpen,
    openPicker,
    closePicker,
    countryCode,
    pickerForceCountryStep,
    // These are the PRE-CHANGE values — setLocation() inside LocationPicker
    // batches its setState calls so they won't commit until after handleComplete
    // returns. Reading city/country here gives us the old location for free.
    city,
    country,
    countries,
  } = useLocationSelection();
  const { subtotal } = useCart();
  const { t, cityName } = useLocale();
  const [, navigate] = useLocation();

  const [fdcWarning, setFdcWarning] = useState<FdcWarning | null>(null);

  const handleComplete = (selection: { countryCode: string; cityId: string }) => {
    // Capture old city/country NOW — React batches setState so these are still
    // the pre-change values while we're inside this synchronous event handler.
    const prevCity = city;
    const prevCountry = country;

    closePicker();

    // Nothing to check if cart is empty or no previous city.
    if (subtotal <= 0 || !prevCity) return;

    // Same city re-selected — nothing changed.
    if (prevCity.id === selection.cityId) return;

    const newCountry = countries.find((c) => c.code === selection.countryCode) ?? null;
    const newCity = newCountry?.cities.find((c) => c.id === selection.cityId) ?? null;

    if (!newCity) return;

    const prevThreshold = resolveThreshold(prevCity, prevCountry);
    const newThreshold = resolveThreshold(newCity, newCountry);

    const prevEnabled = isFreeDeliveryEnabled(prevCity, prevCountry);
    const newEnabled = isFreeDeliveryEnabled(newCity, newCountry);

    const wasEligible =
      prevEnabled &&
      prevThreshold != null &&
      prevThreshold > 0 &&
      subtotal >= prevThreshold;

    const nowEligible =
      newEnabled &&
      newThreshold != null &&
      newThreshold > 0 &&
      subtotal >= newThreshold;

    if (wasEligible && !nowEligible) {
      setFdcWarning({
        cityName: cityName(newCity.id, newCity.name),
        thresholdUsd: newEnabled ? newThreshold : null,
        subtotalUsd: subtotal,
      });
    }
  };

  const handleFdcClose = () => setFdcWarning(null);

  const handleFdcViewCart = () => {
    setFdcWarning(null);
    navigate("/cart");
  };

  return (
    <>
      {children}

      {/* Location picker dialog */}
      <DialogPrimitive.Root
        open={isPickerOpen}
        onOpenChange={(o) => (o ? openPicker() : closePicker())}
      >
        <DialogPrimitive.Portal>
          {/*
           * Mobile: bottom-sheet layout — overlay anchors to the bottom edge
           * so the card always reaches 100dvh regardless of Radix internals.
           * Desktop (sm+): centred card with 90dvh cap.
           */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[80] bg-black/55 flex flex-col pt-[120px]
                       md:pt-0 md:items-center md:justify-center md:p-4
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          >
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="w-full flex-1 min-h-0 bg-gray-50 shadow-xl flex flex-col overflow-hidden
                         rounded-t-2xl
                         md:flex-none md:h-auto md:max-h-[90dvh] md:max-w-[480px] md:rounded-[18px]
                         data-[state=open]:animate-in data-[state=closed]:animate-out
                         data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                         data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            >
              <DialogPrimitive.Title className="sr-only">
                {t("locationPickerGate.dialogTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {t("locationPickerGate.dialogDesc")}
              </DialogPrimitive.Description>

              {/* Header + list — list handles its own scroll */}
              <div className="flex flex-col flex-1 min-h-0 p-6">
                <LocationPicker
                  initialCountryCode={countryCode}
                  forceCountryStep={pickerForceCountryStep}
                  onComplete={handleComplete}
                  onClose={closePicker}
                />
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Overlay>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Free delivery changed popup */}
      {fdcWarning && (
        <FreeDeliveryChangedModal
          open
          cityName={fdcWarning.cityName}
          subtotalUsd={fdcWarning.subtotalUsd}
          newThresholdUsd={fdcWarning.thresholdUsd}
          onClose={handleFdcClose}
          onViewCart={handleFdcViewCart}
        />
      )}
    </>
  );
}

import { useRef, useState } from "react";
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
    city,
    country,
    countries,
  } = useLocationSelection();
  const { subtotal } = useCart();
  const { t, cityName } = useLocale();
  const [, navigate] = useLocation();

  const [fdcWarning, setFdcWarning] = useState<FdcWarning | null>(null);

  // ── City snapshot ────────────────────────────────────────────────────────
  // Capture city/country/subtotal at the exact render where the picker
  // transitions from closed → open. This runs synchronously during render,
  // before any effect or batched state update from setLocation/navigate can
  // propagate — making it immune to wouter's synchronous URL commit.
  const prevPickerOpenRef = useRef(false);
  const citySnapshotRef = useRef<DeliveryCity | null>(null);
  const countrySnapshotRef = useRef<DeliveryCountry | null>(null);
  const subtotalSnapshotRef = useRef<number>(0);

  if (!prevPickerOpenRef.current && isPickerOpen) {
    // Picker just transitioned closed → open: take snapshot now.
    citySnapshotRef.current = city;
    countrySnapshotRef.current = country;
    subtotalSnapshotRef.current = subtotal;
  }
  prevPickerOpenRef.current = isPickerOpen;
  // ────────────────────────────────────────────────────────────────────────

  const handleComplete = (selection: { countryCode: string; cityId: string }) => {
    const prevCity = citySnapshotRef.current;
    const prevCountry = countrySnapshotRef.current;
    const snap = subtotalSnapshotRef.current;

    // eslint-disable-next-line no-console
    console.log("[FDC-DEBUG] handleComplete", {
      selectionCityId: selection.cityId,
      prevCityId: prevCity?.id ?? null,
      snap,
      countriesCount: countries.length,
    });

    closePicker();

    if (snap <= 0 || !prevCity) {
      // eslint-disable-next-line no-console
      console.log("[FDC-DEBUG] early exit: snap<=0 or no prevCity", { snap, prevCity });
      return;
    }

    if (prevCity.id === selection.cityId) {
      // eslint-disable-next-line no-console
      console.log("[FDC-DEBUG] early exit: same city");
      return;
    }

    const newCountry = countries.find((c) => c.code === selection.countryCode) ?? null;
    const newCity = newCountry?.cities.find((c) => c.id === selection.cityId) ?? null;

    // eslint-disable-next-line no-console
    console.log("[FDC-DEBUG] newCity lookup", { newCity: newCity?.id, newCountry: newCountry?.code });

    if (!newCity) return;

    const prevThreshold = resolveThreshold(prevCity, prevCountry);
    const newThreshold = resolveThreshold(newCity, newCountry);
    const prevEnabled = isFreeDeliveryEnabled(prevCity, prevCountry);
    const newEnabled = isFreeDeliveryEnabled(newCity, newCountry);

    const wasEligible = prevEnabled && prevThreshold != null && prevThreshold > 0 && snap >= prevThreshold;
    const nowEligible = newEnabled && newThreshold != null && newThreshold > 0 && snap >= newThreshold;

    // eslint-disable-next-line no-console
    console.log("[FDC-DEBUG] eligibility", { prevEnabled, prevThreshold, newEnabled, newThreshold, snap, wasEligible, nowEligible });

    if (wasEligible && !nowEligible) {
      setFdcWarning({
        cityName: cityName(newCity.id, newCity.name),
        thresholdUsd: newEnabled ? newThreshold : null,
        subtotalUsd: snap,
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

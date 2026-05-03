import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useLocationSelection } from "@/contexts/LocationContext";
import { LocationPicker } from "./LocationPicker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const DESKTOP_BREAKPOINT = 768;

function getIsDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= DESKTOP_BREAKPOINT;
}

type Props = {
  children: React.ReactNode;
};

export function LocationPickerGate({ children }: Props) {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => getIsDesktop());
  const { cityId, isPickerOpen, openPicker, closePicker, countryCode, country, city, isLoadingCountries } =
    useLocationSelection();
  const [, setRoute] = useLocation();

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // First-visit gating: desktop-only.
  // Treat the stored selection as valid only when the country/city still
  // exist in the fetched data; a stale localStorage entry should re-prompt.
  const hasValidSelection = !!cityId && (isLoadingCountries || (!!country && !!city));
  const needsFirstTimePick = isDesktop && !hasValidSelection;

  if (needsFirstTimePick) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30">
        <LocationPicker onComplete={() => setRoute("/")} />
      </div>
    );
  }

  return (
    <>
      {children}
      <Dialog open={isPickerOpen} onOpenChange={(o) => (o ? openPicker() : closePicker())}>
        <DialogContent className="max-w-[600px] p-0 bg-secondary/30 border-0">
          <DialogTitle className="sr-only">Choose delivery location</DialogTitle>
          <DialogDescription className="sr-only">
            Select the country and city you want your gift delivered to.
          </DialogDescription>
          <LocationPicker
            initialCountryCode={countryCode}
            onComplete={closePicker}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

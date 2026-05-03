import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  // Initialize render state synchronously based on initial gating so the
  // overlay paints on the very first frame (no interactive flash behind it).
  const [firstTimeOpen, setFirstTimeOpen] = useState(
    () => getIsDesktop() && !(!!cityId && (isLoadingCountries || (!!country && !!city))),
  );
  const [firstTimeRendered, setFirstTimeRendered] = useState(
    () => getIsDesktop() && !(!!cityId && (isLoadingCountries || (!!country && !!city))),
  );

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

  // Mount the first-time overlay whenever gating is needed; keep it mounted
  // through the close animation after a city is selected. If gating goes
  // away (e.g. desktop→mobile resize), tear it down so mobile is unaffected.
  useEffect(() => {
    if (needsFirstTimePick) {
      setFirstTimeRendered(true);
      setFirstTimeOpen(true);
    } else {
      setFirstTimeOpen(false);
      setFirstTimeRendered(false);
    }
  }, [needsFirstTimePick]);

  const handleFirstTimeComplete = () => {
    setFirstTimeOpen(false);
    setRoute("/");
    // Unmount after the Radix close animation completes (~200ms duration above).
    window.setTimeout(() => setFirstTimeRendered(false), 250);
  };

  return (
    <>
      {children}
      {firstTimeRendered && (
        <DialogPrimitive.Root open={firstTimeOpen} modal>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              onEscapeKeyDown={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              className="fixed left-[50%] top-[50%] z-50 w-full max-w-[600px] translate-x-[-50%] translate-y-[-50%] bg-secondary/30 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
            >
              <DialogPrimitive.Title className="sr-only">Choose delivery location</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Select the country and city you want your gift delivered to.
              </DialogPrimitive.Description>
              <LocationPicker onComplete={handleFirstTimeComplete} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
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

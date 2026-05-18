import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocationSelection } from "@/contexts/LocationContext";
import { LocationPicker } from "./LocationPicker";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  children: React.ReactNode;
};

export function LocationPickerGate({ children }: Props) {
  const {
    isPickerOpen,
    openPicker,
    closePicker,
    countryCode,
    pickerForceCountryStep,
  } = useLocationSelection();
  const { t } = useLocale();

  const handleComplete = () => {
    closePicker();
  };

  return (
    <>
      {children}
      <DialogPrimitive.Root
        open={isPickerOpen}
        onOpenChange={(o) => (o ? openPicker() : closePicker())}
      >
        <DialogPrimitive.Portal>
          {/*
           * The Overlay is the full-screen flex container — this avoids Radix's
           * default transform-based centering (top:50% + translateY(-50%)) which
           * misbehaves inside iframes where vh ≠ visible viewport height.
           */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/55
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          >
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="relative w-full max-w-[480px] bg-card rounded-[18px] shadow-xl
                         flex flex-col overflow-hidden
                         data-[state=open]:animate-in data-[state=closed]:animate-out
                         data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
                         data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              style={{ maxHeight: "min(90vh, 640px)" }}
            >
              <DialogPrimitive.Title className="sr-only">
                {t("locationPickerGate.dialogTitle")}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                {t("locationPickerGate.dialogDesc")}
              </DialogPrimitive.Description>

              {/* Scrollable inner area */}
              <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-6">
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
    </>
  );
}

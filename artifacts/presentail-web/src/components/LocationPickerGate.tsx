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
           * Mobile: bottom-sheet layout — overlay anchors to the bottom edge
           * so the card always reaches 100dvh regardless of Radix internals.
           * Desktop (sm+): centred card with 90dvh cap.
           */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55
                       md:items-center md:p-4
                       data-[state=open]:animate-in data-[state=closed]:animate-out
                       data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          >
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="w-full bg-gray-50 shadow-xl flex flex-col overflow-hidden
                         h-[calc(100dvh-185px)] max-h-none rounded-t-2xl
                         md:h-auto md:max-h-[90dvh] md:max-w-[480px] md:rounded-[18px]
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
    </>
  );
}

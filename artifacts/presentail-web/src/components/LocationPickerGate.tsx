import { useLocationSelection } from "@/contexts/LocationContext";
import { LocationPicker } from "./LocationPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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

  // The picker now drives navigation through `setLocation` in LocationContext,
  // which preserves language and the rest of the path. We just close the
  // dialog when the user finishes selecting.
  const handleComplete = () => {
    closePicker();
  };

  return (
    <>
      {children}
      <Dialog
        open={isPickerOpen}
        onOpenChange={(o) => (o ? openPicker() : closePicker())}
      >
        <DialogContent
          className="w-[calc(100%-32px)] max-w-[480px] p-6 bg-card text-foreground rounded-[18px] border-0 shadow-xl gap-0 [&>button.absolute]:hidden flex flex-col max-h-[min(90dvh,640px)]"
          overlayClassName="bg-black/55"
        >
          <DialogTitle className="sr-only">
            {t("locationPickerGate.dialogTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("locationPickerGate.dialogDesc")}
          </DialogDescription>
          <LocationPicker
            initialCountryCode={countryCode}
            forceCountryStep={pickerForceCountryStep}
            onComplete={handleComplete}
            onClose={closePicker}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

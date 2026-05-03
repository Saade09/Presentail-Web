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
  const { isPickerOpen, openPicker, closePicker, countryCode } =
    useLocationSelection();
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
        <DialogContent className="max-w-[600px] p-0 bg-secondary/30 border-0">
          <DialogTitle className="sr-only">
            {t("locationPickerGate.dialogTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("locationPickerGate.dialogDesc")}
          </DialogDescription>
          <LocationPicker
            initialCountryCode={countryCode}
            onComplete={handleComplete}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useLocation } from "wouter";
import {
  countryCodeToSlug,
  countrySlugToCode,
  useLocationSelection,
} from "@/contexts/LocationContext";
import { LocationPicker } from "./LocationPicker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";

type Props = {
  children: React.ReactNode;
};

export function LocationPickerGate({ children }: Props) {
  const { isPickerOpen, openPicker, closePicker, countryCode } =
    useLocationSelection();
  const { t } = useLocale();
  const [path, navigate] = useLocation();

  const handleComplete = ({ countryCode: nextCode }: { countryCode: string; cityId: string }) => {
    const segments = path.split("/").filter(Boolean);
    const firstSlug = segments[0] ?? "";
    const currentSlugCode = countrySlugToCode(firstSlug);
    if (currentSlugCode && currentSlugCode !== nextCode) {
      const nextSlug = countryCodeToSlug(nextCode);
      const rest = segments.slice(1).join("/");
      const nextPath = rest ? `/${nextSlug}/${rest}` : `/${nextSlug}`;
      navigate(nextPath, { replace: true });
    }
    closePicker();
  };

  return (
    <>
      {children}
      <Dialog open={isPickerOpen} onOpenChange={(o) => (o ? openPicker() : closePicker())}>
        <DialogContent className="max-w-[600px] p-0 bg-secondary/30 border-0">
          <DialogTitle className="sr-only">{t("locationPickerGate.dialogTitle")}</DialogTitle>
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

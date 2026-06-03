import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";
import { useLocation } from "wouter";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { deleteAccount } = useAuth();
  const { t } = useLocale();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    const result = await deleteAccount();
    setBusy(false);
    if (!result.ok) {
      toast({
        title: t("account.deleteAccount.errorTitle"),
        description: result.message,
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
    toast({
      title: t("account.deleteAccount.successTitle"),
      description: t("account.deleteAccount.successDesc"),
    });
    setLocation("/");
  };

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <TriangleAlert className="w-5 h-5 text-destructive" />
            </div>
            <DialogTitle className="text-lg">{t("account.deleteAccount.title")}</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
            {t("account.deleteAccount.desc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {t("pi.cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={busy}
            className="w-full sm:w-auto"
            data-testid="delete-account-confirm"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {t("account.deleteAccount.deleting")}
              </>
            ) : (
              t("account.deleteAccount.confirm")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

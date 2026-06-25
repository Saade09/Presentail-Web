import { useState } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/contexts/LocaleContext";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onComplete: (update?: { firstName: string; lastName: string }) => void;
};

export function CompleteProfileDialog({
  open,
  onOpenChange,
  token,
  onComplete,
}: Props) {
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst && !trimmedLast) {
      onComplete();
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          firstName: trimmedFirst,
          lastName: trimmedLast,
        }),
      });
      if (res.ok) {
        onComplete({ firstName: trimmedFirst, lastName: trimmedLast });
      } else {
        onComplete();
      }
    } catch {
      toast({
        title: t("auth.toast.error"),
        description: t("auth.checkFailed"),
        variant: "destructive",
      });
      onComplete();
    } finally {
      setSaving(false);
      onOpenChange(false);
    }
  };

  const onSkip = () => {
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onSkip(); else onOpenChange(true); }}>
      <DialogContent
        dir={dir}
        className="max-w-md p-0 overflow-hidden"
        data-testid="dialog-complete-profile"
      >
        <div className="px-6 pt-8 pb-2 text-center">
          <h2 className="text-2xl font-serif mb-2">
            {t("auth.completeProfile.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("auth.completeProfile.desc")}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4 pt-4">
          <div className="flex flex-col gap-[5px]">
            <label className="text-sm font-medium block" htmlFor="complete-profile-first-name">
              {t("auth.firstNameLabel")}
            </label>
            <Input
              id="complete-profile-first-name"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("auth.firstNamePlaceholder")}
              data-testid="input-complete-profile-first-name"
              className="h-11"
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-[5px]">
            <label className="text-sm font-medium block" htmlFor="complete-profile-last-name">
              {t("auth.lastNameLabel")}
            </label>
            <Input
              id="complete-profile-last-name"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("auth.lastNamePlaceholder")}
              data-testid="input-complete-profile-last-name"
              className="h-11"
              disabled={saving}
            />
          </div>

          <Button
            size="lg"
            className="w-full h-12 rounded-xl"
            onClick={() => void onSave()}
            disabled={saving || (!firstName.trim() && !lastName.trim())}
            data-testid="button-complete-profile-save"
          >
            {saving ? t("checkout.processing") : t("auth.completeProfile.save")}
          </Button>

          <Button
            variant="ghost"
            size="lg"
            className="w-full h-12 rounded-xl text-muted-foreground"
            onClick={onSkip}
            disabled={saving}
            data-testid="button-complete-profile-skip"
          >
            {t("auth.completeProfile.skip")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

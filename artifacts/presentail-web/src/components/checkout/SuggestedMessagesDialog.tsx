import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import {
  SUGGESTED_MESSAGE_CATEGORIES,
  getSuggestedMessages,
  type SuggestedMessageCategoryId,
  type SuggestedMessageLang,
} from "@workspace/suggested-messages";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (message: string) => void;
  maxLength?: number;
};

const CATEGORY_KEYS: Record<SuggestedMessageCategoryId, string> = {
  general: "suggestedMessages.cat.general",
  love: "suggestedMessages.cat.love",
  birthday: "suggestedMessages.cat.birthday",
  graduation: "suggestedMessages.cat.graduation",
  getWellSoon: "suggestedMessages.cat.getWellSoon",
  newBabyBorn: "suggestedMessages.cat.newBabyBorn",
  thankYou: "suggestedMessages.cat.thankYou",
  sympathy: "suggestedMessages.cat.sympathy",
};

export function SuggestedMessagesDialog({
  open,
  onOpenChange,
  onSelect,
  maxLength,
}: Props) {
  const { t, language } = useLocale();
  const initialLang: SuggestedMessageLang =
    language === "ar" ? "ar" : language === "fr" ? "fr" : "en";

  const [activeLang, setActiveLang] = useState<SuggestedMessageLang>(initialLang);
  const [activeCategory, setActiveCategory] =
    useState<SuggestedMessageCategoryId>("general");

  // Reset to defaults whenever the dialog opens so the popup mirrors the
  // page's current language and never lingers on a previous selection.
  useEffect(() => {
    if (open) {
      setActiveLang(initialLang);
      setActiveCategory("general");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const messages = useMemo(
    () => getSuggestedMessages(activeCategory, activeLang),
    [activeCategory, activeLang],
  );

  const isAr = activeLang === "ar";

  const handlePick = (msg: string) => {
    const trimmed = maxLength && msg.length > maxLength ? msg.slice(0, maxLength) : msg;
    onSelect(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 sm:rounded-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <DialogTitle className="text-center text-2xl font-serif tracking-[0.2em] uppercase">
            {t("suggestedMessages.title")}
          </DialogTitle>
        </div>

        {/* Language toggle */}
        <div className="px-6 pb-3">
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(["en", "ar", "fr"] as const).map((l) => {
              const active = activeLang === l;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setActiveLang(l)}
                  className={cn(
                    "flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`suggested-msg-lang-${l}`}
                >
                  {t(`suggestedMessages.lang.${l}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-6 border-b" dir={isAr ? "rtl" : "ltr"}>
          <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
            {SUGGESTED_MESSAGE_CATEGORIES.map((id) => {
              const active = activeCategory === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveCategory(id)}
                  className={cn(
                    "whitespace-nowrap text-sm pb-2 -mb-px transition-colors border-b-2",
                    active
                      ? "border-primary text-foreground font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`suggested-msg-cat-${id}`}
                >
                  {t(CATEGORY_KEYS[id])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Messages list */}
        <div
          className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto"
          dir={isAr ? "rtl" : "ltr"}
        >
          {messages.map((msg) => (
            <button
              key={msg}
              type="button"
              onClick={() => handlePick(msg)}
              className={cn(
                "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground hover:border-foreground/30 hover:bg-accent/40 transition-colors",
                isAr ? "text-right" : "text-left",
              )}
              data-testid="suggested-msg-card"
            >
              {msg}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

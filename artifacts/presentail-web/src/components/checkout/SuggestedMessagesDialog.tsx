import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLocale } from "@/contexts/LocaleContext";
import {
  SUGGESTED_MESSAGE_CATEGORIES,
  getSuggestedMessages,
  type SuggestedMessageCategoryId,
  type SuggestedMessageLang,
} from "@workspace/suggested-messages";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const initialLang: SuggestedMessageLang =
    language === "ar" ? "ar" : language === "fr" ? "fr" : "en";

  const [activeLang, setActiveLang] = useState<SuggestedMessageLang>(initialLang);
  const [activeCategory, setActiveCategory] =
    useState<SuggestedMessageCategoryId>("general");

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
    trackEvent({ name: "suggested_message_picked", action: activeCategory });
    onSelect(trimmed);
    onOpenChange(false);
  };

  const inner = (
    <>
      {/* Language toggle */}
      <div className="px-5 pb-3">
        <div
          role="group"
          aria-label={t("suggestedMessages.langLabel")}
          className="flex gap-1 rounded-full bg-muted p-1"
        >
          {(["en", "ar", "fr"] as const).map((l) => {
            const active = activeLang === l;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setActiveLang(l)}
                aria-pressed={active}
                className={cn(
                  "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors",
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
      <div className="px-5 border-b" dir={isAr ? "rtl" : "ltr"}>
        <div
          role="tablist"
          aria-label={t("suggestedMessages.catLabel")}
          className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
        >
          {SUGGESTED_MESSAGE_CATEGORIES.map((id) => {
            const active = activeCategory === id;
            return (
              <button
                key={id}
                id={`suggested-msg-cat-btn-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="suggested-msg-panel"
                onClick={() => setActiveCategory(id)}
                className={cn(
                  "whitespace-nowrap text-sm pb-2 -mb-px transition-colors border-b-2 shrink-0",
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
        id="suggested-msg-panel"
        role="tabpanel"
        aria-labelledby={`suggested-msg-cat-btn-${activeCategory}`}
        className="px-5 py-4 space-y-3 max-h-[45vh] sm:max-h-[55vh] overflow-y-auto"
        style={{ scrollbarGutter: "stable both-edges" }}
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
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-2xl max-h-[90svh] flex flex-col overflow-hidden"
        >
          <div className="px-5 pt-5 pb-3 shrink-0">
            <SheetTitle className="text-center text-xl font-serif tracking-[0.2em] uppercase">
              {t("suggestedMessages.title")}
            </SheetTitle>
          </div>
          {inner}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-3xl p-0 rounded-2xl overflow-hidden">
        <div className="px-5 pt-6 pb-3 pr-14">
          <DialogTitle className="text-center text-2xl font-serif tracking-[0.2em] uppercase">
            {t("suggestedMessages.title")}
          </DialogTitle>
        </div>
        {inner}
      </DialogContent>
    </Dialog>
  );
}

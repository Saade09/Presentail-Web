import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import {
  SUGGESTED_MESSAGE_CATEGORIES,
  getSuggestedMessages,
  type SuggestedMessageCategoryId,
  type SuggestedMessageLang,
} from "@workspace/suggested-messages";

import { BottomSheet } from "@/components/BottomSheet";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { trackEvent } from "@/lib/analytics";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (message: string) => void;
  maxLength?: number;
};

export function SuggestedMessagesSheet({
  visible,
  onClose,
  onSelect,
  maxLength,
}: Props) {
  const colors = useColors();
  const t = useT();
  const { lang } = useLanguage();

  const initialLang: SuggestedMessageLang =
    lang === "AR" ? "ar" : lang === "FR" ? "fr" : "en";
  const [activeLang, setActiveLang] = useState<SuggestedMessageLang>(initialLang);
  const [activeCategory, setActiveCategory] =
    useState<SuggestedMessageCategoryId>("general");

  // Reset language to the app default whenever the sheet (re)opens so a
  // shopper switching from Arabic UI doesn't see a stale English tab.
  React.useEffect(() => {
    if (visible) {
      setActiveLang(initialLang);
      setActiveCategory("general");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const messages = useMemo(
    () => getSuggestedMessages(activeCategory, activeLang),
    [activeCategory, activeLang],
  );

  const categoryLabel = (id: SuggestedMessageCategoryId): string => {
    switch (id) {
      case "general":
        return t.suggestedMessagesCategoryGeneral;
      case "love":
        return t.suggestedMessagesCategoryLove;
      case "birthday":
        return t.suggestedMessagesCategoryBirthday;
      case "graduation":
        return t.suggestedMessagesCategoryGraduation;
      case "getWellSoon":
        return t.suggestedMessagesCategoryGetWellSoon;
      case "newBabyBorn":
        return t.suggestedMessagesCategoryNewBabyBorn;
      case "thankYou":
        return t.suggestedMessagesCategoryThankYou;
      case "sympathy":
        return t.suggestedMessagesCategorySympathy;
    }
  };

  const handlePick = (msg: string) => {
    const trimmed = maxLength && msg.length > maxLength ? msg.slice(0, maxLength) : msg;
    // Track which category the shopper picked from so we can prune dull
    // categories and expand popular ones. Category-only by design — we
    // never log the message body to keep the event payload bounded and
    // free of anything that could be mistaken for PII.
    trackEvent({ name: "suggested_message_picked", action: activeCategory });
    onSelect(trimmed);
    onClose();
  };

  const isAr = activeLang === "ar";

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <View style={{ width: 28 }} />
          <AppText
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 18,
              letterSpacing: 2,
              color: colors.primary,
              textAlign: "center",
              flex: 1,
            }}
          >
            {t.suggestedMessagesTitle.toUpperCase()}
          </AppText>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#f3f3f3",
            }}
          >
            <Feather name="x" size={16} color={colors.primary} />
          </Pressable>
        </View>

        {/* Language toggle */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: "#f3f3f3",
            borderRadius: 999,
            padding: 4,
            marginBottom: 14,
          }}
        >
          {(["en", "ar", "fr"] as const).map((l) => {
            const active = activeLang === l;
            return (
              <Pressable
                key={l}
                onPress={() => setActiveLang(l)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  alignItems: "center",
                  backgroundColor: active ? "#fff" : "transparent",
                  shadowColor: active ? "#000" : "transparent",
                  shadowOpacity: active ? 0.06 : 0,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: active ? 1 : 0,
                }}
              >
                <AppText
                  style={{
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                    fontSize: 13,
                    color: active ? colors.primary : colors.mutedForeground,
                  }}
                >
                  {l === "en"
                    ? t.suggestedMessagesLangEnglish
                    : l === "ar"
                      ? t.suggestedMessagesLangArabic
                      : t.suggestedMessagesLangFrench}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 10, gap: 18 }}
        >
          {SUGGESTED_MESSAGE_CATEGORIES.map((id) => {
            const active = activeCategory === id;
            return (
              <Pressable key={id} onPress={() => setActiveCategory(id)} hitSlop={6}>
                <AppText
                  style={{
                    fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular",
                    fontSize: 13,
                    color: active ? colors.primary : colors.mutedForeground,
                    paddingBottom: 6,
                    borderBottomWidth: active ? 2 : 0,
                    borderBottomColor: colors.gold,
                  }}
                >
                  {categoryLabel(id)}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 8 }} />

        <ScrollView
          style={{ maxHeight: 420 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 12, gap: 10 }}
        >
          {messages.map((msg) => (
            <Pressable
              key={msg}
              onPress={() => handlePick(msg)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? "#faf7f2" : "#fff",
              })}
            >
              <AppText
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  lineHeight: 20,
                  color: colors.primary,
                  textAlign: isAr ? "right" : "left",
                  writingDirection: isAr ? "rtl" : "ltr",
                }}
              >
                {msg}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

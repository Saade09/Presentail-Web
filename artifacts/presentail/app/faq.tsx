import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import type { TranslationKey } from "@/lib/translations";

type FAQEntry = { qKey: TranslationKey; aKey: TranslationKey };
type Section = {
  id: string;
  titleKey: TranslationKey;
  icon: React.ComponentProps<typeof Feather>["name"];
  faqs: FAQEntry[];
};

const SECTIONS: Section[] = [
  {
    id: "ordering",
    titleKey: "faqSecOrdering",
    icon: "truck",
    faqs: [
      { qKey: "faq_ord_q1", aKey: "faq_ord_a1" },
      { qKey: "faq_ord_q2", aKey: "faq_ord_a2" },
      { qKey: "faq_ord_q3", aKey: "faq_ord_a3" },
      { qKey: "faq_ord_q4", aKey: "faq_ord_a4" },
      { qKey: "faq_ord_q5", aKey: "faq_ord_a5" },
      { qKey: "faq_ord_q6", aKey: "faq_ord_a6" },
      { qKey: "faq_ord_q7", aKey: "faq_ord_a7" },
    ],
  },
  {
    id: "products",
    titleKey: "faqSecProducts",
    icon: "package",
    faqs: [
      { qKey: "faq_prd_q1", aKey: "faq_prd_a1" },
      { qKey: "faq_prd_q2", aKey: "faq_prd_a2" },
      { qKey: "faq_prd_q3", aKey: "faq_prd_a3" },
    ],
  },
  {
    id: "account",
    titleKey: "faqSecAccount",
    icon: "user",
    faqs: [
      { qKey: "faq_acc_q1", aKey: "faq_acc_a1" },
      { qKey: "faq_acc_q2", aKey: "faq_acc_a2" },
      { qKey: "faq_acc_q3", aKey: "faq_acc_a3" },
    ],
  },
  {
    id: "support",
    titleKey: "faqSecSupport",
    icon: "message-circle",
    faqs: [
      { qKey: "faq_sup_q1", aKey: "faq_sup_a1" },
      { qKey: "faq_sup_q2", aKey: "faq_sup_a2" },
      { qKey: "faq_sup_q3", aKey: "faq_sup_a3" },
    ],
  },
];

function FAQItem({
  q,
  a,
  colors,
  isRTL,
}: {
  q: string;
  a: string;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 16,
          gap: 12,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.primary,
            lineHeight: 20,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {q}
        </Text>
        <Feather
          name={open ? "minus" : "plus"}
          size={18}
          color={colors.gold}
        />
      </Pressable>
      {open ? (
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            color: colors.mutedForeground,
            lineHeight: 21,
            paddingBottom: 16,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {a}
        </Text>
      ) : null}
    </View>
  );
}

export default function FAQScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather
            name={isRTL ? "arrow-right" : "arrow-left"}
            size={22}
            color="#fff"
          />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 22,
              color: "#fff",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.faq}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {t.faqPageSubtitle}
          </Text>
        </View>
        <Feather name="help-circle" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 18,
            gap: 10,
            paddingVertical: 18,
            flexDirection: isRTL ? "row-reverse" : "row",
          }}
        >
          {SECTIONS.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() =>
                  setActiveSection(activeSection === s.id ? null : s.id)
                }
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: isActive ? colors.primary : colors.border,
                  backgroundColor: isActive ? colors.primary : "#fff",
                }}
              >
                <Feather
                  name={s.icon}
                  size={13}
                  color={isActive ? "#fff" : colors.mutedForeground}
                />
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: isActive ? "#fff" : colors.mutedForeground,
                    letterSpacing: 0.3,
                  }}
                >
                  {t[s.titleKey]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 22, gap: 36 }}>
          {SECTIONS.filter(
            (s) => activeSection === null || activeSection === s.id
          ).map((s) => (
            <View key={s.id}>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={s.icon} size={15} color={colors.gold} />
                </View>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_600SemiBold",
                    fontSize: 17,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t[s.titleKey]}
                </Text>
              </View>
              {s.faqs.map((f, i) => (
                <FAQItem
                  key={i}
                  q={t[f.qKey]}
                  a={t[f.aKey]}
                  colors={colors}
                  isRTL={isRTL}
                />
              ))}
            </View>
          ))}
        </View>

        <View
          style={{
            margin: 22,
            marginTop: 40,
            backgroundColor: colors.primary,
            borderRadius: 18,
            padding: 24,
            alignItems: "center",
            gap: 10,
          }}
        >
          <Feather name="message-circle" size={28} color={colors.gold} />
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 18,
              color: "#fff",
              textAlign: "center",
            }}
          >
            {t.faqStillTitle}
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              color: "rgba(255,255,255,0.75)",
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            {t.faqStillBody}
          </Text>
          <Pressable
            onPress={() => router.push("/contact" as any)}
            style={{
              marginTop: 8,
              paddingHorizontal: 28,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: colors.gold,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: "#fff",
                letterSpacing: 0.5,
              }}
            >
              {t.faqContactBtn}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

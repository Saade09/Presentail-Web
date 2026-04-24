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
import { useColors } from "@/hooks/useColors";

type FAQ = { q: string; a: string };
type Section = { id: string; title: string; icon: string; faqs: FAQ[] };

const SECTIONS: Section[] = [
  {
    id: "ordering",
    title: "Ordering & Delivery",
    icon: "truck",
    faqs: [
      {
        q: "Can I change the delivery address after placing an order?",
        a: "Yes, you can contact our customer support team and ask them to update the delivery address.",
      },
      {
        q: "Can I modify or cancel my order?",
        a: "Order cancellations are accepted up to 24 hours before the date of delivery. If you cancel before the designated time, we will refund the full amount to your card.",
      },
      {
        q: "Do you offer same-day delivery? Are there any additional charges?",
        a: "Yes, we offer same-day delivery without any additional charges.",
      },
      {
        q: "How can I track my order?",
        a: "You can track your order at orderstatus.presentail.com",
      },
      {
        q: "What countries do you deliver to?",
        a: "Lebanon, Cyprus, and the United Arab Emirates.",
      },
      {
        q: "What happens if the recipient is not available at the time of delivery?",
        a: "We contact the sender to provide us with another delivery location, or we reschedule the delivery time slot.",
      },
      {
        q: "Can I include a personalized message with my order?",
        a: "Yes, you can include a free personalized card message with your order.",
      },
    ],
  },
  {
    id: "products",
    title: "Product Information",
    icon: "package",
    faqs: [
      {
        q: "Do you offer customization options for flower arrangements?",
        a: "Yes, we offer customization options for flower arrangements.",
      },
      {
        q: "Do you offer gift wrapping or packaging options?",
        a: "We only offer the packaging shown on the website, which reflects our identity and brand.",
      },
      {
        q: "What flower care tips do you provide?",
        a: "• Change water every 2–3 days.\n• Trim stems at an angle for better absorption.\n• Remove foliage below the waterline to prevent bacterial growth.\n• Avoid direct sunlight and drafts to prolong freshness.\n• Keep in a cool environment and check water level regularly.\n• Handle with care to avoid damaging petals or stems.",
      },
    ],
  },
  {
    id: "account",
    title: "Account & Profile",
    icon: "user",
    faqs: [
      {
        q: "Can I update my account information?",
        a: "Sure — you can contact our support team and they will help you update your account.",
      },
      {
        q: "How do I create an account?",
        a: "Visit presentail.com/my-account to create an account and log in with your personal information.",
      },
      {
        q: "What if I forget my password?",
        a: "Click \"Forgot Password\" on the login page and follow the email instructions. If you use two-factor authentication, enter the verification code. If you still need help, contact our support team.",
      },
    ],
  },
  {
    id: "support",
    title: "Contact & Support",
    icon: "message-circle",
    faqs: [
      {
        q: "Do you offer live chat support?",
        a: "Yes. Contact our customer support through the \"Contact Us\" section in the app for assistance.",
      },
      {
        q: "How can I provide feedback?",
        a: "You can leave a review on Google to share your experience with us.",
      },
      {
        q: "What are your business hours?",
        a: "We operate every day from 8 AM to 10 PM Lebanon time.",
      },
    ],
  },
];

function FAQItem({ faq, colors }: { faq: FAQ; colors: any }) {
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
          flexDirection: "row",
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
          }}
        >
          {faq.q}
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
          }}
        >
          {faq.a}
        </Text>
      ) : null}
    </View>
  );
}

export default function FAQScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 18,
          backgroundColor: colors.primary,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
        }}
      >
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "PlayfairDisplay_600SemiBold",
              fontSize: 22,
              color: "#fff",
            }}
          >
            FAQs
          </Text>
          <Text
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: "rgba(255,255,255,0.72)",
              marginTop: 2,
            }}
          >
            Answers to common questions
          </Text>
        </View>
        <Feather name="help-circle" size={22} color="rgba(255,255,255,0.6)" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Section tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 10, paddingVertical: 18 }}
        >
          {SECTIONS.map((s) => {
            const active = activeSection === s.id || activeSection === null;
            return (
              <Pressable
                key={s.id}
                onPress={() =>
                  setActiveSection(activeSection === s.id ? null : s.id)
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor:
                    activeSection === s.id ? colors.primary : colors.border,
                  backgroundColor:
                    activeSection === s.id ? colors.primary : "#fff",
                }}
              >
                <Feather
                  name={s.icon as any}
                  size={13}
                  color={activeSection === s.id ? "#fff" : colors.mutedForeground}
                />
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: activeSection === s.id ? "#fff" : colors.mutedForeground,
                    letterSpacing: 0.3,
                  }}
                >
                  {s.title}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* FAQ Sections */}
        <View style={{ paddingHorizontal: 22, gap: 36 }}>
          {SECTIONS.filter(
            (s) => activeSection === null || activeSection === s.id
          ).map((s) => (
            <View key={s.id}>
              <View
                style={{
                  flexDirection: "row",
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
                  <Feather name={s.icon as any} size={15} color={colors.gold} />
                </View>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_600SemiBold",
                    fontSize: 17,
                    color: colors.primary,
                  }}
                >
                  {s.title}
                </Text>
              </View>
              {s.faqs.map((faq, i) => (
                <FAQItem key={i} faq={faq} colors={colors} />
              ))}
            </View>
          ))}
        </View>

        {/* Bottom CTA */}
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
            Still have questions?
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
            Our team is available every day from 8 AM to 10 PM Lebanon time.
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
              Contact Us
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

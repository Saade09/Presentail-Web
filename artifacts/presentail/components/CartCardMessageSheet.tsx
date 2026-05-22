import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { SuggestedMessagesSheet } from "@/components/SuggestedMessagesSheet";
import { type CartCardMessage } from "@/contexts/CartContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

const BODY_MAX_LENGTH = 400;

type Props = {
  visible: boolean;
  onClose: () => void;
  initial: CartCardMessage | null;
  onSave: (msg: CartCardMessage | null) => void;
};

export function CartCardMessageSheet({ visible, onClose, initial, onSave }: Props) {
  const colors = useColors();
  const t = useT();

  const [to, setTo] = useState(initial?.to ?? "");
  const [from, setFrom] = useState(initial?.from ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [suggestedVisible, setSuggestedVisible] = useState(false);

  // Re-seed fields whenever the sheet (re)opens so edits don't linger
  // after the shopper clears the message and reopens the sheet.
  React.useEffect(() => {
    if (visible) {
      setTo(initial?.to ?? "");
      setFrom(initial?.from ?? "");
      setBody(initial?.body ?? "");
    }
  }, [visible, initial]);

  const handleSave = () => {
    const trimmedTo = to.trim();
    const trimmedFrom = from.trim();
    const trimmedBody = body.trim();
    if (!trimmedTo && !trimmedFrom && !trimmedBody) {
      onSave(null);
    } else {
      onSave({ to: trimmedTo, from: trimmedFrom, body: trimmedBody });
    }
    onClose();
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <View style={{ width: 28 }} />
              <Text
                style={{
                  fontFamily: "PlayfairDisplay_600SemiBold",
                  fontSize: 18,
                  letterSpacing: 2,
                  color: colors.primary,
                  textAlign: "center",
                  flex: 1,
                }}
              >
                {t.cartGiftCardLabel.toUpperCase()}
              </Text>
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

            {/* To field */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  color: colors.mutedForeground,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                {t.toLabel}
              </Text>
              <TextInput
                value={to}
                onChangeText={setTo}
                placeholder={t.toLabel}
                placeholderTextColor={colors.mutedForeground}
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 14,
                  color: colors.primary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#fff",
                }}
              />
            </View>

            {/* From field */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  color: colors.mutedForeground,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                {t.fromLabel}
              </Text>
              <TextInput
                value={from}
                onChangeText={setFrom}
                placeholder={t.fromLabel}
                placeholderTextColor={colors.mutedForeground}
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 14,
                  color: colors.primary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#fff",
                }}
              />
            </View>

            {/* Body field */}
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 11,
                  color: colors.mutedForeground,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                {t.cardMessageTitle}
              </Text>
              <TextInput
                value={body}
                onChangeText={(v) => setBody(v.length > BODY_MAX_LENGTH ? v.slice(0, BODY_MAX_LENGTH) : v)}
                placeholder={t.cardMessageTitle}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                maxLength={BODY_MAX_LENGTH}
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 14,
                  color: colors.primary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  backgroundColor: "#fff",
                  minHeight: 100,
                  textAlignVertical: "top",
                }}
              />
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 11,
                  color: colors.mutedForeground,
                  textAlign: "right",
                  marginTop: 4,
                }}
              >
                {body.length}/{BODY_MAX_LENGTH}
              </Text>
            </View>

            {/* Suggested messages link */}
            <Pressable
              onPress={() => setSuggestedVisible(true)}
              hitSlop={6}
              style={{ marginBottom: 20 }}
            >
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 12,
                  color: colors.gold,
                  textDecorationLine: "underline",
                }}
              >
                {t.notSureWhatToSay}
              </Text>
            </Pressable>

            {/* Save button */}
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingVertical: 16,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
                marginBottom: 8,
              })}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  color: "#fff",
                  fontSize: 13,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                {t.cartGiftCardSave}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </BottomSheet>

      <SuggestedMessagesSheet
        visible={suggestedVisible}
        onClose={() => setSuggestedVisible(false)}
        onSelect={(msg) => setBody((prev) => {
          const combined = prev.trim() ? `${prev.trim()}\n${msg}` : msg;
          return combined.length > BODY_MAX_LENGTH ? combined.slice(0, BODY_MAX_LENGTH) : combined;
        })}
        maxLength={BODY_MAX_LENGTH}
      />
    </>
  );
}

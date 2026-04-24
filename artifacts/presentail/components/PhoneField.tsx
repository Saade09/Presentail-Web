import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";

import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { useColors } from "@/hooks/useColors";

type Props = {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  countryCode: string;
  onChangeCountry: (c: CountryDialCode) => void;
  placeholder?: string;
};

export function PhoneField({
  label,
  required,
  value,
  onChangeText,
  countryCode,
  onChangeCountry,
  placeholder = "3000000",
}: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected =
    COUNTRY_DIAL_CODES.find((c) => c.code === countryCode) ?? COUNTRY_DIAL_CODES[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_DIAL_CODES;
    return COUNTRY_DIAL_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.replace("+", "").includes(q.replace("+", "")) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.primary,
          letterSpacing: 0.4,
        }}
      >
        {label}
        {required ? <Text style={{ color: colors.gold }}> *</Text> : null}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: "#fff",
          overflow: "hidden",
        }}
      >
        <Pressable
          onPress={() => setOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 13,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: "#faf7f1",
          }}
        >
          <Text style={{ fontSize: 16 }}>{selected.flag}</Text>
          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 14,
              color: colors.primary,
            }}
          >
            {selected.dial}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType="phone-pad"
          style={{
            flex: 1,
            paddingHorizontal: 14,
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.primary,
          }}
        />
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
          onPress={() => setOpen(false)}
        />
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "#fff",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "80%",
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#f0ebe3",
            }}
          >
            <Text
              style={{
                fontFamily: "PlayfairDisplay_700Bold",
                fontSize: 17,
                color: colors.primary,
              }}
            >
              Select country
            </Text>
            <Pressable onPress={() => setOpen(false)}>
              <Feather name="x" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Feather name="search" size={14} color={colors.mutedForeground} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search country or code"
                placeholderTextColor={colors.mutedForeground}
                style={{
                  flex: 1,
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.primary,
                }}
              />
            </View>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => {
              const active = item.code === selected.code;
              return (
                <Pressable
                  onPress={() => {
                    onChangeCountry(item);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f7f4ef",
                    backgroundColor: active ? "#f9f6f1" : "#fff",
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium",
                        fontSize: 14,
                        color: colors.primary,
                      }}
                    >
                      {item.name}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 13,
                      color: colors.mutedForeground,
                    }}
                  >
                    {item.dial}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

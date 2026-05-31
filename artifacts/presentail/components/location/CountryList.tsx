import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryCountry } from "@/constants/deliveryLocations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  countries: DeliveryCountry[];
  onSelect: (country: DeliveryCountry) => void;
  selectedId?: string | null;
};

export function CountryList({ countries, onSelect, selectedId }: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const visible = countries.filter((c) => c.isActive);

  return (
    <View>
      {visible.map((country, idx) => {
        const isSelected = country.id === selectedId;
        return (
          <Pressable
            key={country.id}
            onPress={() => onSelect(country)}
            android_ripple={{ color: "rgba(0,0,0,0.05)" }}
            style={({ pressed }) => ({
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderBottomWidth: idx === visible.length - 1 ? 0 : 1,
              borderBottomColor: "rgba(0,0,0,0.05)",
              backgroundColor: pressed ? "rgba(0,0,0,0.03)" : "transparent",
              gap: 14,
            })}
          >
            <AppText style={{ fontSize: 26 }}>{country.flag}</AppText>
            <AppText
              style={{
                flex: 1,
                fontFamily: "Inter_500Medium",
                fontSize: 16,
                color: isSelected ? colors.primary : colors.text,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {country.name}
            </AppText>
            <Feather
              name={isRTL ? "chevron-left" : "chevron-right"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

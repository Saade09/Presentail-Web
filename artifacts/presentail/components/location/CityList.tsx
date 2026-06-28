import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryCity } from "@/constants/deliveryLocations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  cities: DeliveryCity[];
  onSelect: (city: DeliveryCity) => void;
  selectedId?: string | null;
  trailingIcon?: "check" | "chevron";
};

export function CityList({ cities, onSelect, selectedId, trailingIcon = "check" }: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();
  const t = useT();

  return (
    <View>
      {cities.map((city, idx) => {
        const isSelected = city.id === selectedId;
        const inactive = city.isActive === false;
        return (
          <Pressable
            key={city.id}
            onPress={inactive ? undefined : () => onSelect(city)}
            android_ripple={inactive ? undefined : { color: "rgba(0,0,0,0.05)" }}
            style={({ pressed }) => ({
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderBottomWidth: idx === cities.length - 1 ? 0 : 1,
              borderBottomColor: "rgba(0,0,0,0.05)",
              backgroundColor: inactive
                ? "rgba(0,0,0,0.015)"
                : pressed
                  ? "rgba(0,0,0,0.03)"
                  : "transparent",
              gap: 12,
            })}
          >
            <View style={{ flex: 1, flexDirection: "column", gap: 2 }}>
              <AppText
                style={{
                  fontFamily: isSelected && !inactive ? "Inter_600SemiBold" : "Inter_500Medium",
                  fontSize: 16,
                  color: inactive ? "rgba(0,0,0,0.35)" : isSelected ? colors.teal600 : colors.text,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {city.name}
              </AppText>
              {inactive && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "rgba(0,0,0,0.3)",
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.deliveryCityUnavailable}
                </Text>
              )}
            </View>
            {trailingIcon === "chevron" && !inactive ? (
              <Feather
                name={isRTL ? "chevron-left" : "chevron-right"}
                size={18}
                color={colors.mutedForeground}
              />
            ) : trailingIcon === "check" && isSelected && !inactive ? (
              <Feather name="check" size={20} color={colors.teal600} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

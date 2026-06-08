import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { AppText } from "@/components/AppText";

import type { DeliveryCity } from "@/constants/deliveryLocations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";

type Props = {
  cities: DeliveryCity[];
  onSelect: (city: DeliveryCity) => void;
  selectedId?: string | null;
};

export function CityList({ cities, onSelect, selectedId }: Props) {
  const colors = useColors();
  const { isRTL } = useLanguage();

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
              backgroundColor: !inactive && pressed ? "rgba(0,0,0,0.03)" : "transparent",
              opacity: inactive ? 0.4 : 1,
              gap: 12,
            })}
          >
            <AppText
              style={{
                flex: 1,
                fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_500Medium",
                fontSize: 16,
                color: inactive ? colors.mutedForeground : isSelected ? colors.teal600 : colors.text,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {city.name}
            </AppText>
            {isSelected && !inactive ? (
              <Feather name="check" size={20} color={colors.teal600} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

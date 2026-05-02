import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
  const visible = cities.filter((c) => c.isActive);

  return (
    <View>
      {visible.map((city, idx) => {
        const isSelected = city.id === selectedId;
        return (
          <Pressable
            key={city.id}
            onPress={() => onSelect(city)}
            android_ripple={{ color: "rgba(0,0,0,0.05)" }}
            style={({ pressed }) => ({
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderBottomWidth: idx === visible.length - 1 ? 0 : 1,
              borderBottomColor: "rgba(0,0,0,0.05)",
              backgroundColor: pressed ? "rgba(0,0,0,0.03)" : "transparent",
              gap: 12,
            })}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_500Medium",
                fontSize: 16,
                color: isSelected ? colors.teal600 : colors.text,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {city.name}
            </Text>
            {isSelected ? (
              <Feather name="check" size={20} color={colors.teal600} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

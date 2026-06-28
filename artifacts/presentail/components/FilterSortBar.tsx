import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type Props = {
  onPress: () => void;
  activeCount?: number;
  gridView: boolean;
  onToggleGrid: () => void;
};

export function FilterSortBar({ onPress, activeCount = 0, gridView, onToggleGrid }: Props) {
  const colors = useColors();
  const t = useT();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 24,
        paddingVertical: 11,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.border,
        backgroundColor: "#fff",
      }}
    >
      <Pressable
        onPress={onPress}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
      >
        <Feather name="sliders" size={15} color={colors.primary} />
        <AppText
          style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}
        >
          {t.filterAndSort}
        </AppText>
        {activeCount > 0 ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: colors.gold,
              marginLeft: 1,
            }}
          />
        ) : null}
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Pressable
          onPress={() => { if (!gridView) onToggleGrid(); }}
          hitSlop={8}
          accessibilityLabel={t.gridView}
          accessibilityRole="button"
          accessibilityState={{ selected: gridView }}
          style={{
            padding: 6,
            borderRadius: 6,
            backgroundColor: gridView ? colors.primary : "transparent",
          }}
        >
          <Feather name="grid" size={16} color={gridView ? "#fff" : colors.mutedForeground} />
        </Pressable>
        <Pressable
          onPress={() => { if (gridView) onToggleGrid(); }}
          hitSlop={8}
          accessibilityLabel={t.listView}
          accessibilityRole="button"
          accessibilityState={{ selected: !gridView }}
          style={{
            padding: 6,
            borderRadius: 6,
            backgroundColor: !gridView ? colors.primary : "transparent",
          }}
        >
          <Feather name="list" size={16} color={!gridView ? "#fff" : colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

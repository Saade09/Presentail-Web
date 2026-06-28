import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/BottomSheet";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

export type SortKey = "featured" | "bestSeller" | "priceUp" | "priceDown" | "name";

export type FilterPill = {
  id: string;
  label: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  sortOptions: { key: SortKey; label: string }[];
  activeSort: SortKey;
  onSortChange: (key: SortKey) => void;
  filterPills?: FilterPill[];
  activeFilter?: string;
  onFilterChange?: (id: string) => void;
  filterSectionLabel?: string;
};

export function FilterSortSheet({
  visible,
  onClose,
  sortOptions,
  activeSort,
  onSortChange,
  filterPills,
  activeFilter,
  onFilterChange,
  filterSectionLabel,
}: Props) {
  const colors = useColors();
  const t = useT();

  const hasFilters = filterPills && filterPills.length > 0;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
      >
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 16,
            color: colors.primary,
            marginBottom: 20,
            marginTop: 4,
          }}
        >
          {t.filterAndSort}
        </AppText>

        {/* Sort section */}
        <View style={{ marginBottom: 24 }}>
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 10,
              color: colors.gold,
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            {t.catalogSortLabel}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {sortOptions.map((s) => {
              const active = s.key === activeSort;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => onSortChange(s.key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.gold : colors.border,
                    backgroundColor: active ? colors.gold : "#fff",
                  }}
                >
                  <AppText
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 12,
                      color: active ? "#fff" : colors.primary,
                    }}
                  >
                    {s.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Filter section */}
        {hasFilters && (
          <View style={{ marginBottom: 24 }}>
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 10,
                color: colors.gold,
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {filterSectionLabel}
            </AppText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {filterPills!.map((pill) => {
                const active = pill.id === activeFilter;
                return (
                  <Pressable
                    key={pill.id}
                    onPress={() => onFilterChange?.(pill.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : "#fff",
                    }}
                  >
                    <AppText
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: active ? "#fff" : colors.primary,
                      }}
                    >
                      {pill.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Reset + Apply buttons */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4, marginBottom: 8 }}>
          <Pressable
            onPress={() => {
              onSortChange("featured");
              if (onFilterChange) onFilterChange("");
            }}
            style={{
              flex: 1,
              paddingVertical: 13,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
            }}
          >
            <AppText
              style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: colors.primary }}
            >
              {t.filterSortReset}
            </AppText>
          </Pressable>
          <Pressable
            onPress={onClose}
            style={{
              flex: 2,
              paddingVertical: 13,
              borderRadius: 999,
              backgroundColor: colors.primary,
              alignItems: "center",
            }}
          >
            <AppText
              style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#fff" }}
            >
              {t.filterSortApply}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

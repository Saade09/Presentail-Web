import React from "react";
import { Text, View, Pressable } from "react-native";
import { Image } from "expo-image";

import { AppText } from "@/components/AppText";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useColors } from "@/hooks/useColors";

export type BrandTileItem = {
  slug: string;
  name: string;
  imageUrl?: string | null;
};

type Props = {
  item: BrandTileItem;
  onPress: () => void;
};

export function BrandTile({ item, onPress }: Props) {
  const colors = useColors();
  const [imageLoaded, setImageLoaded] = React.useState(false);

  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", gap: 10, width: 88 }}>
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "#F3F3F3",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {item.imageUrl ? (
          <>
            <Image
              source={{ uri: item.imageUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
            {!imageLoaded && <ShimmerPlaceholder />}
          </>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 6 }}>
            <Text
              numberOfLines={3}
              style={{
                fontFamily: "PlayfairDisplay_400Regular",
                fontSize: 11,
                lineHeight: 14,
                color: colors.primary,
                textAlign: "center",
              }}
            >
              {item.name}
            </Text>
          </View>
        )}
      </View>
      <AppText
        numberOfLines={2}
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 11,
          color: colors.primary,
          textAlign: "center",
          lineHeight: 14,
        }}
      >
        {item.name}
      </AppText>
    </Pressable>
  );
}

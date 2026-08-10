import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { getFallbackUri } from "@/utils/imageUrl";

const { width: SCREEN_W } = Dimensions.get("window");

type ImageItem = { uri: string };

type Props = {
  images: ImageItem[];
  height?: number;
};

/**
 * "loading"  — first attempt in progress; shimmer visible.
 * "retrying" — first attempt failed; shimmer still visible; re-fetching with
 *              the fallback URI (raw OS URL if primary was proxied, same URL
 *              otherwise — key change forces a fresh network request).
 * "loaded"   — image displayed; shimmer hidden.
 * "error"    — both attempts failed; grey placeholder shown.
 */
type ImageLoadState = "loading" | "retrying" | "loaded" | "error";

function SingleHero({ source, height }: { source: { uri: string } | null; height: number }) {
  const [state, setState] = useState<ImageLoadState>("loading");

  const fallbackUri = source ? getFallbackUri(source.uri) : null;

  // Derive the source to use for the current attempt.
  const retrySource: { uri: string } | null =
    state === "retrying" && fallbackUri ? { uri: fallbackUri } : source;

  return (
    <View style={{ width: SCREEN_W, height }}>
      {(state === "loading" || state === "retrying") && <ShimmerPlaceholder />}
      {retrySource ? (
        <Image
          // Changing the key on the "retrying" render unmounts the previous
          // Image and mounts a fresh one, forcing a new network request even
          // when the fallback URI equals the original (transient failure).
          key={state === "retrying" ? "retry" : "initial"}
          source={retrySource}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          onLoad={() => setState("loaded")}
          onError={() => {
            if (state === "loading") {
              setState("retrying");
            } else {
              setState("error");
            }
          }}
          accessibilityLabel="" // decorative
        />
      ) : null}
      <LinearGradient
        colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.05)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

export function ProductImageCarousel({ images, height = SCREEN_W }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const validImages: ImageItem[] = Array.isArray(images)
    ? images.filter(
        (img) =>
          img !== null &&
          typeof img === "object" &&
          typeof img.uri === "string" &&
          img.uri.length > 0,
      )
    : [];

  const firstSafe = validImages[0] ? { uri: validImages[0].uri } : null;

  if (validImages.length <= 1) {
    return <SingleHero source={firstSafe} height={height} />;
  }

  return (
    <View style={{ width: SCREEN_W, height }}>
      <FlatList
        data={validImages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <CarouselSlide
            uri={item.uri}
            width={SCREEN_W}
            height={height}
            index={index}
            total={validImages.length}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={useRef(
          ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
            if (viewableItems.length > 0 && viewableItems[0].index != null) {
              setActiveIndex(viewableItems[0].index);
            }
          },
        ).current}
        viewabilityConfig={useRef({ viewAreaCoveragePercentThreshold: 50 }).current}
        getItemLayout={(_, index) => ({
          length: SCREEN_W,
          offset: SCREEN_W * index,
          index,
        })}
        decelerationRate="fast"
      />
      <View style={styles.dotsRow} pointerEvents="none">
        {validImages.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === activeIndex ? "#ffffff" : "rgba(255,255,255,0.45)",
                width: i === activeIndex ? 20 : 7,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function CarouselSlide({
  uri,
  width,
  height,
  index,
  total,
}: {
  uri: string;
  width: number;
  height: number;
  index: number;
  total: number;
}) {
  const [state, setState] = useState<ImageLoadState>("loading");

  const fallbackUri = getFallbackUri(uri);

  // On retry, use the fallback URI (may equal uri for direct CDN URLs — the
  // key change below still forces expo-image to make a fresh network request).
  const retrySource = state === "retrying" ? { uri: fallbackUri } : { uri };

  return (
    <View style={{ width, height }}>
      {(state === "loading" || state === "retrying") && <ShimmerPlaceholder />}
      <Image
        // Key change on "retrying" forces a remount and fresh network request.
        key={state === "retrying" ? "retry" : "initial"}
        source={retrySource}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        onLoad={() => setState("loaded")}
        onError={() => {
          if (state === "loading") {
            setState("retrying");
          } else {
            setState("error");
          }
        }}
        accessibilityLabel={`Photo ${index + 1} of ${total}`} // i18n-ignore
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.05)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    height: 7,
    borderRadius: 999,
  },
});

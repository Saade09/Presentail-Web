import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";

import { Price } from "@/components/Price";
import { ShimmerPlaceholder } from "@/components/ShimmerPlaceholder";
import { useCart } from "@/contexts/CartContext";
import { useWooProducts } from "@/contexts/WooProductsContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { useLanguage } from "@/contexts/LanguageContext";
import { isExpressDeliveryAvailable } from "@workspace/delivery";
import {
  type ResolvedUpsellTab,
  type UpsellTabId,
  resolveUpsellTabs,
} from "@/lib/cartUpsells";
import { trackEvent } from "@/lib/analytics";

function tabLabel(t: ReturnType<typeof useT>, id: UpsellTabId): string {
  switch (id) {
    case "recommended":
      return t.cartUpsellsTabRecommended;
    case "single_balloons":
      return t.cartUpsellsTabSingleBalloons;
    case "balloon_bundles":
      return t.cartUpsellsTabBalloonBundles;
    case "chocolate":
      return t.cartUpsellsTabChocolate;
    case "plants":
      return t.cartUpsellsTabPlants;
    case "bears":
      return t.cartUpsellsTabBears;
    case "candles":
      return t.cartUpsellsTabCandles;
  }
}

export function CartUpsells() {
  const colors = useColors();
  const router = useRouter();
  const t = useT();
  const { isRTL } = useLanguage();
  const { products } = useWooProducts();
  const { add } = useCart();
  const { selectedCountry } = useDeliveryLocation();

  const tabs = React.useMemo<ResolvedUpsellTab[]>(
    () => resolveUpsellTabs(products),
    [products],
  );

  const [activeId, setActiveId] = React.useState<UpsellTabId | null>(null);

  React.useEffect(() => {
    if (tabs.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !tabs.some((tab) => tab.id === activeId)) {
      setActiveId(tabs[0].id);
    }
  }, [tabs, activeId]);

  const expressAvailable = React.useMemo(
    () => isExpressDeliveryAvailable(selectedCountry?.code),
    [selectedCountry?.code],
  );

  // Lightweight in-component toast that mirrors the product detail screen's
  // pattern (ToastAndroid on Android, animated bubble elsewhere). Used to
  // confirm the silent `add()` call on the upsell card's Add button.
  const [toastVisible, setToastVisible] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState("");
  const toastOpacity = React.useRef(new Animated.Value(0)).current;
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const showToast = React.useCallback(
    (message: string) => {
      if (Platform.OS === "android") {
        try {
          ToastAndroid.show(message, ToastAndroid.SHORT);
        } catch {
          // ToastAndroid is core; defensive only.
        }
        return;
      }
      try {
        setToastMessage(message);
        setToastVisible(true);
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }).start();
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }).start(() => setToastVisible(false));
        }, 1600);
      } catch {
        // Best-effort feedback; never crash the cart.
      }
    },
    [toastOpacity],
  );

  const handleAdd = React.useCallback(
    (productId: string, productName: string) => {
      add(productId, 1);
      trackEvent({
        name: "upsell_item_added",
        surface: "upsell_cart",
        action: activeId ?? undefined,
        productId,
      });
      showToast(`${productName} · ${t.cartUpsellsAddedToast}`);
    },
    [add, activeId, showToast, t.cartUpsellsAddedToast],
  );

  if (tabs.length === 0 || !activeId) return null;

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  // eslint-disable-next-line react/display-name
  function UpsellCardImage({ image, isRTLVal, showExpress, expressLabel }: {
    image: typeof active.products[number]["image"];
    isRTLVal: boolean;
    showExpress: boolean;
    expressLabel: string;
  }) {
    const [loaded, setLoaded] = React.useState(false);
    return (
      <View style={{ aspectRatio: 1, backgroundColor: colors.imagePlaceholder, position: "relative" }}>
        {!loaded && <ShimmerPlaceholder />}
        {image ? (
          <Image
            source={image}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            onLoad={() => setLoaded(true)}
          />
        ) : null}
        {showExpress ? (
          <View
            style={{
              position: "absolute",
              top: 8,
              [isRTLVal ? "right" : "left"]: 8,
              backgroundColor: colors.primary,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Feather name="zap" size={9} color="#fff" />
            <Text
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 9,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              {expressLabel}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <Text
        style={{
          fontFamily: "PlayfairDisplay_500Medium",
          fontSize: 20,
          color: colors.primary,
          writingDirection: isRTL ? "rtl" : "ltr",
        }}
      >
        {t.cartUpsellsTitle}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 22,
          paddingVertical: 4,
          flexDirection: isRTL ? "row-reverse" : "row",
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                setActiveId(tab.id);
                trackEvent({
                  name: "upsell_tab_clicked",
                  surface: "upsell_cart",
                  action: tab.id,
                });
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={{ paddingVertical: 6 }}
            >
              <Text
                style={{
                  fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium",
                  fontSize: 13,
                  color: isActive ? colors.primary : colors.mutedForeground,
                  writingDirection: isRTL ? "rtl" : "ltr",
                }}
              >
                {tabLabel(t, tab.id)}
              </Text>
              {isActive ? (
                <View
                  style={{
                    height: 2,
                    marginTop: 6,
                    backgroundColor: colors.primary,
                    borderRadius: 1,
                  }}
                />
              ) : (
                <View style={{ height: 2, marginTop: 6 }} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          flexWrap: "wrap",
          marginHorizontal: -6,
        }}
      >
        {active.products.map((product) => {
          const showExpress = expressAvailable && product.supportsExpress;
          return (
            <View
              key={product.id}
              style={{
                width: "50%",
                paddingHorizontal: 6,
                paddingBottom: 14,
              }}
            >
              <View
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: "hidden",
                }}
              >
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/product/[slug]",
                      params: { slug: product.id },
                    })
                  }
                >
                  <UpsellCardImage
                    image={product.image}
                    isRTLVal={isRTL}
                    showExpress={showExpress}
                    expressLabel={t.cartUpsellsExpress}
                  />
                </Pressable>

                <View style={{ padding: 10, gap: 6 }}>
                  <Price
                    value={Number.isFinite(product.priceValue) ? product.priceValue : 0}
                    native
                    style={{
                      fontFamily: "PlayfairDisplay_500Medium",
                      fontSize: 15,
                      color: colors.primary,
                    }}
                  />
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/product/[slug]",
                        params: { slug: product.id },
                      })
                    }
                  >
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.primary,
                        writingDirection: isRTL ? "rtl" : "ltr",
                        minHeight: 32,
                      }}
                    >
                      {product.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.cartUpsellsAdd}
                    onPress={() => handleAdd(product.id, product.name)}
                    style={({ pressed }) => ({
                      backgroundColor: colors.primary,
                      paddingVertical: 9,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.85 : 1,
                      marginTop: 2,
                    })}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 11,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                      }}
                    >
                      {t.cartUpsellsAdd}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {Platform.OS !== "android" && toastVisible ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -8,
            left: 0,
            right: 0,
            alignItems: "center",
            opacity: toastOpacity,
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(20,20,20,0.92)",
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              maxWidth: "90%",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: "#fff",
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {toastMessage}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { CountryFlag } from "@/components/CountryFlag";

import { BottomSheet } from "@/components/BottomSheet";
import { CityList } from "@/components/location/CityList";
import { CountryList } from "@/components/location/CountryList";
import type { DeliveryCity, DeliveryCountry } from "@/constants/deliveryLocations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Step = "country" | "city";

export function DeliveryLocationSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const { isRTL } = useLanguage();
  const {
    selectedCountry,
    selectedCity,
    deliveryLocations,
    isLoading,
    error,
    selectCountry,
    selectCity,
    refreshDeliveryLocations,
  } = useDeliveryLocation();

  // Show country step first when there's no saved country, otherwise jump
  // straight to city selection so a returning shopper just confirms.
  const [step, setStep] = useState<Step>("city");
  const [draftCountry, setDraftCountry] = useState<DeliveryCountry | null>(null);

  useEffect(() => {
    if (visible) {
      setDraftCountry(selectedCountry);
      setStep(selectedCountry ? "city" : "country");
    }
  }, [visible, selectedCountry]);

  const handleCountryTap = (country: DeliveryCountry) => {
    setDraftCountry(country);
    setStep("city");
  };

  const handleCityTap = (city: DeliveryCity) => {
    if (draftCountry) {
      // Commit the country choice if the user changed it during this flow.
      if (!selectedCountry || draftCountry.id !== selectedCountry.id) {
        selectCountry(draftCountry);
      }
    }
    selectCity(city);
    onClose();
  };

  const handleChangeCountry = () => {
    setStep("country");
  };

  const visibleCountries = deliveryLocations.filter((c) => c.isActive);
  const cityList = draftCountry?.cities.filter((c) => c.isActive) ?? [];

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 6,
          paddingBottom: 8,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 22,
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
            flex: 1,
          }}
        >
          {t.deliverySheetTitle}
        </AppText>
        <Pressable
          hitSlop={12}
          onPress={onClose}
          accessibilityLabel={t.authClose}
          style={{ padding: 4 }}
        >
          <Feather name="x" size={22} color={colors.text} />
        </Pressable>
      </View>

      {step === "city" && draftCountry ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: colors.background,
            marginHorizontal: 16,
            borderRadius: 14,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 10,
              flex: 1,
            }}
          >
            <CountryFlag code={draftCountry.code} width={28} height={19} />
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
              }}
              numberOfLines={1}
            >
              {draftCountry.name}
            </AppText>
          </View>
          <Pressable hitSlop={6} onPress={handleChangeCountry}>
            <AppText
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
                color: colors.teal600,
              }}
            >
              {t.deliveryChangeCountry}
            </AppText>
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: step === "city" ? 14 : 4,
          paddingBottom: 6,
        }}
      >
        <AppText
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: colors.mutedForeground,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {step === "country" ? t.deliverySelectCountry : t.deliverySelectCity}
        </AppText>
      </View>

      <ScrollView
        style={{ maxHeight: 380 }}
        contentContainerStyle={{ paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && deliveryLocations.length === 0 ? (
          <View
            style={{ alignItems: "center", justifyContent: "center", paddingVertical: 36 }}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && deliveryLocations.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 36,
              paddingHorizontal: 24,
              gap: 12,
            }}
          >
            <AppText
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.mutedForeground,
                textAlign: "center",
              }}
            >
              {t.deliveryUnableToLoad}
            </AppText>
            <Pressable
              onPress={() => {
                refreshDeliveryLocations().catch(() => {});
              }}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: colors.primary,
              }}
            >
              <AppText
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                  color: colors.primaryForeground,
                  letterSpacing: 0.5,
                }}
              >
                {t.deliveryRetry}
              </AppText>
            </Pressable>
          </View>
        ) : step === "country" ? (
          visibleCountries.length === 0 ? (
            <EmptyState message={t.deliveryNoneAvailable} />
          ) : (
            <CountryList
              countries={visibleCountries}
              onSelect={handleCountryTap}
              selectedId={draftCountry?.id ?? selectedCountry?.id ?? null}
            />
          )
        ) : cityList.length === 0 ? (
          <EmptyState message={t.deliveryNoneAvailable} />
        ) : (
          <CityList
            cities={cityList}
            onSelect={handleCityTap}
            selectedId={selectedCity?.id ?? null}
          />
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function EmptyState({ message }: { message: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 32,
        paddingHorizontal: 24,
      }}
    >
      <AppText
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 14,
          color: colors.mutedForeground,
          textAlign: "center",
        }}
      >
        {message}
      </AppText>
    </View>
  );
}

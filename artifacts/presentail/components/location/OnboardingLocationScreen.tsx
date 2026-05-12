import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { DeliveryCity, DeliveryCountry } from "@/constants/deliveryLocations";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";

function activeCountries(list: DeliveryCountry[]): DeliveryCountry[] {
  return list.filter((c) => c.isActive);
}

function activeCities(country: DeliveryCountry | null): DeliveryCity[] {
  if (!country) return [];
  return country.cities.filter((c) => c.isActive);
}

export function OnboardingLocationScreen() {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const {
    deliveryLocations,
    isLoading,
    error,
    setManualLocation,
    refreshDeliveryLocations,
  } = useDeliveryLocation();
  const { completeOnboarding } = useOnboarding();
  const { clear: clearCart } = useCart();

  const countries = useMemo(() => activeCountries(deliveryLocations), [deliveryLocations]);

  const [draftCountry, setDraftCountry] = useState<DeliveryCountry | null>(null);
  const [draftCity, setDraftCity] = useState<DeliveryCity | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pre-select the first country + its first city as soon as the list loads.
  useEffect(() => {
    if (draftCountry || countries.length === 0) return;
    const first = countries[0];
    setDraftCountry(first);
    const cities = activeCities(first);
    setDraftCity(cities[0] ?? null);
  }, [countries, draftCountry]);

  const cities = useMemo(() => activeCities(draftCountry), [draftCountry]);

  const handlePickCountry = (country: DeliveryCountry) => {
    if (country.id === draftCountry?.id) return;
    setDraftCountry(country);
    const list = activeCities(country);
    setDraftCity(list[0] ?? null);
  };

  const handlePickCity = (city: DeliveryCity) => {
    setDraftCity(city);
  };

  const canContinue = !!(draftCountry && draftCity) && !submitting;

  const handleContinue = async () => {
    if (!draftCountry || !draftCity || submitting) return;
    setSubmitting(true);
    try {
      // Single atomic write — avoids the back-to-back selectCountry +
      // selectCity race where the second persist would read a stale
      // selectedCountry from closure state and clobber storage with an
      // undefined country on a fresh install.
      await setManualLocation(draftCountry, draftCity);
      // The picker reappears once per day; clear the cart at the same moment
      // so a stale cart from a previous day (potentially with a different
      // delivery country / pricing) doesn't carry over silently.
      clearCart();
      await completeOnboarding();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "bottom", "left", "right"]}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
            <Text
              style={{
                fontFamily: "PlayfairDisplay_500Medium",
                fontSize: 22,
                color: colors.primary,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {t.onboardingSelectCountry}
            </Text>
          </View>

          {isLoading && countries.length === 0 ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 48,
              }}
            >
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : countries.length === 0 ? (
            // Either a transport error (show "unable to load") or an empty
            // active-country set (show "none available"). Both branches
            // offer a retry so the shopper is never stuck on a dead-end
            // blank screen.
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 48,
                paddingHorizontal: 24,
                gap: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.mutedForeground,
                  textAlign: "center",
                }}
              >
                {error ? t.deliveryUnableToLoad : t.deliveryNoneAvailable}
              </Text>
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
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 13,
                    color: colors.primaryForeground,
                    letterSpacing: 0.5,
                  }}
                >
                  {t.deliveryRetry}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  gap: 12,
                  flexDirection: isRTL ? "row-reverse" : "row",
                }}
              >
                {countries.map((country) => {
                  const selected = country.id === draftCountry?.id;
                  return (
                    <Pressable
                      key={country.id}
                      onPress={() => handlePickCountry(country)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        width: 110,
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: selected ? colors.teal600 : colors.border,
                        backgroundColor: colors.card,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 30 }}>{country.flag}</Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 12,
                          color: selected ? colors.primary : colors.text,
                          textAlign: "center",
                        }}
                      >
                        {country.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlayfairDisplay_500Medium",
                    fontSize: 22,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.onboardingSelectCity}
                </Text>
              </View>

              <View style={{ paddingHorizontal: 16 }}>
                {cities.map((city) => {
                  const selected = city.id === draftCity?.id;
                  return (
                    <Pressable
                      key={city.id}
                      onPress={() => handlePickCity(city)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        borderRadius: 12,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.teal600 : colors.border,
                        backgroundColor: colors.card,
                        marginVertical: 4,
                        gap: 12,
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>{draftCountry?.flag ?? ""}</Text>
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: selected ? "Inter_600SemiBold" : "Inter_500Medium",
                          fontSize: 15,
                          color: selected ? colors.primary : colors.text,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {city.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <Pressable
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            style={{
              backgroundColor: canContinue ? colors.primary : colors.muted,
              borderRadius: 999,
              paddingVertical: 14,
              paddingHorizontal: 20,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: isRTL ? "row-reverse" : "row",
              gap: 8,
              opacity: canContinue ? 1 : 0.7,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
                color: canContinue ? colors.primaryForeground : colors.mutedForeground,
                letterSpacing: 0.4,
              }}
            >
              {draftCountry && draftCity
                ? t.onboardingContinueTo
                    .replace("[[flag]]", draftCountry.flag)
                    .replace("[[city]]", draftCity.name)
                : t.onboardingContinue}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

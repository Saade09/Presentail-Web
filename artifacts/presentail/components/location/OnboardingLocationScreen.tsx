import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { CountryFlag } from "@/components/CountryFlag";
import { CityList } from "@/components/location/CityList";

import type { DeliveryCity, DeliveryCountry } from "@/constants/deliveryLocations";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useDeliveryLocation } from "@/hooks/useDeliveryLocation";
import { useT } from "@/hooks/useT";
import { useTypography } from "@/hooks/useTypography";

type Step = "country" | "city";

function activeCountries(list: DeliveryCountry[]): DeliveryCountry[] {
  return list.filter((c) => c.isActive);
}

function defaultCityFor(country: DeliveryCountry | null): DeliveryCity | null {
  if (!country) return null;
  const active = country.cities.filter((c) => c.isActive !== false);
  if (country.preferredDefaultCityId) {
    const preferred = active.find((c) => c.id === country.preferredDefaultCityId);
    if (preferred) return preferred;
  }
  return active[0] ?? null;
}

export function OnboardingLocationScreen() {
  const colors = useColors();
  const typo = useTypography();
  const headingFontMedium = useHeadingFont("500Medium");
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

  const [step, setStep] = useState<Step>("country");
  const [draftCountry, setDraftCountry] = useState<DeliveryCountry | null>(null);
  const [draftCity, setDraftCity] = useState<DeliveryCity | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePickCountry = (country: DeliveryCountry) => {
    setDraftCountry(country);
    setDraftCity(defaultCityFor(country));
    setStep("city");
  };

  const handlePickCity = (city: DeliveryCity) => {
    setDraftCity(city);
  };

  const handleChangeCountry = () => {
    setStep("country");
  };

  const canContinue = !!(draftCountry && draftCity) && !submitting;

  const handleContinue = async () => {
    if (!draftCountry || !draftCity || submitting) return;
    setSubmitting(true);
    try {
      await setManualLocation(draftCountry, draftCity);
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
          {/* ── Country step ── */}
          {step === "country" && (
            <>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
                <AppText
                  style={{
                    fontFamily: headingFontMedium,
                    fontSize: 22,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.onboardingSelectCountry}
                </AppText>
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
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 48,
                    paddingHorizontal: 24,
                    gap: 12,
                  }}
                >
                  <AppText
                    style={{
                      fontFamily: typo.medium,
                      fontSize: 14,
                      color: colors.mutedForeground,
                      textAlign: "center",
                    }}
                  >
                    {error ? t.deliveryUnableToLoad : t.deliveryNoneAvailable}
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
                        fontFamily: typo.semibold,
                        fontSize: 13,
                        color: colors.primaryForeground,
                        letterSpacing: 0.5,
                      }}
                    >
                      {t.deliveryRetry}
                    </AppText>
                  </Pressable>
                </View>
              ) : (
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
                        <CountryFlag code={country.code} width={36} height={24} />
                        <AppText
                          numberOfLines={2}
                          style={{
                            fontFamily: typo.semibold,
                            fontSize: 12,
                            color: selected ? colors.primary : colors.text,
                            textAlign: "center",
                          }}
                        >
                          {country.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}

          {/* ── City step ── */}
          {step === "city" && draftCountry && (
            <>
              {/* Back link */}
              <Pressable
                onPress={handleChangeCountry}
                accessibilityRole="button"
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 4,
                  gap: 4,
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                }}
              >
                <Feather
                  name={isRTL ? "chevron-right" : "chevron-left"}
                  size={16}
                  color={colors.teal600}
                />
                <AppText
                  style={{
                    fontFamily: typo.semibold,
                    fontSize: 13,
                    color: colors.teal600,
                  }}
                >
                  {t.deliveryChangeCountry}
                </AppText>
              </Pressable>

              {/* Country header block */}
              <View
                style={{
                  marginHorizontal: 16,
                  marginTop: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: colors.card,
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <CountryFlag code={draftCountry.code} width={32} height={22} />
                <AppText
                  style={{
                    fontFamily: typo.semibold,
                    fontSize: 16,
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {draftCountry.name}
                </AppText>
              </View>

              {/* "Choose delivery city" subtitle */}
              <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4 }}>
                <AppText
                  style={{
                    fontFamily: typo.medium,
                    fontSize: 12,
                    letterSpacing: 1.8,
                    textTransform: "uppercase",
                    color: colors.mutedForeground,
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {t.deliverySelectCity}
                </AppText>
              </View>

              {/* Thin divider */}
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              />

              {/* City list */}
              <View style={{ paddingHorizontal: 4 }}>
                <CityList
                  cities={draftCountry.cities}
                  onSelect={handlePickCity}
                  selectedId={draftCity?.id ?? null}
                  trailingIcon="chevron"
                />
              </View>
            </>
          )}
        </ScrollView>

        {/* Continue button */}
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
              backgroundColor: canContinue ? colors.primary : colors.background,
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
            <AppText
              style={{
                fontFamily: typo.semibold,
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
            </AppText>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

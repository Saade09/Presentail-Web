import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/hooks/useT";
import { trackEvent } from "@/lib/analytics";
import {
  placeSecondaryLine,
  searchCheckoutPlaces,
  type CheckoutPlace,
} from "@/lib/addressBookPlaces";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_CHARS = 2;
let sessionSawSuggestions = false;

type Props = {
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  selectedPlace: CheckoutPlace | null;
  internalDetail: string;
  onInternalDetailChange: (value: string) => void;
  onSelectPlace: (place: CheckoutPlace, typedQuery: string) => void;
  onClearPlace: () => void;
  districtNotice: { placeName: string; districtName: string } | null;
  addressError: boolean;
  detailError: boolean;
  fieldRef?: React.RefObject<View | null>;
};

function locationLine(place: CheckoutPlace): string {
  return [place.area, place.districtCityName ?? place.districtName]
    .filter((part): part is string => Boolean(part?.trim()))
    .filter((part, index, all) => all.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index)
    .join(", ");
}

export function CheckoutPlaceField({
  value,
  onChange,
  countryCode,
  selectedPlace,
  internalDetail,
  onInternalDetailChange,
  onSelectPlace,
  onClearPlace,
  districtNotice,
  addressError,
  detailError,
  fieldRef,
}: Props) {
  const colors = useColors();
  const t = useT();
  const { isRTL } = useLanguage();
  const [suggestions, setSuggestions] = useState<CheckoutPlace[]>([]);
  const [open, setOpen] = useState(false);
  const sequence = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShownQuery = useRef("");

  useEffect(() => {
    // Invalidate an in-flight request immediately, rather than waiting for the
    // next debounce callback. This prevents old-country/old-query results from
    // reopening the list during the 300 ms delay for the latest input.
    const currentSequence = ++sequence.current;
    if (selectedPlace) return;
    const query = value.trim();
    if (query.length < MIN_QUERY_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (sessionSawSuggestions) {
        trackEvent({ name: "landmark_search_performed", surface: "checkout" });
      }
      void searchCheckoutPlaces(query, countryCode)
        .then((places) => {
          if (currentSequence !== sequence.current) return;
          setSuggestions(places);
          if (places.length > 0) {
            sessionSawSuggestions = true;
            setOpen(true);
            if (lastShownQuery.current !== query) {
              lastShownQuery.current = query;
              trackEvent({ name: "landmark_suggestions_shown", surface: "checkout" });
            }
          } else {
            setOpen(false);
            if (sessionSawSuggestions) {
              trackEvent({ name: "landmark_search_no_results", surface: "checkout" });
            }
          }
        })
        .catch(() => {
          if (currentSequence !== sequence.current) return;
          setSuggestions([]);
          setOpen(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [countryCode, selectedPlace, value]);

  const selectPlace = (place: CheckoutPlace) => {
    const typedQuery = value.trim();
    setOpen(false);
    setSuggestions([]);
    trackEvent({ name: "landmark_suggestion_selected", surface: "checkout" });
    onSelectPlace(place, typedQuery);
  };

  const continueAsTyped = () => {
    setOpen(false);
    trackEvent({ name: "landmark_continued_as_typed", surface: "checkout" });
  };

  if (selectedPlace) {
    const secondary = placeSecondaryLine(selectedPlace);
    const location = locationLine(selectedPlace);
    return (
      <View ref={fieldRef} style={{ gap: 12 }}>
        {districtNotice ? (
          <View
            accessibilityRole="alert"
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "flex-start",
              gap: 8,
              borderWidth: 1,
              borderColor: colors.gold,
              backgroundColor: colors.secondary,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Feather name="check-circle" size={16} color={colors.gold} />
            <AppText style={{ flex: 1, color: colors.primary, fontSize: 12, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
              {t.landmarkDistrictUpdated
                .replace("{place}", districtNotice.placeName)
                .replace("{district}", districtNotice.districtName)}
            </AppText>
          </View>
        ) : null}
        <View
          testID="card-selected-place"
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.muted,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          <View style={{ flex: 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 9 }}>
            <Feather name="map-pin" size={17} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
                <AppText style={{ flexShrink: 1, fontFamily: "Inter_600SemiBold", color: colors.primary, fontSize: 14 }}>
                  {selectedPlace.name}
                </AppText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 20, backgroundColor: colors.secondary, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Feather name="check-circle" size={12} color={colors.gold} />
                  <AppText style={{ color: colors.primary, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>
                    {t.landmarkVerified}
                  </AppText>
                </View>
              </View>
              {secondary ? <AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>{secondary}</AppText> : null}
              {location ? <AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>{location}</AppText> : null}
            </View>
          </View>
          <Pressable onPress={onClearPlace} hitSlop={8} testID="button-change-place">
            <AppText style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" }}>
              {t.landmarkChange}
            </AppText>
          </Pressable>
        </View>
        <View style={{ gap: 4 }}>
          <AppText style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: isRTL ? "right" : "left" }}>
            {selectedPlace.followUpQuestion ?? t.landmarkWhereInside.replace("{place}", selectedPlace.name)}
            <AppText style={{ color: colors.destructive ?? colors.primary }}> *</AppText>
          </AppText>
          <TextInput
            value={internalDetail}
            onChangeText={onInternalDetailChange}
            placeholder={selectedPlace.followUpPlaceholder ?? t.landmarkDetailPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            accessibilityLabel={t.landmarkWhereInside.replace("{place}", selectedPlace.name)}
            testID="input-place-internal-detail"
            multiline
            style={{
              minHeight: 52,
              borderWidth: detailError ? 1.5 : 1,
              borderColor: detailError ? (colors.destructive ?? colors.primary) : colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: colors.primary,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              textAlign: isRTL ? "right" : "left",
              textAlignVertical: "top",
            }}
          />
          {detailError ? <AppText style={{ color: colors.destructive ?? colors.primary, fontSize: 11 }}>{t.checkoutMfPlaceDetail}</AppText> : null}
        </View>
      </View>
    );
  }

  return (
    <View ref={fieldRef} style={{ position: "relative", zIndex: 10 }}>
      <View
        style={{
          borderWidth: addressError ? 1.5 : 1,
          borderColor: addressError ? (colors.destructive ?? colors.primary) : colors.border,
          backgroundColor: colors.card,
          borderRadius: 10,
          paddingHorizontal: 12,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={t.addressFormAddressLinePlaceholder}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={t.addressFormAddressLine}
          testID="input-recipient-address"
          multiline
          returnKeyType="default"
          style={{
            minHeight: 88,
            paddingVertical: 12,
            color: colors.primary,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            textAlign: isRTL ? "right" : "left",
            textAlignVertical: "top",
          }}
        />
      </View>
      <AppText style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>
        {t.addressFormAddressLineHint}
      </AppText>
      {open && suggestions.length > 0 ? (
        <View
          testID="dropdown-place-suggestions"
          style={{
            position: "absolute",
            top: 96,
            left: 0,
            right: 0,
            zIndex: 20,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.card,
            shadowColor: colors.primary,
            shadowOpacity: 0.14,
            shadowRadius: 10,
            elevation: 8,
          }}
        >
          <AppText style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 5, textTransform: "uppercase" }}>
            {t.landmarkSuggestedPlaces}
          </AppText>
          {suggestions.map((place) => {
            const secondary = placeSecondaryLine(place);
            const location = locationLine(place);
            return (
              <Pressable
                key={place.id}
                onPress={() => selectPlace(place)}
                testID={`option-place-${place.id}`}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, minHeight: 58, paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border }}
              >
                <View style={{ flex: 1, gap: 1 }}>
                  <AppText style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }} numberOfLines={1}>{place.name}</AppText>
                  {secondary ? <AppText style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{secondary}</AppText> : null}
                  {location ? <AppText style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>{location}</AppText> : null}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 20, backgroundColor: colors.secondary, paddingHorizontal: 6, paddingVertical: 3 }}>
                  <Feather name="check-circle" size={11} color={colors.gold} />
                  <AppText style={{ color: colors.primary, fontSize: 9, fontFamily: "Inter_600SemiBold" }}>{t.landmarkVerified}</AppText>
                </View>
              </Pressable>
            );
          })}
          <Pressable
            onPress={continueAsTyped}
            testID="option-continue-as-typed"
            style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: colors.border }}
          >
            <AppText style={{ flex: 1, color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>
              {t.landmarkContinueAsTyped.replace("{query}", value.trim())}
            </AppText>
            <Feather name={isRTL ? "arrow-left" : "arrow-right"} size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
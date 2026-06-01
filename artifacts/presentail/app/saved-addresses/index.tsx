import { Feather } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  type CustomerAddress,
  getListMyAddressesQueryKey,
  useDeleteMyAddress,
  useListMyAddresses,
  useSetMyDefaultAddress,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useLanguage } from "@/contexts/LanguageContext";
import { useT } from "@/hooks/useT";
import { COUNTRY_DIAL_CODES } from "@/data/countryCodes";

function flagFor(countryCode: string): string {
  return COUNTRY_DIAL_CODES.find((c) => c.code === countryCode)?.flag ?? "🌍";
}

function countryName(code: string): string {
  return COUNTRY_DIAL_CODES.find((c) => c.code === code)?.name ?? code;
}

function labelText(label: string, t: ReturnType<typeof useT>): string {
  if (label === "work") return t.addressLabelWork;
  if (label === "other") return t.addressLabelOther;
  return t.addressLabelHome;
}

export default function SavedAddressesScreen() {
  const t = useT();
  const { user } = useAuth();
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const enabled = !!user;
  const { data, isLoading, isError, error, refetch } = useListMyAddresses({
    query: {
      queryKey: getListMyAddressesQueryKey(),
      enabled,
      retry: 1,
      staleTime: 30_000,
    },
  });
  const setDefault = useSetMyDefaultAddress();
  const remove = useDeleteMyAddress();

  const errStatus = (error as { status?: number } | null)?.status;
  const treatErrorAsEmpty = isError && errStatus === 404;

  const addresses = data?.addresses ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListMyAddressesQueryKey() });
  };

  const onDelete = (addr: CustomerAddress) => {
    Alert.alert(
      t.savedAddressesDeleteConfirmTitle,
      t.savedAddressesDeleteConfirmBody,
      [
        { text: t.accountCancel, style: "cancel" },
        {
          text: t.savedAddressesDelete,
          style: "destructive",
          onPress: () => {
            remove.mutate(
              { id: addr.id },
              {
                onSuccess: invalidate,
                onError: () => {
                  Alert.alert(t.savedAddressesError, t.savedAddressesErrorBody);
                },
              },
            );
          },
        },
      ],
    );
  };

  const onSetDefault = (addr: CustomerAddress) => {
    if (addr.isDefault) return;
    setDefault.mutate(
      { id: addr.id },
      {
        onSuccess: invalidate,
        onError: () => {
          Alert.alert(t.savedAddressesError, t.savedAddressesErrorBody);
        },
      },
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Header title={t.savedAddressesTitle} colors={colors} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="lock" size={28} color={colors.mutedForeground} />
          <AppText
            style={{
              marginTop: 12,
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
              fontSize: 14,
            }}
          >
            {t.savedAddressesSignInRequired}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={t.savedAddressesTitle} colors={colors} />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : isError && !treatErrorAsEmpty ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <AppText
            style={{
              color: colors.mutedForeground,
              textAlign: "center",
              fontFamily: "Inter_400Regular",
            }}
          >
            {t.savedAddressesError}
          </AppText>
          <Pressable
            onPress={() => refetch()}
            style={{ alignSelf: "center", marginTop: 12, padding: 12 }}
          >
            <AppText
              style={{
                color: colors.gold,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {t.savedAddressesRetry}
            </AppText>
          </Pressable>
        </ScrollView>
      ) : addresses.length === 0 ? (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: `${colors.primary}12`,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Feather name="map-pin" size={28} color={colors.primary} />
          </View>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 20,
              color: colors.primary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            {t.savedAddressesEmptyTitle}
          </AppText>
          <AppText
            style={{
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 21,
              marginBottom: 24,
            }}
          >
            {t.savedAddressesEmptyBody}
          </AppText>
          <Pressable
            onPress={() => router.push("/saved-addresses/new" as never)}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              borderRadius: 999,
              paddingVertical: 14,
              paddingHorizontal: 28,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="plus" size={16} color="#fff" />
            <AppText
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                letterSpacing: 0.5,
              }}
            >
              {t.savedAddressesAdd}
            </AppText>
          </Pressable>
        </ScrollView>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 12 }}
          renderItem={({ item }) => (
            <AddressCard
              address={item}
              onEdit={() => router.push(`/saved-addresses/${item.id}` as never)}
              onDelete={() => onDelete(item)}
              onSetDefault={() => onSetDefault(item)}
              t={t}
              colors={colors}
              isRTL={isRTL}
            />
          )}
        />
      )}

      {addresses.length > 0 && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
          <Pressable
            onPress={() => router.push("/saved-addresses/new" as never)}
            style={({ pressed }) => ({
              backgroundColor: pressed ? `${colors.primary}dd` : colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            })}
          >
            <Feather name="plus" size={18} color="#fff" />
            <AppText
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 15,
              }}
            >
              {t.savedAddressesAdd}
            </AppText>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Header({
  title,
  colors,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
}) {
  const headingFontSemiBold = useHeadingFont("600SemiBold");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        style={{ padding: 8 }}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={22} color={colors.primary} />
      </Pressable>
      <AppText
        style={{
          flex: 1,
          fontFamily: headingFontSemiBold,
          fontSize: 18,
          color: colors.primary,
          textAlign: "center",
          marginRight: 38,
        }}
      >
        {title}
      </AppText>
    </View>
  );
}

const labelChipColors: Record<string, { bg: string; text: string }> = {
  home: { bg: "#e0f2fe", text: "#0369a1" },
  work: { bg: "#f0fdf4", text: "#166534" },
  other: { bg: "#faf5ff", text: "#7e22ce" },
};

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  t,
  colors,
  isRTL,
}: {
  address: CustomerAddress;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  t: ReturnType<typeof useT>;
  colors: ReturnType<typeof useColors>;
  isRTL: boolean;
}) {
  const chipColors = labelChipColors[address.label] ?? { bg: "#f1f5f9", text: "#475569" };
  const primaryLine = [address.district, countryName(address.countryCode)]
    .filter(Boolean)
    .join(", ");
  const secondaryLine = [address.addressLine, address.building, address.apartment]
    .filter(Boolean)
    .join(" · ");
  const recipientName = [address.recipientFirstName, address.recipientLastName]
    .filter(Boolean)
    .join(" ");
  const recipientPhone = [address.recipientPhoneCountryCode, address.recipientPhone]
    .filter(Boolean)
    .join(" ");

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: address.isDefault ? colors.gold : colors.border,
        padding: 18,
        gap: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
      }}
    >
      {/* Header row */}
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {/* Label chip */}
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: chipColors.bg,
          }}
        >
          <AppText
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 11,
              letterSpacing: 0.5,
              color: chipColors.text,
            }}
          >
            {labelText(address.label, t).toUpperCase()}
          </AppText>
        </View>

        {address.nickname ? (
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              color: colors.mutedForeground,
            }}
          >
            · {address.nickname}
          </AppText>
        ) : null}

        {address.isDefault ? (
          <View
            style={{
              marginLeft: isRTL ? 0 : "auto",
              marginRight: isRTL ? "auto" : 0,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: `${colors.gold}22`,
            }}
          >
            <AppText
              style={{
                color: colors.gold,
                fontFamily: "Inter_600SemiBold",
                fontSize: 10,
                letterSpacing: 0.8,
              }}
            >
              {t.savedAddressesDefaultBadge.toUpperCase()}
            </AppText>
          </View>
        ) : null}
      </View>

      {/* Address lines */}
      {primaryLine ? (
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AppText style={{ fontSize: 16 }}>{flagFor(address.countryCode)}</AppText>
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 14,
              color: colors.primary,
              flex: 1,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {primaryLine}
          </AppText>
        </View>
      ) : null}

      {secondaryLine ? (
        <AppText
          style={{
            color: colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 13,
            lineHeight: 18,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {secondaryLine}
        </AppText>
      ) : null}

      {recipientName ? (
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Feather name="user" size={12} color={colors.mutedForeground} />
          <AppText
            style={{
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              flex: 1,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {recipientName}
          </AppText>
        </View>
      ) : null}

      {recipientPhone ? (
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Feather name="phone" size={12} color={colors.mutedForeground} />
          <AppText
            style={{
              color: colors.mutedForeground,
              fontFamily: "Inter_400Regular",
              fontSize: 13,
              flex: 1,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {recipientPhone}
          </AppText>
        </View>
      ) : null}

      {address.directions ? (
        <AppText
          style={{
            color: colors.mutedForeground,
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            fontStyle: "italic",
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {address.directions}
        </AppText>
      ) : null}

      {/* Action row */}
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          gap: 16,
          marginTop: 4,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={onEdit}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="edit-2" size={14} color={colors.primary} />
          <AppText
            style={{
              color: colors.primary,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
            }}
          >
            {t.savedAddressesEdit}
          </AppText>
        </Pressable>

        {!address.isDefault ? (
          <Pressable
            onPress={onSetDefault}
            hitSlop={6}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="star" size={14} color={colors.gold} />
            <AppText
              style={{
                color: colors.gold,
                fontFamily: "Inter_500Medium",
                fontSize: 13,
              }}
            >
              {t.savedAddressesSetDefault}
            </AppText>
          </Pressable>
        ) : null}

        <Pressable
          onPress={onDelete}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            marginLeft: "auto",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} />
          <AppText
            style={{
              color: colors.destructive,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
            }}
          >
            {t.savedAddressesDelete}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

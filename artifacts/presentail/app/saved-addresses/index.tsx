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
import { useT } from "@/hooks/useT";
import { COUNTRY_DIAL_CODES } from "@/data/countryCodes";

const colors = {
  primary: "#1a1a1a",
  border: "#e5dfd4",
  mutedForeground: "#7a7264",
  gold: "#b08948",
  background: "#faf7f2",
};

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

  // Treat "Customer profile not found" (404, returned for shoppers who just
  // signed up and have no local row yet) as an empty list rather than a hard
  // error — there can be no saved addresses without a customer profile.
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
        <Header title={t.savedAddressesTitle} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
            {t.savedAddressesSignInRequired}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={t.savedAddressesTitle} />
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : isError && !treatErrorAsEmpty ? (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>
            {t.savedAddressesError}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={{ alignSelf: "center", marginTop: 12, padding: 12 }}
          >
            <Text style={{ color: colors.gold, fontFamily: "Inter_600SemiBold" }}>
              {t.savedAddressesRetry}
            </Text>
          </Pressable>
        </ScrollView>
      ) : addresses.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Feather name="map-pin" size={32} color={colors.mutedForeground} />
          <Text style={{ marginTop: 14, color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 16 }}>
            {t.savedAddressesEmptyTitle}
          </Text>
          <Text style={{ marginTop: 6, color: colors.mutedForeground, textAlign: "center", fontSize: 13 }}>
            {t.savedAddressesEmptyBody}
          </Text>
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
            />
          )}
        />
      )}

      <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
        <Pressable
          onPress={() => router.push("/saved-addresses/new" as never)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? "#8c6d39" : colors.gold,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 8,
          })}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
            {t.savedAddressesAdd}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: "#fff",
      }}
    >
      <Pressable
        onPress={() => router.back()}
        style={{ padding: 8 }}
        hitSlop={8}
      >
        <Feather name="chevron-left" size={22} color={colors.primary} />
      </Pressable>
      <Text
        style={{
          flex: 1,
          fontFamily: "PlayfairDisplay_600SemiBold",
          fontSize: 18,
          color: colors.primary,
          textAlign: "center",
          marginRight: 38,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  t,
}: {
  address: CustomerAddress;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: address.isDefault ? colors.gold : colors.border,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primary }}>
          {labelText(address.label, t)}
        </Text>
        {address.nickname ? (
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.mutedForeground }}>
            · {address.nickname}
          </Text>
        ) : null}
        {address.isDefault ? (
          <View
            style={{
              marginLeft: "auto",
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: "#f4ead6",
            }}
          >
            <Text style={{ color: colors.gold, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1 }}>
              {t.savedAddressesDefaultBadge.toUpperCase()}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 14 }}>
        {flagFor(address.countryCode)} {address.district}, {countryName(address.countryCode)}
      </Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 18 }}>
        {[address.addressLine, address.building, address.apartment].filter(Boolean).join(" · ")}
      </Text>
      {address.directions ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 12, fontStyle: "italic" }}>
          {address.directions}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
        <Pressable onPress={onEdit} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name="edit-2" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 13 }}>
            {t.savedAddressesEdit}
          </Text>
        </Pressable>
        {!address.isDefault ? (
          <Pressable onPress={onSetDefault} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="star" size={14} color={colors.gold} />
            <Text style={{ color: colors.gold, fontFamily: "Inter_500Medium", fontSize: 13 }}>
              {t.savedAddressesSetDefault}
            </Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onDelete} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto" }}>
          <Feather name="trash-2" size={14} color="#c0392b" />
          <Text style={{ color: "#c0392b", fontFamily: "Inter_500Medium", fontSize: 13 }}>
            {t.savedAddressesDelete}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

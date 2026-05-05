import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

export function MastercardBadge() {
  return (
    <View style={{ backgroundColor: "#fff", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row" }}>
      <View style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#EB001B" }} />
      <View style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#F79E1B", marginLeft: -5 }} />
    </View>
  );
}

export function VisaBadge() {
  return (
    <View style={{ backgroundColor: "#fff", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb" }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 10, color: "#1A1F71" }}>VISA</Text>
    </View>
  );
}

export function AmexBadge() {
  return (
    <View style={{ backgroundColor: "#006FCF", paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#006FCF" }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.4 }}>AMEX</Text>
    </View>
  );
}

export function ApplePayBadge() {
  return (
    <View style={{ backgroundColor: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", alignItems: "center", gap: 2 }}>
      <MaterialCommunityIcons name="apple" size={11} color="#000" />
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#000" }}>Pay</Text>
    </View>
  );
}

export function GooglePayBadge() {
  return (
    <View style={{ backgroundColor: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: "#e5e7eb", flexDirection: "row", alignItems: "center", gap: 3 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          borderWidth: 1.5,
          borderTopColor: "#4285F4",
          borderRightColor: "#EA4335",
          borderBottomColor: "#FBBC05",
          borderLeftColor: "#34A853",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 7, color: "#4285F4", lineHeight: 8 }}>G</Text>
      </View>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#555" }}>Pay</Text>
    </View>
  );
}

export function WhishBadge() {
  return (
    <View style={{ backgroundColor: "#E2231A", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#E2231A" }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.4 }}>whish</Text>
    </View>
  );
}

export function CardIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <AmexBadge />
      <MastercardBadge />
      <VisaBadge />
    </View>
  );
}

export function WalletIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <ApplePayBadge />
      <GooglePayBadge />
    </View>
  );
}

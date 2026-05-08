import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View, ViewStyle } from "react-native";

const BADGE_HEIGHT = 26;
const BADGE_WIDTH = 44;
const BADGE_RADIUS = 5;

const chipBase: ViewStyle = {
  height: BADGE_HEIGHT,
  width: BADGE_WIDTH,
  borderRadius: BADGE_RADIUS,
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const lightChip: ViewStyle = {
  ...chipBase,
  backgroundColor: "#FFFFFF",
  borderWidth: 1,
  borderColor: "#E5E5E5",
};

export function MastercardBadge() {
  return (
    <View style={lightChip}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: "#EB001B" }} />
        <View style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: "#F79E1B", marginLeft: -6 }} />
      </View>
    </View>
  );
}

export function VisaBadge() {
  return (
    <View style={[chipBase, { backgroundColor: "#1A1F71" }]}>
      <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 12, color: "#fff", letterSpacing: 0.5 }}>VISA</Text>
    </View>
  );
}

export function AmexBadge() {
  return (
    <View style={[chipBase, { backgroundColor: "#2E77BC" }]}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: "#fff", letterSpacing: 0.5, lineHeight: 10 }}>AMEX</Text>
    </View>
  );
}

export function ApplePayBadge() {
  return (
    <View style={lightChip}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="apple" size={14} color="#000" style={{ marginTop: -1 }} />
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: "#000", letterSpacing: -0.2, marginLeft: 1 }}>Pay</Text>
      </View>
    </View>
  );
}

export function GooglePayBadge() {
  return (
    <View style={lightChip}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10 }}>
          <Text style={{ color: "#4285F4" }}>G</Text>
          <Text style={{ color: "#EA4335" }}>o</Text>
          <Text style={{ color: "#FBBC04" }}>o</Text>
          <Text style={{ color: "#4285F4" }}>g</Text>
          <Text style={{ color: "#34A853" }}>l</Text>
          <Text style={{ color: "#EA4335" }}>e</Text>
        </Text>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: "#5F6368", marginLeft: 2 }}>Pay</Text>
      </View>
    </View>
  );
}

export function WhishBadge() {
  return (
    <View style={[chipBase, { backgroundColor: "#E6007E" }]}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff", letterSpacing: -0.3 }}>whish</Text>
    </View>
  );
}

export function PayPalBadge() {
  return (
    <View style={lightChip}>
      <Text style={{ fontFamily: "Inter_700Bold", fontStyle: "italic", fontSize: 11, letterSpacing: -0.3 }}>
        <Text style={{ color: "#003087" }}>Pay</Text>
        <Text style={{ color: "#009CDE" }}>Pal</Text>
      </Text>
    </View>
  );
}

export function CardIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <AmexBadge />
      <MastercardBadge />
      <VisaBadge />
    </View>
  );
}

export function WalletIcons() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <ApplePayBadge />
      <GooglePayBadge />
    </View>
  );
}

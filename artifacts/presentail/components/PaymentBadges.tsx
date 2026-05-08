import React from "react";
import { View, ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { amexXml } from "./paymentLogos/amex";
import { applepayXml } from "./paymentLogos/applepay";
import { googlepayXml } from "./paymentLogos/googlepay";
import { mastercardXml } from "./paymentLogos/mastercard";
import { paypalXml } from "./paymentLogos/paypal";
import { visaXml } from "./paymentLogos/visa";
import { whishXml } from "./paymentLogos/whish";

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

// Inner logo dimensions tuned per brand to respect each brand's
// natural aspect ratio while leaving the clear-space margin required
// by their press kits inside the 44 x 26 chip frame.
function Logo({
  xml,
  width,
  height,
}: {
  xml: string;
  width: number;
  height: number;
}) {
  return <SvgXml xml={xml} width={width} height={height} />;
}

export function MastercardBadge() {
  return (
    <View style={lightChip}>
      <Logo xml={mastercardXml} width={28} height={18} />
    </View>
  );
}

export function VisaBadge() {
  return (
    <View style={lightChip}>
      <Logo xml={visaXml} width={32} height={11} />
    </View>
  );
}

export function AmexBadge() {
  return (
    <View style={[chipBase, { backgroundColor: "#006FCF" }]}>
      <Logo xml={amexXml} width={BADGE_WIDTH} height={BADGE_HEIGHT} />
    </View>
  );
}

export function ApplePayBadge() {
  return (
    <View style={lightChip}>
      <Logo xml={applepayXml} width={34} height={14} />
    </View>
  );
}

export function GooglePayBadge() {
  return (
    <View style={lightChip}>
      <Logo xml={googlepayXml} width={34} height={16} />
    </View>
  );
}

export function WhishBadge() {
  return (
    <View style={[chipBase, { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E5E5" }]}>
      <Logo xml={whishXml} width={36} height={8} />
    </View>
  );
}

export function PayPalBadge() {
  return (
    <View style={lightChip}>
      <Logo xml={paypalXml} width={34} height={9} />
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

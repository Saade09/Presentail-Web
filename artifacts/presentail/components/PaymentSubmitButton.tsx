import React from "react";
import { Pressable, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { applepayXml } from "./paymentLogos/applepay";
import { googlepayXml } from "./paymentLogos/googlepay";
import { paypalXml } from "./paymentLogos/paypal";
import { whishXml } from "./paymentLogos/whish";
import type { PayMethodId } from "@workspace/pay-methods";

type Props = {
  payMethod: PayMethodId;
  onPress: () => void;
  disabled: boolean;
  paying: boolean;
  processingLabel: string;
};

const BRANDED_METHODS: PayMethodId[] = ["apple_pay", "google_pay", "paypal", "whish"];

export function isBrandedPayMethod(m: PayMethodId): boolean {
  return BRANDED_METHODS.includes(m);
}

export function PaymentSubmitButton({ payMethod, onPress, disabled, paying, processingLabel }: Props) {
  if (payMethod === "apple_pay") {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={paying ? processingLabel : "Pay with Apple Pay"}
        accessibilityState={{ disabled, busy: paying }}
        style={({ pressed }) => ({
          backgroundColor: "#000",
          paddingVertical: 16,
          borderRadius: 999,
          flexDirection: "row" as const,
          justifyContent: "center" as const,
          alignItems: "center" as const,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        {paying
          ? <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14, letterSpacing: 0.6 }}>{processingLabel}</AppText>
          : <SvgXml xml={applepayXml} width={80} height={28} />}
      </Pressable>
    );
  }

  if (payMethod === "google_pay") {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={paying ? processingLabel : "Pay with Google Pay"}
        accessibilityState={{ disabled, busy: paying }}
        style={({ pressed }) => ({
          backgroundColor: "#fff",
          paddingVertical: 16,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: "#dadce0",
          flexDirection: "row" as const,
          justifyContent: "center" as const,
          alignItems: "center" as const,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        {paying
          ? <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#3c4043", fontSize: 14, letterSpacing: 0.6 }}>{processingLabel}</AppText>
          : <SvgXml xml={googlepayXml} width={72} height={30} />}
      </Pressable>
    );
  }

  if (payMethod === "paypal") {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={paying ? processingLabel : "Pay with PayPal"}
        accessibilityState={{ disabled, busy: paying }}
        style={({ pressed }) => ({
          backgroundColor: "#0070BA",
          paddingVertical: 16,
          borderRadius: 14,
          flexDirection: "row" as const,
          justifyContent: "center" as const,
          alignItems: "center" as const,
          gap: 10,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        {paying
          ? <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14, letterSpacing: 0.6 }}>{processingLabel}</AppText>
          : <>
              <View style={{ backgroundColor: "#fff", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 }}>
                <SvgXml xml={paypalXml} width={50} height={14} />
              </View>
              <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14, letterSpacing: 0.3 }}>Pay with PayPal</AppText>{/* i18n-ignore */}
            </>}
      </Pressable>
    );
  }

  if (payMethod === "whish") {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={paying ? processingLabel : "Pay with Whish Money"}
        accessibilityState={{ disabled, busy: paying }}
        style={({ pressed }) => ({
          backgroundColor: "#D31F37",
          paddingVertical: 16,
          borderRadius: 14,
          flexDirection: "row" as const,
          justifyContent: "center" as const,
          alignItems: "center" as const,
          gap: 10,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        {paying
          ? <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14, letterSpacing: 0.6 }}>{processingLabel}</AppText>
          : <>
              <View style={{ backgroundColor: "#fff", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }}>
                <SvgXml xml={whishXml} width={44} height={10} />
              </View>
              <AppText style={{ fontFamily: "Inter_600SemiBold", color: "#fff", fontSize: 14, letterSpacing: 0.3 }}>Pay with Whish Money</AppText>{/* i18n-ignore */}
            </>}
      </Pressable>
    );
  }

  return null;
}

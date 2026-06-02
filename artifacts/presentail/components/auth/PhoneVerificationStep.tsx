import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { PhoneField } from "@/components/PhoneField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useHeadingFont } from "@/hooks/useHeadingFont";
import { useT } from "@/hooks/useT";
import type { CountryDialCode } from "@/data/countryCodes";
import { COUNTRY_DIAL_CODES } from "@/data/countryCodes";

const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

type SubStep = "phone" | "otp";

type Props = {
  email: string;
  onVerified: (phone: string) => void;
  onSendOtp: (phone: string) => Promise<{ ok: true } | { ok: false; code: string }>;
  onVerifyOtp: (phone: string, code: string) => Promise<{ ok: true } | { ok: false; code: string }>;
};

export function PhoneVerificationStep({
  email,
  onVerified,
  onSendOtp,
  onVerifyOtp,
}: Props) {
  const colors = useColors();
  const headingFontMedium = useHeadingFont("500Medium");
  const t = useT();
  const { isRTL } = useLanguage();
  const align = isRTL ? "right" : "left";

  const [subStep, setSubStep] = useState<SubStep>("phone");

  const defaultCountry: CountryDialCode =
    COUNTRY_DIAL_CODES.find((c) => c.code === "LB") ?? COUNTRY_DIAL_CODES[0];
  const [selectedCountry, setSelectedCountry] = useState<CountryDialCode>(defaultCountry);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_OTP_ATTEMPTS);

  const [resendCountdown, setResendCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const e164Phone = `${selectedCountry.dial.replace(/\s/g, "")}${phoneNumber.replace(/\s/g, "")}`;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startResendCountdown() {
    setResendCountdown(OTP_RESEND_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  const canSubmitPhone = !phoneBusy && phoneNumber.trim().length >= 5;
  const canSubmitOtp = !otpBusy && otpCode.trim().length === 6;

  async function handleSendOtp() {
    setPhoneError(null);
    setPhoneBusy(true);
    const result = await onSendOtp(e164Phone);
    setPhoneBusy(false);
    if (!result.ok) {
      if (result.code === "too_many_requests") {
        setPhoneError(t.authOtpTooManyRequests);
      } else {
        setPhoneError(t.authGenericError);
      }
      return;
    }
    setOtpCode("");
    setOtpError(null);
    setAttemptsLeft(MAX_OTP_ATTEMPTS);
    startResendCountdown();
    setSubStep("otp");
  }

  async function handleVerifyOtp() {
    setOtpError(null);
    setOtpBusy(true);
    const result = await onVerifyOtp(e164Phone, otpCode.trim());
    setOtpBusy(false);
    if (!result.ok) {
      if (result.code === "too_many_attempts") {
        setOtpError(t.authOtpTooManyAttempts);
        setAttemptsLeft(0);
        setSubStep("phone");
        return;
      }
      if (result.code === "expired_otp") {
        setOtpError(t.authOtpExpired);
        setSubStep("phone");
        return;
      }
      const remaining = attemptsLeft - 1;
      setAttemptsLeft(remaining);
      setOtpCode("");
      setOtpError(t.authOtpInvalid);
      return;
    }
    onVerified(e164Phone);
  }

  async function handleResend() {
    if (resendCountdown > 0 || phoneBusy) return;
    setOtpError(null);
    setPhoneError(null);
    setPhoneBusy(true);
    const result = await onSendOtp(e164Phone);
    setPhoneBusy(false);
    if (!result.ok) {
      setOtpError(
        result.code === "too_many_requests" ? t.authOtpTooManyRequests : t.authGenericError,
      );
      return;
    }
    setOtpCode("");
    setAttemptsLeft(MAX_OTP_ATTEMPTS);
    startResendCountdown();
  }

  if (subStep === "otp") {
    const displayPhone = `${selectedCountry.dial} ${phoneNumber}`;
    return (
      <View style={{ gap: 22 }}>
        <View style={{ gap: 8 }}>
          <AppText
            style={{
              fontFamily: headingFontMedium,
              fontSize: 28,
              color: colors.primary,
              textAlign: align,
            }}
          >
            {t.authOtpTitle}
          </AppText>
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 14,
              color: colors.mutedForeground,
              textAlign: align,
              lineHeight: 20,
            }}
          >
            {t.authOtpSubtitle.replace("{{phone}}", displayPhone)}
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 12,
              color: colors.mutedForeground,
              textAlign: align,
            }}
          >
            {t.authOtpLabel}
          </AppText>
          <TextInput
            value={otpCode}
            onChangeText={(v) => {
              setOtpCode(v.replace(/\D/g, "").slice(0, 6));
              if (otpError) setOtpError(null);
            }}
            placeholder={t.authOtpPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={6}
            editable={!otpBusy}
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 22,
              letterSpacing: 8,
              color: colors.primary,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 16,
              textAlign: "center",
            }}
          />
        </View>

        {otpError ? (
          <AppText
            style={{
              fontFamily: "Inter_400Regular",
              fontSize: 12,
              color: colors.destructive,
              textAlign: align,
            }}
          >
            {otpError}
          </AppText>
        ) : null}

        <Pressable
          disabled={!canSubmitOtp}
          onPress={handleVerifyOtp}
          style={({ pressed }) => ({
            backgroundColor: colors.primary,
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: "center",
            opacity: !canSubmitOtp ? 0.45 : pressed ? 0.85 : 1,
          })}
        >
          {otpBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText
              style={{
                color: "#fff",
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                letterSpacing: 0.6,
              }}
            >
              {t.authOtpVerify}
            </AppText>
          )}
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={resendCountdown > 0 || phoneBusy}
          hitSlop={8}
          style={({ pressed }) => ({
            alignItems: "center",
            opacity: resendCountdown > 0 || phoneBusy ? 0.5 : pressed ? 0.6 : 1,
          })}
        >
          <AppText
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 13,
              color: colors.primary,
              textDecorationLine: "underline",
              textAlign: "center",
            }}
          >
            {resendCountdown > 0
              ? t.authOtpResendIn.replace("{{seconds}}", String(resendCountdown))
              : t.authOtpResend}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 8 }}>
        <AppText
          style={{
            fontFamily: headingFontMedium,
            fontSize: 28,
            color: colors.primary,
            textAlign: align,
          }}
        >
          {t.authPhoneTitle}
        </AppText>
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 14,
            color: colors.mutedForeground,
            textAlign: align,
            lineHeight: 20,
          }}
        >
          {t.authPhoneSubtitle}
        </AppText>
      </View>

      <PhoneField
        label={t.authPhoneLabel}
        value={phoneNumber}
        onChangeText={(v) => {
          setPhoneNumber(v);
          if (phoneError) setPhoneError(null);
        }}
        countryCode={selectedCountry.code}
        onChangeCountry={(c) => {
          setSelectedCountry(c);
          if (phoneError) setPhoneError(null);
        }}
      />

      {phoneError ? (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.destructive,
            textAlign: align,
          }}
        >
          {phoneError}
        </AppText>
      ) : null}

      <Pressable
        disabled={!canSubmitPhone}
        onPress={handleSendOtp}
        style={({ pressed }) => ({
          backgroundColor: colors.primary,
          paddingVertical: 16,
          borderRadius: 14,
          alignItems: "center",
          opacity: !canSubmitPhone ? 0.45 : pressed ? 0.85 : 1,
        })}
      >
        {phoneBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            style={{
              color: "#fff",
              fontFamily: "Inter_600SemiBold",
              fontSize: 14,
              letterSpacing: 0.6,
            }}
          >
            {t.authContinue}
          </AppText>
        )}
      </Pressable>

      <Pressable
        onPress={() => {}}
        disabled
        hitSlop={8}
        accessibilityRole="link"
        style={{ alignItems: "center", opacity: 0.55 }}
      >
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.mutedForeground,
            textAlign: "center",
          }}
        >
          {t.authPhoneDisclaimer}
        </AppText>
      </Pressable>
    </View>
  );
}

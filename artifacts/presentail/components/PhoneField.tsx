import { Feather } from "@expo/vector-icons";
import {
  AsYouType,
  getExampleNumber,
  isValidPhoneNumber,
  type CountryCode,
  type Examples,
} from "libphonenumber-js";
import phoneExamples from "libphonenumber-js/examples.mobile.json";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, type TextInput, type TextInputProps } from "react-native";
import PhoneInput from "react-native-phone-number-input";
import { AppText } from "@/components/AppText";

import { COUNTRY_DIAL_CODES, type CountryDialCode } from "@/data/countryCodes";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

function getCountryPlaceholder(code: string, fallback: string): string {
  try {
    const ex = getExampleNumber(code as CountryCode, phoneExamples as unknown as Examples);
    return ex?.formatNational() ?? fallback;
  } catch {
    return fallback;
  }
}

function checkPhoneValid(text: string, code: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  try {
    return isValidPhoneNumber(trimmed, code as CountryCode);
  } catch {
    return false;
  }
}

type Props = {
  label: string;
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  countryCode: string;
  onChangeCountry: (c: CountryDialCode) => void;
  placeholder?: string;
  showError?: boolean;
  focusRef?: React.RefObject<TextInput | null>;
  returnKeyType?: TextInputProps["returnKeyType"];
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
};

export function PhoneField({
  label,
  required,
  value,
  onChangeText,
  countryCode,
  onChangeCountry,
  placeholder,
  showError,
  focusRef,
  returnKeyType,
  onSubmitEditing,
}: Props) {
  const colors = useColors();
  const t = useT();
  const [touched, setTouched] = useState(false);
  const [remountKey, setRemountKey] = useState(0);
  const lastInternalValueRef = useRef(value);
  const prevCountryCodeRef = useRef(countryCode);

  useEffect(() => {
    const countryChanged = countryCode !== prevCountryCodeRef.current;
    const externalValueChange = value !== lastInternalValueRef.current;
    if (countryChanged || externalValueChange) {
      prevCountryCodeRef.current = countryCode;
      lastInternalValueRef.current = value;
      setRemountKey((k) => k + 1);
    }
  }, [value, countryCode]);

  const resolvedPlaceholder = useMemo(
    () => placeholder ?? getCountryPlaceholder(countryCode, t.phoneNumberLabel),
    [countryCode, placeholder, t.phoneNumberLabel],
  );

  const isValid = checkPhoneValid(value, countryCode);
  const showInlineError = (touched || showError) && value.trim().length > 0 && !isValid;

  const handleChangeText = (text: string) => {
    try {
      const formatted = new AsYouType(countryCode as CountryCode).input(text);
      lastInternalValueRef.current = formatted;
      onChangeText(formatted);
    } catch {
      lastInternalValueRef.current = text;
      onChangeText(text);
    }
  };

  const handleCountryChange = (country: { cca2: string }) => {
    const matched = COUNTRY_DIAL_CODES.find((c) => c.code === country.cca2);
    if (matched) onChangeCountry(matched);
  };

  const chevronIcon = (
    <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
  );

  return (
    <View style={{ gap: 6 }}>
      <AppText
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.primary,
          letterSpacing: 0.4,
        }}
      >
        {label}
        {required ? <AppText style={{ color: colors.gold }}> *</AppText> : null}
      </AppText>

      <PhoneInput
        key={remountKey}
        defaultValue={value}
        defaultCode={countryCode as any}
        layout="second"
        onChangeText={handleChangeText}
        onChangeCountry={handleCountryChange as any}
        placeholder={resolvedPlaceholder}
        renderDropdownImage={chevronIcon}
        containerStyle={{
          borderWidth: 1,
          borderColor: showInlineError ? "#d9534f" : colors.border,
          borderRadius: 10,
          backgroundColor: "#fff",
          overflow: "hidden",
          width: "100%",
        }}
        flagButtonStyle={{
          backgroundColor: "#faf7f1",
          paddingHorizontal: 12,
          paddingVertical: 13,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          gap: 6,
        }}
        codeTextStyle={{
          fontFamily: "Inter_500Medium",
          fontSize: 14,
          color: colors.primary,
          marginLeft: 0,
        }}
        textContainerStyle={{
          backgroundColor: "#fff",
          paddingHorizontal: 14,
          paddingVertical: 0,
        }}
        textInputStyle={{
          fontFamily: "Inter_500Medium",
          fontSize: 14,
          color: colors.primary,
          height: 48,
        }}
        textInputProps={{
          placeholderTextColor: colors.mutedForeground,
          onBlur: () => setTouched(true),
          selectionColor: colors.primary,
          returnKeyType,
          onSubmitEditing,
          blurOnSubmit: !onSubmitEditing,
          ...(focusRef ? { ref: focusRef } : {}),
        } as TextInputProps}
        countryPickerProps={{
          countryCodes: COUNTRY_DIAL_CODES.map((c) => c.code),
          withCloseButton: false,
        }}
      />

      {showInlineError ? (
        <AppText
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: "#d9534f",
          }}
        >
          {t.phoneInvalidNumber}
        </AppText>
      ) : null}
    </View>
  );
}

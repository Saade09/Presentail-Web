import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmailEntryStep } from "@/components/auth/EmailEntryStep";
import { PasswordLoginStep } from "@/components/auth/PasswordLoginStep";
import { SignupStep } from "@/components/auth/SignupStep";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import {
  AuthError,
  checkEmailExists,
  createAccountWithEmail,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from "@/services/authService";
import { isValidEmail } from "@/utils/validation";

type Step = "email" | "passwordLogin" | "signup";

export default function AuthScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { isRTL } = useLanguage();
  const { login, register, applySession } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  const [socialBusy, setSocialBusy] = useState<"apple" | "google" | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/account");
  };

  const errorText = (err: AuthError): string => {
    switch (err.code) {
      case "email_required":
        return t.authFieldRequired;
      case "network":
        return t.authNetworkError;
      case "apple_unavailable":
        return t.authAppleUnavailable;
      case "google_unavailable":
        return t.authGoogleUnavailable;
      case "apple_failed":
        return t.authAppleFailed;
      case "google_failed":
        return t.authGoogleFailed;
      case "canceled":
        return "";
      case "server":
        return err.serverMessage || t.authGenericError;
    }
  };

  const goBackStep = () => {
    setLoginError(null);
    setSignupError(null);
    setPassword("");
    setStep("email");
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(t.authInvalidEmail);
      return;
    }
    setEmailError(null);
    setSocialError(null);
    setEmailBusy(true);
    const r = await checkEmailExists(trimmed);
    setEmailBusy(false);
    if (!r.ok) {
      setEmailError(errorText(r));
      return;
    }
    setEmail(trimmed);
    if (r.exists) {
      setStep("passwordLogin");
    } else {
      setStep("signup");
    }
  };

  const onSubmitLogin = async () => {
    if (!password) {
      setLoginError(t.authFieldRequired);
      return;
    }
    setLoginError(null);
    setLoginBusy(true);
    const r = await signInWithEmail(login, email, password);
    setLoginBusy(false);
    if (!r.ok) {
      setLoginError(errorText(r));
      return;
    }
    close();
  };

  const onSubmitSignup = async () => {
    setSignupError(null);
    setSignupBusy(true);
    const r = await createAccountWithEmail(register, {
      email,
      password,
      fullName,
    });
    setSignupBusy(false);
    if (!r.ok) {
      setSignupError(errorText(r));
      return;
    }
    close();
  };

  const onApple = async () => {
    setSocialError(null);
    setSocialBusy("apple");
    const r = await signInWithApple(applySession);
    setSocialBusy(null);
    if (r.ok) {
      close();
      return;
    }
    if (r.code === "canceled") return;
    setSocialError(errorText(r));
  };

  const onGoogle = async () => {
    setSocialError(null);
    setSocialBusy("google");
    const r = await signInWithGoogle(applySession);
    setSocialBusy(null);
    if (r.ok) {
      close();
      return;
    }
    if (r.code === "canceled") return;
    setSocialError(errorText(r));
  };

  const onForgotPassword = () => {
    setLoginError(t.authForgotPasswordSoon);
  };

  const isFirstStep = step === "email";
  const headerIcon: keyof typeof Feather.glyphMap = isFirstStep
    ? "x"
    : isRTL
    ? "chevron-right"
    : "chevron-left";
  const onHeaderPress = isFirstStep ? close : goBackStep;
  const headerLabel = isFirstStep ? t.authClose : t.authBack;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingTop: insets.top + 6,
          paddingBottom: 8,
          paddingHorizontal: 12,
        }}
      >
        <Pressable
          onPress={onHeaderPress}
          hitSlop={12}
          accessibilityLabel={headerLabel}
          style={({ pressed }) => ({
            padding: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name={headerIcon} size={24} color={colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24) + 32,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === "email" ? (
            <>
              <EmailEntryStep
                email={email}
                onEmailChange={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(null);
                }}
                emailError={emailError ?? socialError}
                busy={emailBusy}
                socialBusy={socialBusy}
                onContinue={onContinueEmail}
                onApple={onApple}
                onGoogle={onGoogle}
                onOpenPrivacy={() => router.push("/privacy")}
                onOpenTerms={() => router.push("/terms")}
              />
            </>
          ) : null}

          {step === "passwordLogin" ? (
            <PasswordLoginStep
              email={email}
              password={password}
              onPasswordChange={(v) => {
                setPassword(v);
                if (loginError) setLoginError(null);
              }}
              busy={loginBusy}
              errorMessage={loginError}
              onSubmit={onSubmitLogin}
              onForgotPassword={onForgotPassword}
            />
          ) : null}

          {step === "signup" ? (
            <SignupStep
              email={email}
              fullName={fullName}
              password={password}
              onNameChange={(v) => {
                setFullName(v);
                if (signupError) setSignupError(null);
              }}
              onPasswordChange={(v) => {
                setPassword(v);
                if (signupError) setSignupError(null);
              }}
              busy={signupBusy}
              errorMessage={signupError}
              onSubmit={onSubmitSignup}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

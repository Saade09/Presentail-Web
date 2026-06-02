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
import { ForgotPasswordPasteStep } from "@/components/auth/ForgotPasswordPasteStep";
import { ForgotPasswordSentStep } from "@/components/auth/ForgotPasswordSentStep";
import { ForgotPasswordStep } from "@/components/auth/ForgotPasswordStep";
import { PasswordLoginStep } from "@/components/auth/PasswordLoginStep";
import { SignupStep } from "@/components/auth/SignupStep";
import { PhoneVerificationStep } from "@/components/auth/PhoneVerificationStep";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import {
  AuthError,
  checkEmailExists,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  sendOtp,
  verifyOtpAndRegister,
} from "@/services/authService";
import { isValidEmail } from "@/utils/validation";
import { withRouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { trackEvent } from "@/lib/analytics";

type Step =
  | "email"
  | "passwordLogin"
  | "signup"
  | "signupPhone"
  | "forgot"
  | "forgotSent"
  | "forgotPasteLink";

function AuthScreen() {
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

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [pastedLink, setPastedLink] = useState("");
  const [pasteLinkError, setPasteLinkError] = useState<string | null>(null);

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
      case "expired_link":
        return t.authResetExpired;
      case "weak_password":
        return t.authResetWeak;
      case "missing_link":
        return t.authResetMissingLink;
      case "unknown_email":
        return t.authForgotUnknownEmail;
      case "lookup_failed":
      case "lookup_unavailable":
        return t.authEmailCheckFailed;
      case "wrong_password":
        return t.authWrongPassword;
      case "email_exists":
        return t.authEmailAlreadyExists;
      case "server":
        return t.authGenericError;
    }
  };

  const goBackStep = () => {
    setLoginError(null);
    setSignupError(null);
    setForgotError(null);
    setPassword("");
    if (step === "forgotPasteLink") {
      setStep("forgotSent");
      return;
    }
    if (step === "forgotSent") {
      setStep("forgot");
      return;
    }
    if (step === "forgot") {
      setStep("passwordLogin");
      return;
    }
    if (step === "signupPhone") {
      setStep("signup");
      return;
    }
    setStep("email");
  };

  const onContinueEmail = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(t.authInvalidEmail);
      return;
    }
    trackEvent({ name: "signin_page_action", action: "continue" });
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

  const onSubmitSignup = () => {
    trackEvent({ name: "signup_step_completed", action: "namePassword" });
    setStep("signupPhone");
  };

  const onApple = async () => {
    trackEvent({ name: "signin_page_action", action: "apple" });
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
    trackEvent({ name: "signin_page_action", action: "google" });
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
    setLoginError(null);
    setForgotError(null);
    setForgotEmail(email.trim());
    setStep("forgot");
  };

  const onSubmitForgot = async () => {
    const trimmed = forgotEmail.trim();
    if (!isValidEmail(trimmed)) {
      setForgotError(t.authInvalidEmail);
      return;
    }
    setForgotError(null);
    setForgotBusy(true);
    const r = await requestPasswordReset(trimmed);
    setForgotBusy(false);
    if (!r.ok) {
      setForgotError(errorText(r) || t.authGenericError);
      return;
    }
    setForgotEmail(trimmed);
    setStep("forgotSent");
  };

  const onResendForgot = async () => {
    if (forgotBusy) return;
    setForgotBusy(true);
    await requestPasswordReset(forgotEmail.trim());
    setForgotBusy(false);
  };

  const onForgotSentBackToSignIn = () => {
    setForgotError(null);
    setStep("passwordLogin");
  };

  const onOpenPasteLink = () => {
    setForgotError(null);
    setPastedLink("");
    setPasteLinkError(null);
    setStep("forgotPasteLink");
  };

  const onSubmitPastedLink = () => {
    const raw = pastedLink.trim();
    if (!raw) {
      setPasteLinkError(t.authForgotPasteLinkInvalid);
      return;
    }
    try {
      const url = new URL(raw);
      const key = url.searchParams.get("key");
      const login = url.searchParams.get("login");
      if (!key || !login) {
        setPasteLinkError(t.authForgotPasteLinkInvalid);
        return;
      }
      const qs = new URLSearchParams({ key, login }).toString();
      setPasteLinkError(null);
      router.push(`/reset-password?${qs}` as never);
    } catch {
      setPasteLinkError(t.authForgotPasteLinkInvalid);
    }
  };

  const onSendOtp = async (phone: string): Promise<{ ok: true } | { ok: false; code: string }> => {
    return sendOtp(phone);
  };

  const onVerifyOtp = async (
    phone: string,
    code: string,
  ): Promise<{ ok: true } | { ok: false; code: string }> => {
    const spaceIndex = fullName.trim().indexOf(" ");
    const firstName =
      spaceIndex === -1 ? fullName.trim() : fullName.trim().slice(0, spaceIndex);
    const lastName =
      spaceIndex === -1 ? "" : fullName.trim().slice(spaceIndex + 1);
    const r = await verifyOtpAndRegister(applySession, {
      phone,
      code,
      email,
      password,
      firstName,
      lastName,
    });
    if (r.ok) {
      trackEvent({ name: "signup_step_completed", action: "otp" });
      close();
      return { ok: true };
    }
    return r;
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

          {step === "forgot" ? (
            <ForgotPasswordStep
              email={forgotEmail}
              onEmailChange={(v) => {
                setForgotEmail(v);
                if (forgotError) setForgotError(null);
              }}
              errorMessage={forgotError}
              busy={forgotBusy}
              onSubmit={onSubmitForgot}
            />
          ) : null}

          {step === "forgotSent" ? (
            <ForgotPasswordSentStep
              email={forgotEmail}
              busy={forgotBusy}
              onResend={onResendForgot}
              onBackToSignIn={onForgotSentBackToSignIn}
              onPasteLink={onOpenPasteLink}
            />
          ) : null}

          {step === "forgotPasteLink" ? (
            <ForgotPasswordPasteStep
              value={pastedLink}
              onChange={(v) => {
                setPastedLink(v);
                if (pasteLinkError) setPasteLinkError(null);
              }}
              errorMessage={pasteLinkError}
              busy={false}
              onSubmit={onSubmitPastedLink}
            />
          ) : null}

          {step === "signup" ? (
            <SignupStep
              fullName={fullName}
              password={password}
              onFullNameChange={(v) => {
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
              onAlreadyHaveAccount={() => {
                setSignupError(null);
                setPassword("");
                setStep("passwordLogin");
              }}
            />
          ) : null}

          {step === "signupPhone" ? (
            <PhoneVerificationStep
              email={email}
              onVerified={() => {}}
              onSendOtp={onSendOtp}
              onVerifyOtp={onVerifyOtp}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default withRouteErrorBoundary(AuthScreen, "auth");

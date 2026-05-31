import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmailEntryStep } from "@/components/auth/EmailEntryStep";
import { ForgotPasswordPasteStep } from "@/components/auth/ForgotPasswordPasteStep";
import { ForgotPasswordSentStep } from "@/components/auth/ForgotPasswordSentStep";
import { ForgotPasswordStep } from "@/components/auth/ForgotPasswordStep";
import { PasswordLoginStep } from "@/components/auth/PasswordLoginStep";
import { SignupStep } from "@/components/auth/SignupStep";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";
import { trackEvent } from "@/lib/analytics";
import {
  AuthError,
  checkEmailExists,
  createAccountWithEmail,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from "@/services/authService";
import { isValidEmail } from "@/utils/validation";

type Step =
  | "email"
  | "passwordLogin"
  | "signup"
  | "forgot"
  | "forgotSent"
  | "forgotPasteLink";

type Surface = "cart" | "checkout-direct";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAuthSuccess: () => void;
  onContinueAsGuest: () => void;
  /**
   * Where in the checkout funnel this prompt was opened so we can
   * separately attribute conversion of cart-button taps vs direct
   * /checkout visits in analytics, mirroring the web prompt.
   */
  surface: Surface;
};

export function CheckoutLoginSheet({
  visible,
  onClose,
  onAuthSuccess,
  onContinueAsGuest,
  surface,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { isRTL } = useLanguage();
  const { login, register, applySession } = useAuth();
  const { height: windowHeight } = useWindowDimensions();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);

  const [socialBusy, setSocialBusy] = useState<"apple" | "google" | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [pastedLink, setPastedLink] = useState("");
  const [pasteLinkError, setPasteLinkError] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  // Mirrors the web CheckoutLoginDialog: emit one "viewed" per open and
  // one "action" per close. If the shopper closes the sheet without
  // picking an option we emit a "dismissed" action so prompt → drop-off
  // shows up alongside prompt → sign-in / prompt → guest in the funnel.
  const actionTakenRef = useRef(false);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (visible && !wasOpenRef.current) {
      actionTakenRef.current = false;
      trackEvent({ name: "checkout_login_prompt_viewed", surface });
    }
    if (!visible && wasOpenRef.current && !actionTakenRef.current) {
      trackEvent({
        name: "checkout_login_prompt_action",
        surface,
        action: "dismissed",
      });
    }
    wasOpenRef.current = visible;
  }, [visible, surface]);

  const recordAction = (
    action: "continue" | "google" | "apple" | "guest",
  ) => {
    actionTakenRef.current = true;
    trackEvent({
      name: "checkout_login_prompt_action",
      surface,
      action,
    });
  };

  const resetState = () => {
    setStep("email");
    setEmail("");
    setEmailError(null);
    setEmailBusy(false);
    setPassword("");
    setLoginBusy(false);
    setLoginError(null);
    setFirstName("");
    setLastName("");
    setSignupBusy(false);
    setSignupError(null);
    setSocialBusy(null);
    setSocialError(null);
    setForgotEmail("");
    setForgotError(null);
    setForgotBusy(false);
    setPastedLink("");
    setPasteLinkError(null);
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      dragY.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          dragY.setValue(0);
          resetState();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sheetMaxHeight = Math.min(windowHeight * 0.92, windowHeight - insets.top - 12);

  const slideTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetMaxHeight, 0],
  });
  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) dragY.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 100 || g.vy > 0.8) {
          onClose();
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }).start();
      },
    }),
  ).current;

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
        // Friendly copy regardless of native code (e.g. -61440 =
        // errSecMissingEntitlement). Native code is already logged in dev
        // and on the server.
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
    setStep("email");
  };

  const onContinueEmail = async () => {
    // Record intent up-front so the funnel reflects every Continue tap,
    // even ones that fail email validation. Otherwise shoppers who fat-
    // finger their email never show up as a "continue" action and the
    // sign-in conversion looks artificially low.
    recordAction("continue");
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
    setStep(r.exists ? "passwordLogin" : "signup");
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
    onAuthSuccess();
  };

  const onSubmitSignup = async () => {
    setSignupError(null);
    setSignupBusy(true);
    const r = await createAccountWithEmail(register, {
      email,
      password,
      firstName,
      lastName,
    });
    setSignupBusy(false);
    if (!r.ok) {
      if (r.code === "email_exists") {
        setSignupError(null);
        setPassword("");
        setStep("passwordLogin");
        return;
      }
      setSignupError(errorText(r));
      return;
    }
    onAuthSuccess();
  };

  const onApple = async () => {
    recordAction("apple");
    setSocialError(null);
    setSocialBusy("apple");
    const r = await signInWithApple(applySession);
    setSocialBusy(null);
    if (r.ok) {
      onAuthSuccess();
      return;
    }
    if (r.code === "canceled") return;
    setSocialError(errorText(r));
  };

  const onGoogle = async () => {
    recordAction("google");
    setSocialError(null);
    setSocialBusy("google");
    const r = await signInWithGoogle(applySession);
    setSocialBusy(null);
    if (r.ok) {
      onAuthSuccess();
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
      const loginParam = url.searchParams.get("login");
      if (!key || !loginParam) {
        setPasteLinkError(t.authForgotPasteLinkInvalid);
        return;
      }
      const qs = new URLSearchParams({ key, login: loginParam }).toString();
      setPasteLinkError(null);
      onClose();
      router.push(`/reset-password?${qs}` as never);
    } catch {
      setPasteLinkError(t.authForgotPasteLinkInvalid);
    }
  };

  const isFirstStep = step === "email";
  const headerIcon: keyof typeof Feather.glyphMap = isFirstStep
    ? "x"
    : isRTL
    ? "chevron-right"
    : "chevron-left";
  const onHeaderPress = isFirstStep ? onClose : goBackStep;
  const headerLabel = isFirstStep ? t.authClose : t.authBack;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.45)", opacity: backdropOpacity },
            ]}
          />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <View style={{ flex: 1 }} pointerEvents="none" />
          <Animated.View
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: sheetMaxHeight,
              transform: [
                { translateY: Animated.add(slideTranslate, dragY) },
              ],
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: -4 },
              elevation: 20,
            }}
          >
            <View {...panResponder.panHandlers}>
              <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
                <View
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.border,
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingTop: 4,
                  paddingBottom: 4,
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
                  <Feather name={headerIcon} size={22} color={colors.primary} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 4,
                paddingBottom: Math.max(insets.bottom, 16) + 24,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {step === "email" ? (
                <View style={{ gap: 16 }}>
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
                    onOpenPrivacy={() => {
                      onClose();
                      router.push("/privacy");
                    }}
                    onOpenTerms={() => {
                      onClose();
                      router.push("/terms");
                    }}
                  />
                  <Pressable
                    onPress={() => {
                      recordAction("guest");
                      onContinueAsGuest();
                    }}
                    disabled={emailBusy || socialBusy !== null}
                    accessibilityRole="button"
                    accessibilityLabel={t.checkoutAsGuest}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: colors.primary,
                      backgroundColor: colors.background,
                      paddingVertical: 16,
                      borderRadius: 14,
                      alignItems: "center",
                      opacity:
                        emailBusy || socialBusy !== null
                          ? 0.5
                          : pressed
                          ? 0.85
                          : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        letterSpacing: 0.6,
                      }}
                    >
                      {t.checkoutAsGuest}
                    </Text>
                  </Pressable>
                </View>
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
                  email={email}
                  firstName={firstName}
                  lastName={lastName}
                  password={password}
                  onFirstNameChange={(v) => {
                    setFirstName(v);
                    if (signupError) setSignupError(null);
                  }}
                  onLastNameChange={(v) => {
                    setLastName(v);
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
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

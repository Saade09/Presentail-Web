const baseConfig = require("./app.json");

// Wrap the static app.json so we can inject build-time secrets (the Google
// reversed iOS client id) into the @react-native-google-signin/google-signin
// plugin without committing real client ids to source control.
//
// Set EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID as an EAS secret (or local
// env var). It must look like:
//   com.googleusercontent.apps.123456789-abcdef
// (i.e. the iOS client id reversed, exactly as Google Cloud shows it under
// "iOS URL scheme"). If it isn't set or is in the wrong format, we derive
// it from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
// (e.g. "123456789-abcdef.apps.googleusercontent.com" →
//        "com.googleusercontent.apps.123456789-abcdef") so a misconfigured
// secret doesn't break `expo start` / prebuild. When neither is available
// we fall back to a placeholder so `expo doctor` still works in dev —
// Google sign-in will simply be non-functional until a real value is set.
function deriveReversedFromIosClientId(iosClientId) {
  if (!iosClientId) return null;
  const suffix = ".apps.googleusercontent.com";
  if (!iosClientId.endsWith(suffix)) return null;
  const base = iosClientId.slice(0, -suffix.length);
  return `com.googleusercontent.apps.${base}`;
}

function resolveReversedIosClientId() {
  const reversed = process.env.EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID;
  if (reversed && reversed.startsWith("com.googleusercontent.apps.")) {
    return reversed;
  }
  const derived = deriveReversedFromIosClientId(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
  if (derived) return derived;
  return "com.googleusercontent.apps.unconfigured";
}

const PLACEHOLDER_REVERSED = "com.googleusercontent.apps.unconfigured";

module.exports = ({ config: _config }) => {
  const expo = { ...baseConfig.expo };
  const reversedIosClientId = resolveReversedIosClientId();

  // Fail loudly if a non-development EAS build would ship the placeholder
  // reversed iOS client id. Without it, iOS will refuse to open the Google
  // sign-in sheet and sign-in will appear to fail instantly. Allow the
  // placeholder during local `expo start` / `expo doctor` (when EAS_BUILD
  // is unset) so day-to-day dev still works without the secret set.
  if (
    reversedIosClientId === PLACEHOLDER_REVERSED &&
    process.env.EAS_BUILD === "true" &&
    process.env.EAS_BUILD_PROFILE !== "development"
  ) {
    throw new Error(
      "Google sign-in is misconfigured for this EAS build: neither " +
        "EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID nor a derivable " +
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set as an EAS secret. " +
        "Add both EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID and " +
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID via `eas secret:create` and " +
        "trigger a fresh build, otherwise iOS will refuse to open the " +
        "Google account picker.",
    );
  }

  expo.plugins = [
    ...(expo.plugins ?? []),
    [
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: reversedIosClientId },
    ],
  ];

  return expo;
};

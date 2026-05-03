const baseConfig = require("./app.json");

// Wrap the static app.json so we can inject build-time secrets (the Google
// reversed iOS client id) into the @react-native-google-signin/google-signin
// plugin without committing real client ids to source control. Set
// EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID as an EAS secret (or local env
// var) before building. When unset we fall back to a placeholder so `expo
// prebuild`/`expo doctor` still work in dev — Google sign-in will simply be
// non-functional until a real value is configured.
module.exports = ({ config: _config }) => {
  const expo = { ...baseConfig.expo };
  const reversedIosClientId =
    process.env.EXPO_PUBLIC_GOOGLE_REVERSED_IOS_CLIENT_ID ??
    "com.googleusercontent.apps.unconfigured";

  expo.plugins = [
    ...(expo.plugins ?? []),
    [
      "@react-native-google-signin/google-signin",
      { iosUrlScheme: reversedIosClientId },
    ],
  ];

  return expo;
};

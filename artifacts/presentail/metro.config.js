const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // @stripe/stripe-react-native uses native-only codegen specs that crash
    // the web bundler. Redirect to a no-op shim so the Expo web preview
    // and any CI web build still work. The shim is never executed on
    // iOS/Android — those builds use the real native module.
    if (
      platform === "web" &&
      moduleName === "@stripe/stripe-react-native"
    ) {
      return {
        filePath: path.resolve(__dirname, "__mocks__/stripe-react-native.js"),
        type: "sourceFile",
      };
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;

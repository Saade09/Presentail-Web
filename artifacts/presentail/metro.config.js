const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  // Hoist pnpm phantom deps that transitive packages expect to find but pnpm
  // doesn't hoist by default. Add entries here whenever Metro reports
  // "Unable to resolve <pkg>" from a node_modules path.
  extraNodeModules: {
    "react-async-hook": path.resolve(
      __dirname,
      "node_modules/react-async-hook"
    ),
  },
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
    // react-native-country-picker-modal lists react-async-hook as a dependency
    // but pnpm's strict isolation prevents Metro from finding it transitively.
    // Redirect to the copy installed as a direct dependency of this workspace.
    if (moduleName === "react-async-hook") {
      return {
        filePath: path.resolve(
          __dirname,
          "node_modules/react-async-hook/dist/react-async-hook.cjs.development.js"
        ),
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

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  define: {
    // React Native / Expo build-time constant — not injected by Vite.
    __DEV__: false,
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "lib/**/*.test.ts",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Vite cannot parse react-native's Flow-typed index.js. This alias
      // intercepts ESM imports of "react-native" that Vite transforms (test
      // files and their direct imports). CJS require() calls from node_modules
      // packages are intercepted by the vi.mock("react-native") in setup.ts.
      "react-native": path.resolve(__dirname, "tests/__mocks__/react-native.ts"),
    },
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Builds dist/public once (if missing) so the serve.mjs suites can start it.
    globalSetup: ["./src/test-global-setup.ts"],
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "*.test.mjs"],
    testTimeout: 10000,
  },
});

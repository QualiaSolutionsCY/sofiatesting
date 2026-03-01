import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/edge-functions/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["supabase/functions/sophia-bot/**/*.ts"],
      exclude: [
        "supabase/functions/sophia-bot/index.ts", // Entry point
        "supabase/functions/sophia-bot/**/*.d.ts",
      ],
    },
    testTimeout: 10_000,
    // Mock Deno globals for tests
    setupFiles: ["./tests/unit/edge-functions/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});

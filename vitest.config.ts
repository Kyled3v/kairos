import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit + evaluation suites only. Playwright E2E specs
    // (tests/e2e/*.spec.mjs) run through their own runner:
    //   npx playwright test
    include: ["tests/**/*.test.ts", "evals/**/*.test.ts"],
    exclude: ["tests/e2e/**", "**/node_modules/**"],
  },
});

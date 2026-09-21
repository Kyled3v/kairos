import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  // Parallel browser launches crash chromium on constrained dev machines
  // ("session closed"); serial workers keep local runs reliable. CI
  // runners have more headroom.
  workers: process.env.CI ? 4 : 1,
  use: {
    baseURL: "http://localhost:4173",
    headless: true,
  },
  webServer: {
    command: "node tests/e2e/static-server.mjs",
    port: 4173,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});

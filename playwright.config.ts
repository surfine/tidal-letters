import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.mjs",
  testMatch: "**/*.spec.mjs",
  timeout: 120_000,
  use: { trace: "retain-on-failure" },
  reporter: [["list"]],
});

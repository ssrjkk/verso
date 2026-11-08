import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "node tests/e2e/serve.mjs",
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 420 * 1000,
    env: {
      DATABASE_URL: "file:./prisma/e2e.db",
      AUTH_RATELIMIT: "off",
      BETTER_AUTH_SECRET: "e2e-test-secret-32-chars-minimum!!",
      BETTER_AUTH_URL: "http://localhost:3100",
      NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    // workers: 1 — все тесты делят e2e.db и public/uploads, параллель даёт гонки.
    { name: "chromium", dependencies: ["setup"], use: { ...devices["Desktop Chrome"] } },
  ],
  workers: 1,
});

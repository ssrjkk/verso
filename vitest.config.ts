import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts"],
      // Пол покрытия: UI-страницы в основном проверяются e2e, поэтому
      // общий процент ниже, чем у серверного слоя. Порог ловит регрессии.
      thresholds: {
        statements: 45,
        branches: 42,
        functions: 32,
        lines: 45,
      },
    },
  },
});

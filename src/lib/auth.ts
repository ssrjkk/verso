import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { applySignupRolePolicy } from "./first-admin";

// Fail fast: запуск в проде с дефолтным/демо/коротким секретом = скомпрометированные сессии.
// NEXT_PHASE исключает фазу сборки (там секреты не нужны, только статический анализ роутов).
// VERSO_TEST_HARNESS=1 — явная маркировка e2e на throwaway-БД (не переиспользуем
// AUTH_RATELIMIT, чтобы отключение лимита не ослабляло проверку секрета).
// НИКОГДА не выставлять в проде (см. .env.example).
const isTestHarness =
  process.env.VERSO_TEST_HARNESS === "1" || process.env.NODE_ENV === "test";
const secret = process.env.BETTER_AUTH_SECRET;
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PHASE?.includes("build") &&
  !isTestHarness &&
  (!secret || secret.length < 32 || /change-me|test|demo|secret123/i.test(secret))
) {
  throw new Error(
    "BETTER_AUTH_SECRET must be a random value of at least 32 characters in production",
  );
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  // В e2e (AUTH_RATELIMIT=off) отключаем троттлинг входов, иначе пачка
  // параллельных тестов упирается в 429 и падает flaky-таймаутами.
  rateLimit: { enabled: process.env.AUTH_RATELIMIT !== "off" },
  session: { expiresIn: 60 * 60 * 24 * 7 },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.TRUSTED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  ].filter((v): v is string => Boolean(v)),
  user: {
    additionalFields: {
      // Роль НЕ принимается от клиента (input: false) и по умолчанию VIEWER.
      // Повышение — только через user.setRole администратором.
      role: { type: "string", defaultValue: "VIEWER", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Bootstrap пустой инсталляции: первый зарегистрированный
        // пользователь становится ADMIN. Дальнейшие signup — VIEWER.
        after: async (user) => {
          try {
            await applySignupRolePolicy(prisma, user.id);
          } catch (e) {
            console.error("[auth] applySignupRolePolicy failed:", e);
          }
        },
      },
    },
  },
});

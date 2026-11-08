import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

// Fail fast: запуск в проде с дефолтным/демо-секретом = скомпрометированные сессии.
// NEXT_PHASE исключает фазу сборки (там секреты не нужны, только статический анализ роутов).
// AUTH_RATELIMIT=off маркирует тестовый харнес (e2e на throwaway-БД) —
// НИКОГДА не выставлять в проде (см. .env.example).
const isTestHarness = process.env.AUTH_RATELIMIT === "off" || process.env.NODE_ENV === "test";
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PHASE?.includes("build") &&
  !isTestHarness &&
  (!process.env.BETTER_AUTH_SECRET || /change-me|test|demo|secret123/i.test(process.env.BETTER_AUTH_SECRET))
) {
  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value in production");
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
      role: { type: "string", defaultValue: "ADMIN", required: false },
    },
  },
});

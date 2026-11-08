import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

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

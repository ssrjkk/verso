/**
 * Демо-доступы и защита от запуска сида на проде.
 *
 * `npm run db:seed` создаёт пользователей с общеизвестным паролем. На
 * production-инстансе это мгновенный захват админки, поэтому сид требует
 * явного `SEED_ALLOW=1` (осознанное решение оператора), а форма входа
 * подставляет демо-креды только вне production.
 */
export const DEMO_ADMIN_EMAIL = "admin@verso.dev";
export const DEMO_PASSWORD = "Test12345!";

export function assertSeedAllowed(
  env: { NODE_ENV?: string; SEED_ALLOW?: string } = process.env,
): void {
  if (env.NODE_ENV === "production" && env.SEED_ALLOW !== "1") {
    throw new Error(
      "Refusing to seed demo users in production. Set SEED_ALLOW=1 only for a throwaway instance.",
    );
  }
}

export function demoCredentials(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): { email: string; password: string } {
  if (nodeEnv === "production") return { email: "", password: "" };
  return { email: DEMO_ADMIN_EMAIL, password: DEMO_PASSWORD };
}

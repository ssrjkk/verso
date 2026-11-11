import { appRouter } from "@/server/routers/_app";

export type TestRole = "ADMIN" | "MANAGER" | "VIEWER";

/** tRPC caller с подменённым prisma: тестируем реальные процедуры, не копии логики. */
export function caller(role: TestRole | null, prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: role
      ? ({ id: `u-${role}`, email: `${role.toLowerCase()}@test.dev`, name: role, role } as never)
      : undefined,
  } as never);
}

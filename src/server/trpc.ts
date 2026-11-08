import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export type Role = "ADMIN" | "MANAGER" | "VIEWER";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });
  return {
    prisma,
    session,
    user: session?.user as
      | { id: string; email: string; name: string; role: Role }
      | undefined,
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Доступно всем авторизованным (ADMIN, MANAGER, VIEWER — чтение)
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Требуется авторизация" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Доступно только ADMIN и MANAGER (создание и редактирование контента)
export const editorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role === "VIEWER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Роль VIEWER доступна только для чтения",
    });
  }
  return next({ ctx });
});

// Доступно только ADMIN (схемы коллекций, API-ключи, удаление)
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Требуются права администратора (ADMIN)",
    });
  }
  return next({ ctx });
});

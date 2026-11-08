import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, createTRPCRouter } from "../trpc";
import {
  LastAdminError,
  OwnRoleChangeError,
  UserNotFoundError,
  setUserRole,
} from "@/lib/roles";

const Role = z.enum(["ADMIN", "MANAGER", "VIEWER"]);

/**
 * Управление пользователями. Весь роутер — только ADMIN.
 * Инварианты смены роли — в src/lib/roles.ts (настоящая транзакция).
 */
export const userRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ),

  setRole: adminProcedure
    .input(z.object({ userId: z.string().min(1), role: Role }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setUserRole(ctx.prisma, ctx.user.id, input.userId, input.role);
      } catch (e) {
        if (e instanceof OwnRoleChangeError) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Нельзя менять собственную роль" });
        }
        if (e instanceof LastAdminError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Нельзя понизить последнего администратора",
          });
        }
        if (e instanceof UserNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Пользователь не найден" });
        }
        throw e;
      }
    }),
});

export type UserRouter = typeof userRouter;

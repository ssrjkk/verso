import type { PrismaClient } from "@prisma/client";

export const ROLES = ["ADMIN", "MANAGER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export class OwnRoleChangeError extends Error {}
export class LastAdminError extends Error {}
export class UserNotFoundError extends Error {}

const USER_SELECT = { id: true, name: true, email: true, role: true } as const;

/**
 * Смена роли с двумя инвариантами:
 * - нельзя менять собственную роль;
 * - нельзя понизить последнего ADMIN.
 *
 * Demote выполняется условным UPDATE: подзапрос COUNT вычисляется в момент
 * записи, поэтому две параллельные смены не могут оставить систему без
 * администратора. Первая инструкция транзакции при demote — запись, значит
 * SQLite сериализует писателей и вторая видит уже новое состояние.
 */
export async function setUserRole(
  prisma: PrismaClient,
  actorId: string,
  targetId: string,
  role: Role,
) {
  if (targetId === actorId) throw new OwnRoleChangeError();

  return prisma.$transaction(async (tx) => {
    if (role !== "ADMIN") {
      const changed = await tx.$executeRawUnsafe(
        `UPDATE "User" SET role = ? WHERE id = ? AND role = 'ADMIN' AND (SELECT COUNT(*) FROM "User" WHERE role = 'ADMIN') > 1`,
        role,
        targetId,
      );
      if (Number(changed) === 1) {
        // ORM-запись обновляет @updatedAt.
        return tx.user.update({ where: { id: targetId }, data: { role }, select: USER_SELECT });
      }
    }

    const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true } });
    if (!target) throw new UserNotFoundError();
    if (target.role === "ADMIN" && role !== "ADMIN") throw new LastAdminError();

    return tx.user.update({ where: { id: targetId }, data: { role }, select: USER_SELECT });
  });
}

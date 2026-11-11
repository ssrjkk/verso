import { beforeEach, describe, expect, it, vi } from "vitest";

const roles = vi.hoisted(() => ({ setUserRole: vi.fn() }));

vi.mock("@/lib/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roles")>();
  return { ...actual, setUserRole: roles.setUserRole };
});

import {
  LastAdminError,
  OwnRoleChangeError,
  UserNotFoundError,
} from "@/lib/roles";
import { caller } from "../helpers/trpc";

function prisma(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      findMany: vi.fn(async () => []),
      ...overrides,
    },
  };
}

beforeEach(() => {
  roles.setUserRole.mockReset();
});

describe("user router", () => {
  it("list доступен только ADMIN и возвращает безопасные поля", async () => {
    const findMany = vi.fn(async () => [{ id: "u1", email: "a@b.c" }]);
    const out = await caller("ADMIN", { user: { findMany } }).user.list();
    expect(out).toEqual([{ id: "u1", email: "a@b.c" }]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("list запрещён MANAGER/VIEWER", async () => {
    await expect(caller("MANAGER", prisma()).user.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("VIEWER", prisma()).user.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("setRole делегирует и возвращает результат", async () => {
    roles.setUserRole.mockResolvedValue({ id: "u2", role: "MANAGER" });
    const out = await caller("ADMIN", prisma()).user.setRole({ userId: "u2", role: "MANAGER" });
    expect(out).toEqual({ id: "u2", role: "MANAGER" });
    expect(roles.setUserRole).toHaveBeenCalledWith(
      expect.anything(),
      "u-ADMIN",
      "u2",
      "MANAGER",
    );
  });

  it("OwnRoleChangeError -> FORBIDDEN", async () => {
    roles.setUserRole.mockRejectedValue(new OwnRoleChangeError());
    await expect(
      caller("ADMIN", prisma()).user.setRole({ userId: "u2", role: "VIEWER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Нельзя менять собственную роль" });
  });

  it("LastAdminError -> CONFLICT", async () => {
    roles.setUserRole.mockRejectedValue(new LastAdminError());
    await expect(
      caller("ADMIN", prisma()).user.setRole({ userId: "u2", role: "VIEWER" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Нельзя понизить последнего администратора" });
  });

  it("UserNotFoundError -> NOT_FOUND", async () => {
    roles.setUserRole.mockRejectedValue(new UserNotFoundError());
    await expect(
      caller("ADMIN", prisma()).user.setRole({ userId: "nope", role: "MANAGER" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Пользователь не найден" });
  });

  it("неизвестная ошибка не маскируется", async () => {
    roles.setUserRole.mockRejectedValue(new Error("boom"));
    await expect(
      caller("ADMIN", prisma()).user.setRole({ userId: "u2", role: "MANAGER" }),
    ).rejects.toThrow("boom");
  });

  it("невалидная роль отклоняется до вызова домена", async () => {
    await expect(
      caller("ADMIN", prisma()).user.setRole({ userId: "u2", role: "OWNER" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(roles.setUserRole).not.toHaveBeenCalled();
  });
});

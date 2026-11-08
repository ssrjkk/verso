import { describe, it, expect, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";

type Role = "ADMIN" | "MANAGER" | "VIEWER";

function user(role: Role) {
  return { id: `u-${role}`, email: `${role.toLowerCase()}@test.dev`, name: role, role };
}

// Минимальный мок призмы: только то, что трогают тестируемые процедуры.
function mockPrisma() {
  const tx = {
    entry: { create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", ...a.data })) },
    revision: { create: vi.fn(async () => ({})) },
    activityLog: { create: vi.fn(async () => ({})) },
  };
  return {
    entry: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    collection: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "c1", ...a.data })),
      delete: vi.fn(async () => ({})),
    },
    pageBlock: { deleteMany: vi.fn(async () => ({})), createMany: vi.fn(async () => ({})) },
    mediaAsset: { findMany: vi.fn(async () => []), delete: vi.fn(async () => ({})) },
    redirect: { findMany: vi.fn(async () => []), delete: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
  };
}

function caller(role: Role | null, prisma: ReturnType<typeof mockPrisma>) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: role ? (user(role) as never) : undefined,
  } as never);
}

describe("RBAC: реальные процедуры, без БД", () => {
  it("unauthenticated: entry.list -> UNAUTHORIZED", async () => {
    const c = caller(null, mockPrisma());
    await expect(c.entry.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("VIEWER: чтение OK, мутации контента -> FORBIDDEN", async () => {
    const c = caller("VIEWER", mockPrisma());
    await expect(c.entry.list({})).resolves.toEqual([]);
    await expect(c.collection.list()).resolves.toEqual([]);
    await expect(c.entry.create({ collectionId: "c1", title: "T" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.entry.publish({ id: "e1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.media.remove({ id: "m1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.seo.upsertRedirect({ fromPath: "/a", toPath: "/b" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.entry.remove({ id: "e1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("MANAGER: контент OK, ADMIN-зона -> FORBIDDEN", async () => {
    const p = mockPrisma();
    const c = caller("MANAGER", p);
    await expect(c.entry.create({ collectionId: "c1", title: "T" })).resolves.toMatchObject({ id: "e1" });
    expect(p.$transaction).toHaveBeenCalledTimes(1);
    await expect(c.collection.create({ name: "N" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.apiKey.create({ name: "k" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.media.remove({ id: "m1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.entry.remove({ id: "e1" })).resolves.toEqual({ ok: true });
  });

  it("entry.update: stale expectedUpdatedAt -> CONFLICT, fresh -> OK (атомарно)", async () => {
    const mk = (stored: Date) => {
      const tx = {
        entry: {
          findUnique: vi.fn(async () => ({ updatedAt: stored })),
          update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", status: "DRAFT", ...a.data })),
        },
        revision: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
      };
      const prisma = { ...mockPrisma(), $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
      return { tx, prisma, caller: caller("MANAGER", prisma) };
    };
    const stored = new Date("2026-01-01T00:00:00.000Z");
    const stale = mk(stored);
    await expect(
      stale.caller.entry.update({ id: "e1", title: "X", expectedUpdatedAt: new Date("2026-06-01T00:00:00.000Z").toISOString() }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(stale.tx.entry.update).not.toHaveBeenCalled();
    expect(stale.tx.revision.create).not.toHaveBeenCalled();

    const fresh = mk(stored);
    const out = await fresh.caller.entry.update({ id: "e1", title: "X", expectedUpdatedAt: stored.toISOString() });
    expect((out as { title: string }).title).toBe("X");
    expect(fresh.tx.revision.create).toHaveBeenCalledTimes(1);
  });

  it("ADMIN: всё OK", async () => {
    const c = caller("ADMIN", mockPrisma());
    await expect(c.entry.list({})).resolves.toEqual([]);
    await expect(c.entry.create({ collectionId: "c1", title: "T" })).resolves.toMatchObject({ id: "e1" });
    await expect(c.collection.create({ name: "N" })).resolves.toMatchObject({ id: "c1" });
  });
});

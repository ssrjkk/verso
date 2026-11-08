import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("node:fs/promises", () => ({ unlink: vi.fn(async () => {}) }));

import { unlink } from "node:fs/promises";
import { appRouter } from "@/server/routers/_app";

afterEach(() => {
  vi.clearAllMocks();
});

function caller(prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role: "ADMIN" } as never,
  } as never);
}

// media.remove обязан чистить и БД, и файл — иначе public/uploads гниёт.
describe("media.remove deletes row + file, never escapes uploads/", () => {
  it("удаляет строку и файл по точному пути", async () => {
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({ id: "m1", url: "/uploads/blog/a.png" })),
        delete: vi.fn(async () => ({})),
      },
    };
    const out = await caller(prisma).media.remove({ id: "m1" });
    expect(out).toEqual({ ok: true });
    expect(prisma.mediaAsset.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(unlink).toHaveBeenCalledTimes(1);
    const target = (unlink as unknown as { mock: { calls: string[][] } }).mock.calls[0][0] as string;
    expect(target.endsWith("a.png")).toBe(true);
    expect(target).toContain("uploads");
  });

  it("нет ассета -> NOT_FOUND, unlink не вызывается", async () => {
    const prisma = { mediaAsset: { findUnique: vi.fn(async () => null), delete: vi.fn() } };
    await expect(caller(prisma).media.remove({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(unlink).not.toHaveBeenCalled();
    expect(prisma.mediaAsset.delete).not.toHaveBeenCalled();
  });

  it("url с выходом за uploads/ -> строка удаляется, файл НЕ трогается", async () => {
    const prisma = {
      mediaAsset: {
        findUnique: vi.fn(async () => ({ id: "m2", url: "/uploads/../../etc/passwd" })),
        delete: vi.fn(async () => ({})),
      },
    };
    await caller(prisma).media.remove({ id: "m2" });
    expect(prisma.mediaAsset.delete).toHaveBeenCalledTimes(1);
    expect(unlink).not.toHaveBeenCalled();
  });
});

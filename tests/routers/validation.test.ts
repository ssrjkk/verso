import { describe, it, expect, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";

function caller(role: "ADMIN" | "MANAGER" = "ADMIN", prisma?: unknown) {
  const mock =
    prisma ??
    ({
      entry: { findMany: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      collection: { findMany: vi.fn(async () => []), create: vi.fn() },
      pageBlock: { deleteMany: vi.fn(), createMany: vi.fn() },
      mediaAsset: { findMany: vi.fn(), delete: vi.fn() },
      redirect: { findMany: vi.fn() },
      webhookEndpoint: { findMany: vi.fn(async () => []), create: vi.fn() },
      apiKey: { create: vi.fn() },
      $transaction: vi.fn(),
    } as never);
  return appRouter.createCaller({
    prisma: mock,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role } as never,
  } as never);
}

// Контракт валидации входов: мусор отклоняется до касания БД.
describe("input validation contracts", () => {
  it("entry.create: пустой title -> ошибка", async () => {
    await expect(caller("MANAGER").entry.create({ collectionId: "c1", title: "" })).rejects.toThrow();
  });

  it("collection.create: пустое name -> ошибка", async () => {
    await expect(caller().collection.create({ name: "" })).rejects.toThrow();
  });

  it("apiKey.create: неверный scope -> ошибка", async () => {
    await expect(caller().apiKey.create({ name: "k", scope: "GODMODE" as never })).rejects.toThrow();
  });

  it("block.upsertMany: неизвестный тип -> ошибка", async () => {
    await expect(
      caller("MANAGER").block.upsertMany({ entryId: "e1", blocks: [{ type: "NOPE" as never, order: 0 }] }),
    ).rejects.toThrow();
  });

  it("webhook.create: кривой url и пустое имя -> ошибка", async () => {
    await expect(caller().webhook.create({ name: "", url: "not-a-url", secret: "s" })).rejects.toThrow();
  });

  it("seo.upsertRedirect: строки путей дергают upsert", async () => {
    const upsert = vi.fn(async () => ({ id: "r1" }));
    await caller("MANAGER", { redirect: { upsert } }).seo.upsertRedirect({ fromPath: "/old", toPath: "/new" });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

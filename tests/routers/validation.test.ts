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

  it("entry.create: title >300 и fieldsJson >200k -> ошибка", async () => {
    await expect(
      caller("MANAGER").entry.create({ collectionId: "c1", title: "x".repeat(301) }),
    ).rejects.toThrow();
    await expect(
      caller("MANAGER").entry.create({ collectionId: "c1", title: "T", fieldsJson: "x".repeat(200_001) }),
    ).rejects.toThrow();
  });

  it("entry.update: seoTitle >200, changeNote >1000 -> ошибка", async () => {
    await expect(caller("MANAGER").entry.update({ id: "e1", seoTitle: "x".repeat(201) })).rejects.toThrow();
    await expect(caller("MANAGER").entry.update({ id: "e1", changeNote: "x".repeat(1001) })).rejects.toThrow();
  });

  it("entry.update: кривой scheduledFor -> 400, валидный ISO -> дальше (не валидация)", async () => {
    await expect(
      caller("MANAGER").entry.update({ id: "e1", scheduledFor: "не дата" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const findUnique = vi.fn(async () => ({ updatedAt: new Date("2026-01-01T00:00:00.000Z") }));
    const tx = {
      entry: { findUnique, update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", status: "DRAFT", ...a.data })) },
      revision: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
    };
    const c = caller("MANAGER", { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) });
    const out = await c.entry.update({ id: "e1", scheduledFor: new Date("2026-05-01T10:00:00.000Z").toISOString() }) as unknown as Record<string, unknown>;
    expect(out).toMatchObject({ id: "e1" });
    expect(findUnique).not.toHaveBeenCalled();
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

  it("entry.create: чужой collectionId/stageId -> NOT_FOUND, а не 500", async () => {
    const prisma = {
      collection: { findUnique: vi.fn(async () => null) },
      workflowStage: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(),
    };
    const c = caller("MANAGER", prisma);
    await expect(c.entry.create({ collectionId: "nope", title: "T" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("entry.publish/moveStage несуществующей записи -> NOT_FOUND", async () => {
    const prisma = {
      entry: { findUnique: vi.fn(async () => null), update: vi.fn() },
      workflowStage: { findUnique: vi.fn(async () => ({ id: "s1", targetState: "DRAFT" })) },
      webhookEndpoint: { findMany: vi.fn(async () => []) },
    };
    const c = caller("MANAGER", prisma);
    await expect(c.entry.publish({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(c.entry.moveStage({ entryId: "nope", stageId: "s1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(prisma.entry.update).not.toHaveBeenCalled();
  });

  it("entry.list: дефолт 200, >1000 отклоняется валидацией", async () => {
    const findMany = vi.fn(async () => []);
    const c = caller("MANAGER", { entry: { findMany } });
    await c.entry.list({});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    await c.entry.list({ limit: 50 });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 50 }));
    await expect(c.entry.list({ limit: 5000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("media.list: дефолт 200, >1000 отклоняется", async () => {
    const findMany = vi.fn(async () => []);
    const c = caller("MANAGER", { mediaAsset: { findMany } });
    await c.media.list({});
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
    await expect(c.media.list({ limit: 9999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("importCsv: csv >5MB -> ошибка", async () => {
    await expect(
      caller("MANAGER").collection.importCsv({ collectionId: "c1", csv: "x".repeat(5_000_001) }),
    ).rejects.toThrow();
  });

  it("task.create: пустой title -> ошибка", async () => {
    await expect(caller("MANAGER").task.create({ title: "" })).rejects.toThrow();
  });

  it("media.create: слишком длинные поля -> ошибка", async () => {
    await expect(
      caller("MANAGER").media.create({ filename: "f", url: "u".repeat(2001), mimeType: "image/png", sizeBytes: 1 }),
    ).rejects.toThrow();
  });

  it("webhook.create: имя >200 и secret >500 -> ошибка", async () => {
    await expect(
      caller().webhook.create({ name: "x".repeat(201), url: "https://a.b/h", secret: "s" }),
    ).rejects.toThrow();
    await expect(
      caller().webhook.create({ name: "n", url: "https://a.b/h", secret: "s".repeat(501) }),
    ).rejects.toThrow();
  });

  it("collection.create: name >200 и schemaJson >200k -> ошибка", async () => {
    await expect(caller().collection.create({ name: "x".repeat(201) })).rejects.toThrow();
    await expect(caller().collection.create({ name: "N", schemaJson: "x".repeat(200_001) })).rejects.toThrow();
  });

  it("importCsv: дубли slug внутри файла -> imported 1, skipped 1", async () => {
    const prisma = {
      entry: {
        findMany: vi.fn(async () => []),
        createMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const out = (await caller("MANAGER", prisma).collection.importCsv({
      collectionId: "c1",
      csv: "title,slug\nSame,same-slug\nSame,same-slug",
    })) as unknown as { imported: number; skipped: number };
    expect(out.imported).toBe(1);
    expect(out.skipped).toBe(1);
  });
});

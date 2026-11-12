import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ testWebhook: vi.fn() }));

vi.mock("@/lib/webhook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhook")>();
  return { ...actual, testWebhook: hooks.testWebhook };
});

import { caller } from "../helpers/trpc";

type MockFn = ReturnType<typeof vi.fn>;

function makeDb() {
  const db = {
    pageBlock: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async () => ({ id: "b1" })),
    },
    workflowStage: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "s1", ...data })),
    },
    mediaAsset: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "m1", ...data })),
      deleteMany: vi.fn(async () => ({ count: 2 })),
      delete: vi.fn(async () => ({ id: "m1" })),
    },
    redirect: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({ id: "r1", ...create })),
      delete: vi.fn(async () => ({ id: "r1" })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "r1", ...data })),
    },
    apiKey: {
      findMany: vi.fn(async () => []),
      // Моделируем select без keyHash: именно это возвращает Prisma.
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "k1",
        name: data.name,
        prefix: data.prefix,
        scope: data.scope,
        lastUsedAt: null,
        expiresAt: data.expiresAt ?? null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      })),
      delete: vi.fn(async () => ({ id: "k1" })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "k1", ...data })),
    },
    webhookEndpoint: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "w1", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "w1", ...data })),
      delete: vi.fn(async () => ({ id: "w1" })),
    },
  };
  return { ...db, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)) };
}

let db: ReturnType<typeof makeDb>;

beforeEach(() => {
  db = makeDb();
  hooks.testWebhook.mockReset();
});

describe("block router", () => {
  it("list: по entryId и order asc", async () => {
    await caller("VIEWER", db).block.list({ entryId: "e1" });
    expect(db.pageBlock.findMany).toHaveBeenCalledWith({
      where: { entryId: "e1" },
      orderBy: { order: "asc" },
    });
  });

  it("upsertMany: delete + createMany с дефолтами + чтение результата", async () => {
    const out = await caller("MANAGER", db).block.upsertMany({
      entryId: "e1",
      blocks: [{ type: "HERO", order: 0 }],
    });

    expect(out).toEqual([]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.pageBlock.deleteMany).toHaveBeenCalledWith({ where: { entryId: "e1" } });
    expect(db.pageBlock.createMany).toHaveBeenCalledWith({
      data: [{ entryId: "e1", type: "HERO", order: 0, isVisible: true, propsJson: "{}" }],
    });
    expect(db.pageBlock.findMany).toHaveBeenCalledWith({
      where: { entryId: "e1" },
      orderBy: { order: "asc" },
    });
  });

  it("remove: удаляет по id", async () => {
    await caller("MANAGER", db).block.remove({ id: "b1" });
    expect(db.pageBlock.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });
});

describe("workflow router", () => {
  it("stages: order asc с записями и коллекцией", async () => {
    await caller("VIEWER", db).workflow.stages();
    expect(db.workflowStage.findMany).toHaveBeenCalledWith({
      orderBy: { order: "asc" },
      include: { entries: { include: { collection: true } } },
    });
  });

  it("createStage: order = count, дефолтный цвет и targetState", async () => {
    (db.workflowStage.count as MockFn).mockResolvedValue(3);
    const out = await caller("ADMIN", db).workflow.createStage({ name: "Новый" });
    expect(out).toMatchObject({ name: "Новый", order: 3, color: "#f97316", targetState: "DRAFT" });
  });

  it("createStage: неизвестный targetState отклоняется до записи", async () => {
    await expect(
      caller("ADMIN", db).workflow.createStage({ name: "Мусор", targetState: "DELETED" as never }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.workflowStage.create).not.toHaveBeenCalled();
  });
});

describe("media router", () => {
  it("list: дефолт take 200 без фильтров", async () => {
    await caller("VIEWER", db).media.list({});
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  it("list: folder=all игнорируется, search и limit применяются", async () => {
    await caller("VIEWER", db).media.list({ folder: "all", search: "logo", limit: 5 });
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { filename: { contains: "logo" } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  });

  it("list: конкретная папка фильтрует", async () => {
    await caller("VIEWER", db).media.list({ folder: "blog" });
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith({
      where: { folder: "blog" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  });

  it("create: валидный managed URL проходит, кривой отклоняется", async () => {
    const input = {
      filename: "a.png",
      url: "/uploads/blog/123e4567-e89b-12d3-a456-426614174000.png",
      mimeType: "image/png",
      sizeBytes: 100,
    };
    await caller("MANAGER", db).media.create(input);
    expect(db.mediaAsset.create).toHaveBeenCalledWith({ data: expect.objectContaining(input) });

    await expect(
      caller("MANAGER", db).media.create({ ...input, url: "https://evil.test/a.png" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("updateAlt и deleteMany", async () => {
    await caller("MANAGER", db).media.updateAlt({ id: "m1", altText: "Alt" });
    expect(db.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { altText: "Alt" },
    });
    await caller("ADMIN", db).media.deleteMany({ ids: ["m1", "m2"] });
    expect(db.mediaAsset.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["m1", "m2"] } } });
  });

  it("stats: считает total, байты и типы", async () => {
    (db.mediaAsset.findMany as MockFn).mockResolvedValue([
      { mimeType: "image/png", sizeBytes: 10 },
      { mimeType: "image/jpeg", sizeBytes: 20 },
      { mimeType: "application/pdf", sizeBytes: 30 },
      { mimeType: "video/mp4", sizeBytes: 40 },
      { mimeType: "text/plain", sizeBytes: 50 },
    ]);
    await expect(caller("VIEWER", db).media.stats()).resolves.toEqual({
      total: 5,
      totalBytes: 150,
      image: 2,
      pdf: 1,
      video: 1,
      other: 1,
    });
  });
});

describe("seo router", () => {
  it("redirects: новые сверху", async () => {
    await caller("VIEWER", db).seo.redirects();
    expect(db.redirect.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  it("upsertRedirect: валидное ребро пишется в транзакции", async () => {
    const out = await caller("MANAGER", db).seo.upsertRedirect({
      fromPath: "/old",
      toPath: "/new",
    });
    expect(out).toMatchObject({ fromPath: "/old", toPath: "/new", statusCode: 301 });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.redirect.upsert).toHaveBeenCalledWith({
      where: { fromPath: "/old" },
      create: { fromPath: "/old", toPath: "/new", statusCode: 301 },
      update: { toPath: "/new", statusCode: 301, isActive: true },
    });
  });

  it.each([
    ["внешний URL", "/old", "https://evil.test/new"],
    ["protocol-relative", "/old", "//evil.test/new"],
    ["сам на себя", "/same", "/same"],
  ])("upsertRedirect отклоняет %s", async (_name, fromPath, toPath) => {
    await expect(
      caller("MANAGER", db).seo.upsertRedirect({ fromPath, toPath }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.redirect.upsert).not.toHaveBeenCalled();
  });

  it("upsertRedirect отклоняет цикл по существующим рёбрам", async () => {
    (db.redirect.findMany as MockFn).mockResolvedValue([{ fromPath: "/b", toPath: "/a" }]);
    await expect(
      caller("MANAGER", db).seo.upsertRedirect({ fromPath: "/a", toPath: "/b" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("removeRedirect/toggleRedirect", async () => {
    await caller("ADMIN", db).seo.removeRedirect({ id: "r1" });
    expect(db.redirect.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    await caller("MANAGER", db).seo.toggleRedirect({ id: "r1", isActive: false });
    expect(db.redirect.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { isActive: false },
    });
  });
});

describe("apiKey router", () => {
  it("list: новые сверху, без keyHash в выборке", async () => {
    await caller("ADMIN", db).apiKey.list();
    expect(db.apiKey.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scope: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  });

  it("create: vrs_live_, sha256-хэш, scope и expiry", async () => {
    const expiresAt = "2027-01-02T03:04:05.000Z";
    const out = (await caller("ADMIN", db).apiKey.create({
      name: "CI",
      scope: "READ_WRITE",
      expiresAt,
    })) as { raw: string };

    expect(out.raw).toMatch(/^vrs_live_[0-9a-f]{48}$/);
    expect(out).not.toHaveProperty("keyHash");
    expect(db.apiKey.create).toHaveBeenCalledWith({
      data: {
        name: "CI",
        prefix: "vrs_live_",
        keyHash: createHash("sha256").update(out.raw).digest("hex"),
        scope: "READ_WRITE",
        expiresAt: new Date(expiresAt),
      },
      select: expect.objectContaining({ id: true, name: true, scope: true }),
    });
  });

  it("create: по умолчанию READ и без срока", async () => {
    await caller("ADMIN", db).apiKey.create({ name: "Read" });
    expect(db.apiKey.create).toHaveBeenCalledWith({
      data: {
        name: "Read",
        prefix: "vrs_live_",
        keyHash: expect.any(String),
        scope: "READ",
        expiresAt: undefined,
      },
      select: expect.objectContaining({ id: true, name: true, scope: true }),
    });
  });

  it("create: кривой expiresAt -> BAD_REQUEST без записи", async () => {
    await expect(
      caller("ADMIN", db).apiKey.create({ name: "Bad", expiresAt: "not-a-date" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.apiKey.create).not.toHaveBeenCalled();
  });

  it("revoke/updateExpiry", async () => {
    await caller("ADMIN", db).apiKey.revoke({ id: "k1" });
    expect(db.apiKey.delete).toHaveBeenCalledWith({ where: { id: "k1" } });

    await caller("ADMIN", db).apiKey.updateExpiry({ id: "k1", expiresAt: null });
    expect(db.apiKey.update).toHaveBeenLastCalledWith({
      where: { id: "k1" },
      data: { expiresAt: null },
    });

    await caller("ADMIN", db).apiKey.updateExpiry({
      id: "k1",
      expiresAt: "2027-02-03T00:00:00.000Z",
    });
    expect(db.apiKey.update).toHaveBeenLastCalledWith({
      where: { id: "k1" },
      data: { expiresAt: new Date("2027-02-03T00:00:00.000Z") },
    });
  });
});

describe("webhook router", () => {
  it("list: новые сверху", async () => {
    await caller("ADMIN", db).webhook.list();
    expect(db.webhookEndpoint.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: "desc" } });
  });

  it("create: передаёт данные как есть", async () => {
    const input = {
      name: "Hook",
      url: "https://example.com/hook",
      secret: "s3cret",
      events: "entry.published",
      isActive: true,
    };
    const out = await caller("ADMIN", db).webhook.create(input);
    expect(out).toMatchObject(input);
    expect(db.webhookEndpoint.create).toHaveBeenCalledWith({ data: input });
  });

  it("create: не-http(s) URL отклоняется до записи", async () => {
    await expect(
      caller("ADMIN", db).webhook.create({
        name: "Hook",
        url: "ftp://example.com/hook",
        secret: "s",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.webhookEndpoint.create).not.toHaveBeenCalled();
  });

  it("update: вынимает id и обновляет остальные поля", async () => {
    await caller("ADMIN", db).webhook.update({
      id: "w1",
      name: "New",
      events: "entry.updated",
    });
    expect(db.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { name: "New", events: "entry.updated" },
    });
  });

  it("toggle/remove", async () => {
    await caller("MANAGER", db).webhook.toggle({ id: "w1", isActive: false });
    expect(db.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { isActive: false },
    });
    await caller("ADMIN", db).webhook.remove({ id: "w1" });
    expect(db.webhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: "w1" } });
  });

  it("test: несуществующий -> NOT_FOUND", async () => {
    await expect(caller("ADMIN", db).webhook.test({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(hooks.testWebhook).not.toHaveBeenCalled();
  });

  it("test: делегирует доставку и возвращает результат", async () => {
    const endpoint = { id: "w1", url: "https://example.com/h", secret: "s", events: "entry.published" };
    (db.webhookEndpoint.findUnique as MockFn).mockResolvedValue(endpoint);
    hooks.testWebhook.mockResolvedValue({ ok: true, status: 200 });

    await expect(caller("ADMIN", db).webhook.test({ id: "w1" })).resolves.toEqual({
      ok: true,
      status: 200,
    });
    expect(hooks.testWebhook).toHaveBeenCalledWith(db, endpoint);
  });
});

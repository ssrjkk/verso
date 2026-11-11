import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ fireWebhooks: vi.fn() }));

vi.mock("@/lib/webhook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhook")>();
  return { ...actual, fireWebhooks: hooks.fireWebhooks };
});

import { caller } from "../helpers/trpc";

type MockFn = ReturnType<typeof vi.fn>;

function makeDb() {
  const db = {
    entry: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "e1",
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "e1",
        status: "DRAFT",
        ...data,
      })),
      delete: vi.fn(async () => ({ id: "e1" })),
    },
    collection: { findUnique: vi.fn(async () => ({ id: "c1" })) },
    workflowStage: { findUnique: vi.fn(async () => null) },
    revision: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
    },
    activityLog: {
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
    pageBlock: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    tag: {
      upsert: vi.fn(async () => ({})),
      findMany: vi.fn(async () => []),
    },
    entryTag: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { ...db, $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)) };
}

let db: ReturnType<typeof makeDb>;

beforeEach(() => {
  db = makeDb();
  hooks.fireWebhooks.mockReset();
});

describe("entry list/get", () => {
  it("list: все фильтры, поиск, лимит и include", async () => {
    await caller("VIEWER", db).entry.list({
      collectionId: "c1",
      status: "DRAFT",
      tagId: "t1",
      search: "hello",
      limit: 10,
    });

    expect(db.entry.findMany).toHaveBeenCalledWith({
      where: {
        collectionId: "c1",
        status: "DRAFT",
        tags: { some: { tagId: "t1" } },
        OR: [{ title: { contains: "hello" } }, { slug: { contains: "hello" } }],
      },
      include: {
        collection: true,
        stage: true,
        tags: { include: { tag: true } },
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
  });

  it("list: без фильтров дефолтный лимит 200", async () => {
    await caller("VIEWER", db).entry.list({});
    expect(db.entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 200 }),
    );
  });

  it("get: блоки, теги, 20 ревизий и автор", async () => {
    await caller("VIEWER", db).entry.get({ id: "e1" });
    expect(db.entry.findUnique).toHaveBeenCalledWith({
      where: { id: "e1" },
      include: {
        collection: true,
        stage: true,
        blocks: { orderBy: { order: "asc" } },
        tags: { include: { tag: true } },
        revisions: { orderBy: { version: "desc" }, take: 20 },
        author: { select: { id: true, name: true } },
      },
    });
  });
});

describe("entry.create", () => {
  it("несуществующая коллекция -> NOT_FOUND без транзакции", async () => {
    (db.collection.findUnique as MockFn).mockResolvedValue(null);
    await expect(
      caller("MANAGER", db).entry.create({ collectionId: "nope", title: "T" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("несуществующий этап -> NOT_FOUND", async () => {
    (db.workflowStage.findUnique as MockFn).mockResolvedValue(null);
    await expect(
      caller("MANAGER", db).entry.create({ collectionId: "c1", title: "T", stageId: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("создаёт запись, ревизию v1 и activity в одной транзакции", async () => {
    const out = await caller("MANAGER", db).entry.create({
      collectionId: "c1",
      title: "Привет мир",
      excerpt: "E",
      fieldsJson: '{"a":1}',
    });

    expect(out).toMatchObject({ slug: "privet-mir", authorId: "u-MANAGER" });
    expect(db.entry.create).toHaveBeenCalledWith({
      data: {
        collectionId: "c1",
        title: "Привет мир",
        slug: "privet-mir",
        excerpt: "E",
        fieldsJson: '{"a":1}',
        stageId: undefined,
        authorId: "u-MANAGER",
      },
    });
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryId: "e1",
        version: 1,
        changeNote: "Первоначальное создание",
        authorId: "u-MANAGER",
      }),
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entryId: "e1", userId: "u-MANAGER", action: "CREATED" }),
    });
  });

  it("VIEWER не создаёт запись", async () => {
    await expect(
      caller("VIEWER", db).entry.create({ collectionId: "c1", title: "T" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("entry.update", () => {
  const current = {
    id: "e1",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    collectionId: "c1",
    slug: "old",
  };

  beforeEach(() => {
    (db.entry.findUnique as MockFn).mockResolvedValue(current);
  });

  it("несуществующая запись -> NOT_FOUND", async () => {
    (db.entry.findUnique as MockFn).mockResolvedValue(null);
    await expect(
      caller("MANAGER", db).entry.update({ id: "nope", title: "T" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stale expectedUpdatedAt -> CONFLICT и никаких записей", async () => {
    await expect(
      caller("MANAGER", db).entry.update({
        id: "e1",
        title: "T",
        expectedUpdatedAt: "2026-01-01T00:00:01.000Z",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.entry.update).not.toHaveBeenCalled();
    expect(db.revision.create).not.toHaveBeenCalled();
  });

  it("совпавший expectedUpdatedAt пропускает обновление", async () => {
    await caller("MANAGER", db).entry.update({
      id: "e1",
      title: "T",
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(db.entry.update).toHaveBeenCalled();
  });

  it("scheduledFor парсится, changeNote и version count+1", async () => {
    (db.revision.count as MockFn).mockResolvedValue(4);
    const scheduledFor = "2027-02-03T04:05:06.000Z";
    await caller("MANAGER", db).entry.update({
      id: "e1",
      title: "T",
      scheduledFor,
      changeNote: "План",
    });

    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { title: "T", scheduledFor: new Date(scheduledFor) },
      include: { blocks: true },
    });
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 5, changeNote: "План" }),
    });
  });

  it("DRAFT -> entry.updated после коммита", async () => {
    await caller("MANAGER", db).entry.update({ id: "e1", title: "T" });
    expect(hooks.fireWebhooks).toHaveBeenCalledWith(
      db,
      "entry.updated",
      expect.objectContaining({ id: "e1", status: "DRAFT" }),
    );
  });

  it("PUBLISHED -> entry.published", async () => {
    (db.entry.update as MockFn).mockResolvedValue({ id: "e1", status: "PUBLISHED" });
    await caller("MANAGER", db).entry.update({ id: "e1", status: "PUBLISHED" });
    expect(hooks.fireWebhooks).toHaveBeenCalledWith(
      db,
      "entry.published",
      expect.objectContaining({ status: "PUBLISHED" }),
    );
  });
});

describe("entry.moveStage", () => {
  it("несуществующий этап/запись -> NOT_FOUND", async () => {
    await expect(
      caller("MANAGER", db).entry.moveStage({ entryId: "e1", stageId: "s1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    (db.workflowStage.findUnique as MockFn).mockResolvedValue({
      id: "s1",
      name: "Публикация",
      targetState: "PUBLISHED",
    });
    await expect(
      caller("MANAGER", db).entry.moveStage({ entryId: "nope", stageId: "s1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("публикующий этап ставит PUBLISHED, пишет activity и стреляет вебхуком", async () => {
    (db.workflowStage.findUnique as MockFn).mockResolvedValue({
      id: "s1",
      name: "Публикация",
      targetState: "PUBLISHED",
    });
    (db.entry.findUnique as MockFn).mockResolvedValue({ id: "e1" });

    await caller("MANAGER", db).entry.moveStage({ entryId: "e1", stageId: "s1" });

    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { stageId: "s1", status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "STAGE_CHANGED", comment: "Этап → Публикация" }),
    });
    expect(hooks.fireWebhooks).toHaveBeenCalledWith(db, "entry.published", expect.anything());
  });

  it("непубликующий этап не ставит publishedAt и не шлёт вебхук", async () => {
    (db.workflowStage.findUnique as MockFn).mockResolvedValue({
      id: "s2",
      name: "Ревью",
      targetState: "IN_REVIEW",
    });
    (db.entry.findUnique as MockFn).mockResolvedValue({ id: "e1" });

    await caller("MANAGER", db).entry.moveStage({ entryId: "e1", stageId: "s2" });

    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { stageId: "s2", status: "IN_REVIEW", publishedAt: undefined },
    });
    expect(hooks.fireWebhooks).not.toHaveBeenCalled();
  });
});

describe("entry.restoreRevision", () => {
  it("ревизия не найдена или принадлежит другой записи -> NOT_FOUND", async () => {
    await expect(
      caller("MANAGER", db).entry.restoreRevision({ entryId: "e1", revisionId: "r1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    (db.revision.findUnique as MockFn).mockResolvedValue({
      id: "r1",
      entryId: "other",
      snapshotJson: "{}",
      version: 1,
    });
    await expect(
      caller("MANAGER", db).entry.restoreRevision({ entryId: "e1", revisionId: "r1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("восстанавливает поля и блоки, пишет новую ревизию и activity", async () => {
    const snapshot = {
      entry: { title: "Old", fieldsJson: '{"x":1}', slug: "old" },
      blocks: [{ type: "HERO", order: 0, propsJson: "{}" }],
    };
    (db.revision.findUnique as MockFn).mockResolvedValue({
      id: "r1",
      entryId: "e1",
      snapshotJson: JSON.stringify(snapshot),
      version: 3,
    });
    (db.revision.count as MockFn).mockResolvedValue(5);

    await caller("MANAGER", db).entry.restoreRevision({ entryId: "e1", revisionId: "r1" });

    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { title: "Old", fieldsJson: '{"x":1}', slug: "old" },
    });
    expect(db.pageBlock.deleteMany).toHaveBeenCalledWith({ where: { entryId: "e1" } });
    expect(db.pageBlock.createMany).toHaveBeenCalledWith({
      data: [{ entryId: "e1", type: "HERO", order: 0, propsJson: "{}" }],
    });
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 6, changeNote: "Откат к v3" }),
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "RESTORED_REVISION", comment: "Откат к версии 3" }),
    });
  });
});

describe("entry.publish/remove", () => {
  it("publish: несуществующая -> NOT_FOUND", async () => {
    await expect(caller("MANAGER", db).entry.publish({ id: "nope" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("publish: статус, publishedAt и вебхук", async () => {
    (db.entry.findUnique as MockFn).mockResolvedValue({ id: "e1" });
    await caller("MANAGER", db).entry.publish({ id: "e1" });
    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });
    expect(hooks.fireWebhooks).toHaveBeenCalledWith(db, "entry.published", expect.anything());
  });

  it("remove: удаляет запись", async () => {
    await caller("MANAGER", db).entry.remove({ id: "e1" });
    expect(db.entry.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});

describe("entry.setTags", () => {
  it("trim, dedupe, лимит 20 и пересоздание связей", async () => {
    const names = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
    (db.tag.findMany as MockFn).mockResolvedValue(names.slice(0, 20).map((name, i) => ({ id: `t${i}`, name })));
    (db.entry.findUnique as MockFn).mockResolvedValue({ id: "e1", tags: [] });

    await caller("MANAGER", db).entry.setTags({
      entryId: "e1",
      tags: ["  a  ", "a", "", "b", ...names],
    });

    expect(db.tag.upsert).toHaveBeenCalledTimes(20);
    expect(db.entryTag.deleteMany).toHaveBeenCalledWith({ where: { entryId: "e1" } });
    expect(db.entryTag.createMany).toHaveBeenCalledWith({
      data: Array.from({ length: 20 }, (_, i) => ({ entryId: "e1", tagId: `t${i}` })),
    });
  });

  it("пустой список: только удаляет связи, без createMany", async () => {
    await caller("MANAGER", db).entry.setTags({ entryId: "e1", tags: [" ", ""] });
    expect(db.tag.upsert).not.toHaveBeenCalled();
    expect(db.entryTag.deleteMany).toHaveBeenCalledWith({ where: { entryId: "e1" } });
    expect(db.entryTag.createMany).not.toHaveBeenCalled();
  });
});

describe("entry activity", () => {
  it("listActivity: последние 50 с автором", async () => {
    await caller("VIEWER", db).entry.listActivity({ entryId: "e1" });
    expect(db.activityLog.findMany).toHaveBeenCalledWith({
      where: { entryId: "e1" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });
  });

  it("addActivity: пишет действие от текущего пользователя", async () => {
    await caller("MANAGER", db).entry.addActivity({
      entryId: "e1",
      action: "COMMENT",
      comment: "Готово",
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: { entryId: "e1", userId: "u-MANAGER", action: "COMMENT", comment: "Готово" },
    });
  });
});

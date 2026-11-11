import { beforeEach, describe, expect, it, vi } from "vitest";
import { caller } from "../helpers/trpc";

type MockFn = ReturnType<typeof vi.fn>;

function makeDb() {
  const db = {
    collection: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "c1", ...data })),
      delete: vi.fn(async () => ({ id: "c1" })),
    },
    entry: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "e1", ...data })),
    },
  };
  return db;
}

let db: ReturnType<typeof makeDb>;

beforeEach(() => {
  db = makeDb();
});

describe("collection list/get", () => {
  it("list: count записей, createdAt asc, дефолтный лимит 500", async () => {
    await caller("VIEWER", db).collection.list();
    expect(db.collection.findMany).toHaveBeenCalledWith({
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  });

  it("list: явный limit", async () => {
    await caller("VIEWER", db).collection.list({ limit: 10 });
    expect(db.collection.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("get: slug + последние 50 записей", async () => {
    await caller("VIEWER", db).collection.get({ slug: "posts" });
    expect(db.collection.findUnique).toHaveBeenCalledWith({
      where: { slug: "posts" },
      include: { entries: { take: 50, orderBy: { updatedAt: "desc" } } },
    });
  });
});

describe("collection mutations", () => {
  it("create: slug из name и дефолты icon/schemaJson", async () => {
    const out = await caller("ADMIN", db).collection.create({
      name: "Новые статьи",
      description: "D",
    });
    expect(out).toMatchObject({
      slug: "novye-stati",
      description: "D",
      icon: "FileText",
      schemaJson: "[]",
    });
  });

  it("create: явный slug нормализуется", async () => {
    const out = await caller("ADMIN", db).collection.create({ name: "X", slug: "My Collection!" });
    expect(out).toMatchObject({ slug: "my-collection" });
  });

  it("update: только переданные поля", async () => {
    await caller("ADMIN", db).collection.update({ id: "c1", name: "New" });
    expect(db.collection.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { name: "New", description: undefined, schemaJson: undefined },
    });
  });

  it("remove: удаляет коллекцию", async () => {
    await caller("ADMIN", db).collection.remove({ id: "c1" });
    expect(db.collection.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("create/update/remove запрещены MANAGER", async () => {
    for (const run of [
      () => caller("MANAGER", db).collection.create({ name: "X" }),
      () => caller("MANAGER", db).collection.update({ id: "c1", name: "X" }),
      () => caller("MANAGER", db).collection.remove({ id: "c1" }),
    ]) {
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("collection exportCsv", () => {
  it("фильтры, лимит 10k и нейтрализация формул", async () => {
    (db.entry.findMany as MockFn).mockResolvedValue([
      {
        title: "=SUM(A1)",
        slug: "sum",
        status: "PUBLISHED",
        updatedAt: new Date("2026-01-02T03:04:05.000Z"),
      },
    ]);

    const csv = await caller("VIEWER", db).collection.exportCsv({
      collectionId: "c1",
      status: "PUBLISHED",
      search: "sum",
    });

    expect(db.entry.findMany).toHaveBeenCalledWith({
      where: {
        collectionId: "c1",
        status: "PUBLISHED",
        OR: [{ title: { contains: "sum" } }, { slug: { contains: "sum" } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 10_000,
    });
    expect(csv).toBe(
      "title,slug,status,updatedAt\r\n'=SUM(A1),sum,PUBLISHED,2026-01-02T03:04:05.000Z",
    );
  });

  it("без поиска не добавляет OR", async () => {
    await caller("VIEWER", db).collection.exportCsv({ collectionId: "c1" });
    expect(db.entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { collectionId: "c1", status: undefined } }),
    );
  });
});

describe("collection importCsv", () => {
  it("пустой CSV ничего не пишет", async () => {
    await expect(
      caller("MANAGER", db).collection.importCsv({ collectionId: "c1", csv: "" }),
    ).resolves.toEqual({ imported: 0, skipped: 0 });
    expect(db.entry.findMany).not.toHaveBeenCalled();
  });

  it("header, пустые title и дубли slug пропускаются", async () => {
    (db.entry.findMany as MockFn).mockResolvedValue([{ slug: "existing" }]);
    const csv = [
      "title,slug",
      "Первая,first",
      ",no-title",
      "Дубль,first",
      "Уже есть,existing",
      "Новая,new-one",
    ].join("\n");

    const out = await caller("MANAGER", db).collection.importCsv({ collectionId: "c1", csv });

    expect(out).toEqual({ imported: 2, skipped: 3, conflicts: 0 });
    expect(db.entry.createMany).toHaveBeenCalledWith({
      data: [
        { collectionId: "c1", title: "Первая", slug: "first", authorId: "u-MANAGER" },
        { collectionId: "c1", title: "Новая", slug: "new-one", authorId: "u-MANAGER" },
      ],
    });
  });

  it("без header: первая колонка title, вторая slug", async () => {
    const out = await caller("MANAGER", db).collection.importCsv({
      collectionId: "c1",
      csv: "Заголовок,my-slug\nВторой,",
    });
    expect(out).toEqual({ imported: 2, skipped: 0, conflicts: 0 });
    expect(db.entry.createMany).toHaveBeenCalledWith({
      data: [
        { collectionId: "c1", title: "Заголовок", slug: "my-slug", authorId: "u-MANAGER" },
        { collectionId: "c1", title: "Второй", slug: "vtoroy", authorId: "u-MANAGER" },
      ],
    });
  });

  it("authorId можно переопределить", async () => {
    await caller("MANAGER", db).collection.importCsv({
      collectionId: "c1",
      csv: "title\nT",
      authorId: "author-x",
    });
    expect(db.entry.createMany).toHaveBeenCalledWith({
      data: [{ collectionId: "c1", title: "T", slug: "t", authorId: "author-x" }],
    });
  });

  it("P2002 на createMany: построчный добор с точным учётом конфликтов", async () => {
    (db.entry.createMany as MockFn).mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    (db.entry.create as MockFn)
      .mockResolvedValueOnce({ id: "e1" })
      .mockRejectedValueOnce(new Error("conflict"));

    const out = await caller("MANAGER", db).collection.importCsv({
      collectionId: "c1",
      csv: "title,slug\nA,a\nB,b\nC,c",
    });

    expect(out).toEqual({ imported: 2, skipped: 1, conflicts: 1 });
    expect(db.entry.create).toHaveBeenCalledTimes(3);
  });

  it("не-P2002 ошибка не проглатывается", async () => {
    (db.entry.createMany as MockFn).mockRejectedValue(new Error("disk full"));
    await expect(
      caller("MANAGER", db).collection.importCsv({ collectionId: "c1", csv: "title\nT" }),
    ).rejects.toThrow("disk full");
  });

  it("VIEWER не может импортировать", async () => {
    await expect(
      caller("VIEWER", db).collection.importCsv({ collectionId: "c1", csv: "title\nT" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { caller } from "../helpers/trpc";

function makeDb() {
  return {
    editorialTask: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "t1", ...data })),
    },
  };
}

let db: ReturnType<typeof makeDb>;

beforeEach(() => {
  db = makeDb();
});

describe("task router", () => {
  it("list: dueDate asc с записью", async () => {
    await caller("VIEWER", db).task.list();
    expect(db.editorialTask.findMany).toHaveBeenCalledWith({
      orderBy: { dueDate: "asc" },
      include: { entry: true },
    });
  });

  it("create: дефолтный приоритет, assignee = текущий пользователь, дата парсится", async () => {
    const dueDate = "2027-01-02T03:04:05.000Z";
    const out = await caller("MANAGER", db).task.create({
      title: "Проверить",
      description: "D",
      dueDate,
      entryId: "e1",
    });

    expect(out).toMatchObject({
      title: "Проверить",
      description: "D",
      priority: "MEDIUM",
      entryId: "e1",
      assigneeId: "u-MANAGER",
      dueDate: new Date(dueDate),
    });
  });

  it("create: явный priority сохраняется, без dueDate — undefined", async () => {
    await caller("MANAGER", db).task.create({ title: "T", priority: "HIGH" });
    expect(db.editorialTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priority: "HIGH", dueDate: undefined }),
    });
  });

  it("toggle обновляет статус", async () => {
    await caller("MANAGER", db).task.toggle({ id: "t1", status: "DONE" });
    expect(db.editorialTask.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { status: "DONE" },
    });
  });

  it("VIEWER не создаёт и не переключает задачи", async () => {
    await expect(
      caller("VIEWER", db).task.create({ title: "T" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("VIEWER", db).task.toggle({ id: "t1", status: "DONE" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

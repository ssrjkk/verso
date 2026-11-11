import { beforeEach, describe, expect, it, vi } from "vitest";

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));
const db = vi.hoisted(() => ({
  collection: { findMany: vi.fn() },
  editorialTask: { create: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authApi.getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET, POST } from "@/app/api/trpc/[trpc]/route";

function url(path: string, input: unknown): string {
  const payload = { "0": { json: input } };
  return `http://localhost/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`;
}

function user(role: "ADMIN" | "MANAGER" | "VIEWER" = "VIEWER") {
  return { id: `u-${role}`, email: `${role.toLowerCase()}@test.dev`, name: role, role };
}

beforeEach(() => {
  vi.clearAllMocks();
  authApi.getSession.mockResolvedValue({ user: user() });
  db.collection.findMany.mockResolvedValue([
    { id: "c1", name: "Статьи", slug: "posts", _count: { entries: 2 } },
  ]);
  db.editorialTask.create.mockResolvedValue({ id: "t1", title: "Новая задача", status: "TODO" });
});

describe("GET/POST /api/trpc/[trpc]", () => {
  it("GET выполняет реальный batch-запрос через контекст и Prisma", async () => {
    const res = await GET(new Request(url("collection.list", { limit: 2 })));

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ result: { data: { json: unknown } } }>;
    expect(body[0].result.data.json).toEqual([
      { id: "c1", name: "Статьи", slug: "posts", _count: { entries: 2 } },
    ]);
    expect(authApi.getSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(db.collection.findMany).toHaveBeenCalledWith({
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
  });

  it("POST выполняет mutation через тот же handler", async () => {
    authApi.getSession.mockResolvedValue({ user: user("MANAGER") });

    const res = await POST(
      new Request("http://localhost/api/trpc/task.create?batch=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "0": { json: { title: "Новая задача" } } }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ result: { data: { json: unknown } } }>;
    expect(body[0].result.data.json).toEqual({ id: "t1", title: "Новая задача", status: "TODO" });
    expect(db.editorialTask.create).toHaveBeenCalledWith({
      data: {
        title: "Новая задача",
        description: undefined,
        priority: "MEDIUM",
        entryId: undefined,
        dueDate: undefined,
        assigneeId: "u-MANAGER",
      },
    });
  });

  it("POST повторяет проверку роли: VIEWER -> FORBIDDEN", async () => {
    authApi.getSession.mockResolvedValue({ user: user("VIEWER") });

    const res = await POST(
      new Request("http://localhost/api/trpc/task.create?batch=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ "0": { json: { title: "Новая задача" } } }),
      }),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as Array<{
      error: { json: { data: { code: string }; message: string } };
    }>;
    expect(body[0].error.json.data.code).toBe("FORBIDDEN");
    expect(db.editorialTask.create).not.toHaveBeenCalled();
  });

  it("без сессии -> UNAUTHORIZED в batch-конверте", async () => {
    authApi.getSession.mockResolvedValue(null);

    const res = await GET(new Request(url("collection.list", { limit: 1 })));

    expect(res.status).toBe(401);
    const body = (await res.json()) as Array<{
      error: { json: { data: { code: string }; message: string } };
    }>;
    expect(body[0].error.json.data.code).toBe("UNAUTHORIZED");
    expect(body[0].error.json.message).toBe("Требуется авторизация");
    expect(db.collection.findMany).not.toHaveBeenCalled();
  });

  it("Zod-ошибка -> 400 и flatten-форма fieldErrors/formErrors", async () => {
    const res = await GET(new Request(url("collection.list", { limit: 0 })));

    expect(res.status).toBe(400);
    const body = (await res.json()) as Array<{
      error: {
        json: {
          data: { code: string; zodError: { fieldErrors: Record<string, string[]>; formErrors: string[] } };
        };
      };
    }>;
    expect(body[0].error.json.data.code).toBe("BAD_REQUEST");
    expect(body[0].error.json.data.zodError.fieldErrors.limit?.length).toBeGreaterThan(0);
    expect(body[0].error.json.data.zodError.formErrors).toEqual([]);
    expect(db.collection.findMany).not.toHaveBeenCalled();
  });
});

import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  entry: { findMany: vi.fn(), create: vi.fn() },
  collection: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  revision: { create: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const limiter = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rate-limit", () => limiter);

import { GET, POST } from "@/app/api/v1/[collection]/route";

const RAW_KEY = "vrs_live_test_key";
const KEY_HASH = createHash("sha256").update(RAW_KEY).digest("hex");

function readKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "k1",
    scope: "READ",
    keyHash: KEY_HASH,
    expiresAt: null,
    lastUsedAt: null,
    ...overrides,
  };
}

function url(collection = "posts") {
  return `http://localhost/api/v1/${collection}`;
}

function getReq(headers: Record<string, string> = {}, collection = "posts") {
  return new NextRequest(url(collection), { headers });
}

function postReq(body: string, headers: Record<string, string> = {}, collection = "posts") {
  return new NextRequest(url(collection), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function params(collection = "posts") {
  return { params: Promise.resolve({ collection }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  limiter.checkRateLimit.mockReturnValue({ ok: true });
  limiter.rateLimitHeaders.mockReturnValue({ "Retry-After": "2" });
  db.apiKey.findUnique.mockResolvedValue(readKey());
  db.apiKey.update.mockResolvedValue({});
  db.entry.findMany.mockResolvedValue([]);
  db.entry.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "e1",
    ...data,
  }));
  db.collection.findUnique.mockResolvedValue({ id: "c1", slug: "posts" });
  db.user.findFirst.mockResolvedValue({ id: "admin1" });
  db.revision.create.mockResolvedValue({});
  db.activityLog.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
});

describe("GET /api/v1/:collection", () => {
  it("без ключа -> 401 и не трогает БД", async () => {
    const res = await GET(getReq(), params());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(db.entry.findMany).not.toHaveBeenCalled();
  });

  it("неизвестный или неполный Bearer -> 401", async () => {
    db.apiKey.findUnique.mockResolvedValue(null);
    const res = await GET(getReq({ authorization: "Bearer nope" }), params());
    expect(res.status).toBe(401);
    expect(db.apiKey.findUnique).toHaveBeenCalledWith({ where: { keyHash: expect.any(String) } });
  });

  it("принимает ключ из Authorization: Bearer", async () => {
    db.apiKey.findUnique.mockImplementation(async ({ where }: { where: { keyHash: string } }) =>
      where.keyHash === KEY_HASH ? readKey() : null,
    );
    const res = await GET(getReq({ authorization: `Bearer ${RAW_KEY}` }), params());
    expect(res.status).toBe(200);
  });

  it("хэширует сырой ключ и не хранит его в открытом виде", async () => {
    await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(db.apiKey.findUnique).toHaveBeenCalledWith({ where: { keyHash: KEY_HASH } });
    expect(JSON.stringify(db.apiKey.findUnique.mock.calls)).not.toContain(RAW_KEY);
  });

  it("истёкший ключ -> 403", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ expiresAt: new Date(Date.now() - 1000) }));
    const res = await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "API key expired" });
  });

  it("валидный ключ -> только PUBLISHED, блоки и теги, новые сверху", async () => {
    db.entry.findMany.mockResolvedValue([{ id: "e1", title: "T" }]);
    const res = await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: "e1", title: "T" }] });
    expect(db.entry.findMany).toHaveBeenCalledWith({
      where: { collection: { slug: "posts" }, status: "PUBLISHED" },
      include: { blocks: { orderBy: { order: "asc" } }, tags: { include: { tag: true } } },
      orderBy: { publishedAt: "desc" },
    });
  });

  it("первый запрос обновляет lastUsedAt", async () => {
    await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(db.apiKey.update).toHaveBeenCalledWith({
      where: { id: "k1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("повторный запрос в пределах минуты не трогает lastUsedAt", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ lastUsedAt: new Date() }));
    await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(db.apiKey.update).not.toHaveBeenCalled();
  });

  it("rate limit -> 429 с Retry-After и без чтения записей", async () => {
    limiter.checkRateLimit.mockReturnValue({ ok: false, retryAfterMs: 1500 });
    const res = await GET(getReq({ "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(await res.json()).toEqual({ error: "Too many requests" });
    expect(db.entry.findMany).not.toHaveBeenCalled();
  });

  it("лимит считается по первому IP из x-forwarded-for", async () => {
    await GET(getReq({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-api-key": RAW_KEY }), params());
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("v1:203.0.113.7", expect.any(Object));
  });
});

describe("POST /api/v1/:collection", () => {
  it("без ключа -> 401", async () => {
    const res = await POST(postReq(JSON.stringify({ title: "T" })), params());
    expect(res.status).toBe(401);
  });

  it("READ-ключ -> 403", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ" }));
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden: READ_WRITE scope required" });
    expect(db.entry.create).not.toHaveBeenCalled();
  });

  it("READ_WRITE, неизвестная коллекция -> 404", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    db.collection.findUnique.mockResolvedValue(null);
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Collection not found" });
  });

  it("битый JSON -> 400", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    const res = await POST(postReq("{broken", { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
  });

  it("без title -> 400", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    const res = await POST(postReq(JSON.stringify({ excerpt: "x" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "title is required" });
  });

  it("в системе нет пользователей -> 500", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    db.user.findFirst.mockResolvedValue(null);
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No users in system" });
  });

  it("создаёт черновик с явным slug и автором-админом", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    const res = await POST(
      postReq(JSON.stringify({ title: "Привет мир", slug: "Hello World!", excerpt: "E" }), {
        "x-api-key": RAW_KEY,
      }),
      params(),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ slug: "hello-world", title: "Привет мир", authorId: "admin1" });
    expect(db.entry.create).toHaveBeenCalledWith({
      data: {
        collectionId: "c1",
        title: "Привет мир",
        slug: "hello-world",
        excerpt: "E",
        fieldsJson: undefined,
        authorId: "admin1",
      },
    });
    expect(db.revision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entryId: "e1",
        version: 1,
        changeNote: "Создание через Headless API",
        authorId: "admin1",
      }),
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entryId: "e1", action: "CREATED", userId: "admin1" }),
    });
  });

  it("без явного slug выводит его из title", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    await POST(postReq(JSON.stringify({ title: "Новая статья" }), { "x-api-key": RAW_KEY }), params());
    expect(db.entry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: "novaya-statya" }) }),
    );
  });

  it("если ADMIN нет, автором становится любой пользователь", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    db.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "viewer1" });
    await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(db.entry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorId: "viewer1" }) }),
    );
  });

  it("конфликт slug (P2002) -> 409", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    db.entry.create.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }));
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Slug already exists in collection" });
  });

  it("прочая ошибка БД -> 500, а не ложный 409", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    db.entry.create.mockRejectedValue(new Error("disk full"));
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to create entry" });
  });

  it("title длиннее 300 -> 400 до записи", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ scope: "READ_WRITE" }));
    const res = await POST(
      postReq(JSON.stringify({ title: "x".repeat(301) }), { "x-api-key": RAW_KEY }),
      params(),
    );
    expect(res.status).toBe(400);
    expect(db.entry.create).not.toHaveBeenCalled();
  });

  it("истёкший ключ -> 403 до проверки scope", async () => {
    db.apiKey.findUnique.mockResolvedValue(readKey({ expiresAt: new Date(Date.now() - 1000) }));
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "API key expired" });
  });

  it("rate limit применяется и к POST", async () => {
    limiter.checkRateLimit.mockReturnValue({ ok: false, retryAfterMs: 5000 });
    const res = await POST(postReq(JSON.stringify({ title: "T" }), { "x-api-key": RAW_KEY }), params());
    expect(res.status).toBe(429);
    expect(db.apiKey.findUnique).not.toHaveBeenCalled();
  });
});

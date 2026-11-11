import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const authMock = vi.hoisted(() => ({ getSession: vi.fn() }));
const db = vi.hoisted(() => ({ mediaAsset: { create: vi.fn() } }));
const fsMock = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
const limiter = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimitHeaders: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authMock.getSession } } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("node:fs/promises", () => fsMock);
vi.mock("@/lib/rate-limit", () => limiter);

import { POST } from "@/app/api/upload/route";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function session(role = "MANAGER", id: string | null = "u1") {
  return { user: { id, role } };
}

function file(name = "photo.png", type = "image/png", bytes = PNG) {
  return new File([bytes], name, { type });
}

function formWith(entries: Record<string, string | File>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.append(key, value);
  return form;
}

function fakeReq(form: FormData | null, headers: Record<string, string> = {}) {
  return {
    headers: new Headers(headers),
    formData: vi.fn(async () => {
      if (!form) throw new Error("not multipart");
      return form;
    }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getSession.mockResolvedValue(session());
  limiter.checkRateLimit.mockReturnValue({ ok: true });
  limiter.rateLimitHeaders.mockReturnValue({ "Retry-After": "3" });
  fsMock.mkdir.mockResolvedValue(undefined);
  fsMock.writeFile.mockResolvedValue(undefined);
  db.mediaAsset.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "m1",
    ...data,
  }));
});

describe("POST /api/upload", () => {
  it("без сессии -> 403", async () => {
    authMock.getSession.mockResolvedValue(null);
    const res = await POST(fakeReq(formWith({ file: file() })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("VIEWER -> 403, даже с валидным файлом", async () => {
    authMock.getSession.mockResolvedValue(session("VIEWER"));
    const res = await POST(fakeReq(formWith({ file: file() })));
    expect(res.status).toBe(403);
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rate limit -> 429 с Retry-After", async () => {
    limiter.checkRateLimit.mockReturnValue({ ok: false, retryAfterMs: 2500 });
    const res = await POST(fakeReq(formWith({ file: file() })));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });

  it("лимит по пользователю, без id — по IP", async () => {
    await POST(fakeReq(formWith({ file: file() })));
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("upload:user:u1", expect.any(Object));

    authMock.getSession.mockResolvedValue(session("ADMIN", null));
    await POST(fakeReq(formWith({ file: file() }), { "x-forwarded-for": "203.0.113.5, 10.0.0.1" }));
    expect(limiter.checkRateLimit).toHaveBeenCalledWith("upload:ip:203.0.113.5", expect.any(Object));
  });

  it("не multipart -> 400", async () => {
    const res = await POST(fakeReq(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Ожидается multipart/form-data" });
  });

  it("без поля file -> 400", async () => {
    const res = await POST(fakeReq(formWith({ altText: "x" })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Поле file обязательно" });
  });

  it("запрещённое расширение -> 400", async () => {
    const res = await POST(fakeReq(formWith({ file: file("x.html", "text/html") })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Недопустимое расширение");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("подмена содержимого при правильном расширении -> 400", async () => {
    const res = await POST(
      fakeReq(formWith({ file: file("fake.png", "image/png", new TextEncoder().encode("<script>")) })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Содержимое не соответствует");
    expect(db.mediaAsset.create).not.toHaveBeenCalled();
  });

  it("успешная загрузка: случайное имя, sanitized folder, altText ≤500", async () => {
    const altText = "a".repeat(600);
    const res = await POST(
      fakeReq(
        formWith({
          file: file("Моё фото.png", "image/png"),
          folder: "../../Blog!",
          altText,
        }),
      ),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.asset).toMatchObject({
      filename: "Моё фото.png",
      mimeType: "image/png",
      folder: "blog",
      altText: "a".repeat(500),
      sizeBytes: PNG.byteLength,
    });
    expect(body.asset.url).toMatch(/^\/uploads\/blog\/[0-9a-f-]{36}\.png$/);
    expect(fsMock.mkdir).toHaveBeenCalledWith(expect.stringContaining("uploads"), { recursive: true });
    const written = fsMock.writeFile.mock.calls[0] as [string, Buffer];
    expect(written[0]).toContain("blog");
    expect(written[0].endsWith(".png")).toBe(true);
    expect(Buffer.compare(written[1], Buffer.from(PNG))).toBe(0);
  });

  it("папка по умолчанию root, altText по умолчанию пустой", async () => {
    const res = await POST(fakeReq(formWith({ file: file() })));
    expect(res.status).toBe(201);
    expect(db.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ folder: "root", altText: "" }),
    });
  });

  it("папка из одних спецсимволов схлопывается в root", async () => {
    const res = await POST(fakeReq(formWith({ file: file(), folder: "!!!" })));
    expect(res.status).toBe(201);
    expect(db.mediaAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ folder: "root" }),
    });
  });
});

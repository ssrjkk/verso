import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  redirect: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { proxy } from "@/proxy";

function req(
  pathname: string,
  opts: { method?: string; cookies?: Record<string, string> } = {},
) {
  const headers = new Headers();
  const jar = opts.cookies ?? {};
  const cookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: opts.method ?? "GET",
    headers,
  });
}

const SESSION = { "better-auth.session_token": "session-value" };

function redirectRow(overrides: Record<string, unknown> = {}) {
  return { toPath: "/new", statusCode: 301, isActive: true, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.redirect.findUnique.mockResolvedValue(null);
  db.redirect.update.mockResolvedValue({});
});

describe("proxy: auth guard", () => {
  it("/api/auth пропускается без БД и без guard", async () => {
    const res = await proxy(req("/api/auth/session"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(db.redirect.findUnique).not.toHaveBeenCalled();
  });

  it("защищённый путь без cookie -> /sign-in?next=<path>", async () => {
    const res = await proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/dashboard");
  });

  it("вложенный защищённый путь без cookie тоже редиректится", async () => {
    const res = await proxy(req("/entries/e1"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBe("/entries/e1");
  });

  it("cookie better-auth.session_token пускает", async () => {
    const res = await proxy(req("/dashboard", { cookies: SESSION }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("__Secure- и суффиксные cookie тоже считаются сессией", async () => {
    const variants: Record<string, string>[] = [
      { "__Secure-better-auth.session_token": "v" },
      { "custom-better-auth.session_token": "v" },
    ];
    for (const cookie of variants) {
      const res = await proxy(req("/dashboard", { cookies: cookie }));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("пустое значение cookie не считается сессией", async () => {
    const res = await proxy(req("/dashboard", { cookies: { "better-auth.session_token": "" } }));
    expect(res.status).toBe(307);
  });

  it("похожий, но не защищённый путь не редиректится", async () => {
    const res = await proxy(req("/dashboard-public"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy: SEO redirects", () => {
  it("активный 301: Location + атомарный hits", async () => {
    db.redirect.findUnique.mockResolvedValue(redirectRow());
    const res = await proxy(req("/old-page"));

    expect(db.redirect.findUnique).toHaveBeenCalledWith({
      where: { fromPath: "/old-page" },
      select: { toPath: true, statusCode: true, isActive: true },
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("http://localhost:3000/new");
    expect(db.redirect.update).toHaveBeenCalledWith({
      where: { fromPath: "/old-page" },
      data: { hits: { increment: 1 } },
    });
  });

  it("302 сохраняется, неизвестный код нормализуется в 301", async () => {
    db.redirect.findUnique.mockResolvedValue(redirectRow({ statusCode: 302 }));
    expect((await proxy(req("/a"))).status).toBe(302);

    db.redirect.findUnique.mockResolvedValue(redirectRow({ statusCode: 418 }));
    expect((await proxy(req("/b"))).status).toBe(301);
  });

  it("неактивный/сам-на-себя/невалидный target не редиректит", async () => {
    for (const row of [
      redirectRow({ isActive: false }),
      redirectRow({ toPath: "/same" }),
      redirectRow({ toPath: "//evil.test/x" }),
      redirectRow({ toPath: "https://evil.test/x" }),
      redirectRow({ toPath: "/api/internal" }),
      redirectRow({ toPath: "/_next/static/x" }),
      redirectRow({ toPath: "/a\\b" }),
    ]) {
      db.redirect.findUnique.mockResolvedValue(row);
      const res = await proxy(req(row.toPath === "/same" ? "/same" : "/source"));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
    expect(db.redirect.update).not.toHaveBeenCalled();
  });

  it("query у цели сохраняется", async () => {
    db.redirect.findUnique.mockResolvedValue(redirectRow({ toPath: "/new?utm=1&x=2" }));
    const res = await proxy(req("/old"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/new?utm=1&x=2");
  });

  it("POST/HEAD: HEAD редиректит, POST не ищет правило", async () => {
    db.redirect.findUnique.mockResolvedValue(redirectRow());
    const head = await proxy(req("/old", { method: "HEAD" }));
    expect(head.status).toBe(301);

    db.redirect.findUnique.mockClear();
    const post = await proxy(req("/old", { method: "POST" }));
    expect(post.headers.get("x-middleware-next")).toBe("1");
    expect(db.redirect.findUnique).not.toHaveBeenCalled();
  });

  it.each(["/api/v1/posts", "/_next/static/chunk.js", "/uploads/a.png"])(
    "служебный префикс %s не участвует в редиректах",
    async (path) => {
      const res = await proxy(req(path));
      expect(res.headers.get("x-middleware-next")).toBe("1");
      expect(db.redirect.findUnique).not.toHaveBeenCalled();
    },
  );

  it("ошибка БД не ломает страницу", async () => {
    db.redirect.findUnique.mockRejectedValue(new Error("db down"));
    const res = await proxy(req("/old"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("ошибка инкремента hits не мешает редиректу", async () => {
    db.redirect.findUnique.mockResolvedValue(redirectRow());
    db.redirect.update.mockRejectedValue(new Error("write failed"));
    const res = await proxy(req("/old"));
    expect(res.status).toBe(301);
  });

  it("нет правила -> next без hits", async () => {
    db.redirect.findUnique.mockResolvedValue(null);
    const res = await proxy(req("/nothing"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(db.redirect.update).not.toHaveBeenCalled();
  });
});

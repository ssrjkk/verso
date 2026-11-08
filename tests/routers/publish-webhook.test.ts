import { describe, it, expect, vi, afterEach } from "vitest";
import { appRouter } from "@/server/routers/_app";

afterEach(() => {
  vi.unstubAllGlobals();
});

function caller(role: "ADMIN" | "MANAGER" | "VIEWER", prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u1", email: "u@t.dev", name: "U", role } as never,
  } as never);
}

describe("entry.publish -> webhooks, без БД", () => {
  it("MANAGER: PUBLISHED + fetch с X-Verso-Event", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: { headers?: Record<string, string> }) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const prisma = {
      entry: {
        update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", title: "T", ...a.data })),
      },
      webhookEndpoint: {
        findMany: vi.fn(async () => [
          { url: "https://cms.test/hook", secret: "s3", events: "entry.published,entry.updated", isActive: true },
          { url: "https://cms.test/other", secret: "x", events: "entry.created", isActive: true },
        ]),
      },
    };
    const out = await caller("MANAGER", prisma).entry.publish({ id: "e1" });
    expect(out.status).toBe("PUBLISHED");
    expect(out.publishedAt).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(calledUrl).toBe("https://cms.test/hook");
    expect(calledInit.headers["X-Verso-Event"]).toBe("entry.published");
    // HMAC-подпись вместо голого секрета: проверяема независимо.
    expect(calledInit.headers["X-Verso-Sign"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    const { createHmac } = await import("node:crypto");
    const expected = `sha256=${createHmac("sha256", "s3").update(JSON.stringify({ event: "entry.published", data: out })).digest("hex")}`;
    expect(calledInit.headers["X-Verso-Sign"]).toBe(expected);
  });

  it("VIEWER: FORBIDDEN, вебхук не стреляет", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: { headers?: Record<string, string> }) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const prisma = {
      entry: { update: vi.fn() },
      webhookEndpoint: { findMany: vi.fn(async () => []) },
    };
    await expect(caller("VIEWER", prisma).entry.publish({ id: "e1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

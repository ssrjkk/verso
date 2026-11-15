import { beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: lib.query },
}));

import { GET } from "@/app/api/health/route";

beforeEach(() => {
  lib.query.mockReset();
});

describe("GET /api/health", () => {
  it("200 + ok при доступной БД, ответ не кэшируется", async () => {
    lib.query.mockResolvedValue([{ "1": 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" },
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(lib.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("503 + degraded без текста ошибки и путей", async () => {
    lib.query.mockRejectedValue(new Error("db down: /secret/path"));

    const res = await GET();
    const body = (await res.json()) as unknown;

    expect(res.status).toBe(503);
    expect(body).toEqual({ status: "degraded", checks: { database: "down" } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});

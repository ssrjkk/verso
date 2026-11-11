import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const lib = vi.hoisted(() => ({
  publishDue: vi.fn(),
  prisma: { marker: "prisma" },
}));

vi.mock("@/lib/publish-due", () => ({ publishDue: lib.publishDue }));
vi.mock("@/lib/prisma", () => ({ prisma: lib.prisma }));

import { POST } from "@/app/api/cron/publish-due/route";

const saved = process.env.CRON_SECRET;

function req(auth = "Bearer s3cr3t") {
  return new NextRequest("http://localhost/api/cron/publish-due", {
    method: "POST",
    headers: { authorization: auth },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cr3t";
  lib.publishDue.mockResolvedValue(3);
});

afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

describe("POST /api/cron/publish-due: успешный запуск", () => {
  it("верный секрет публикует просроченные и отдаёт счётчик", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, published: 3 });
    expect(lib.publishDue).toHaveBeenCalledWith(lib.prisma, expect.any(Date));
  });

  it("publishDue получает реальное текущее время", async () => {
    const before = Date.now();
    await POST(req());
    const now = (lib.publishDue.mock.calls[0] as [unknown, Date])[1].getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it("ошибка публикации не маскируется", async () => {
    lib.publishDue.mockRejectedValue(new Error("db down"));
    await expect(POST(req())).rejects.toThrow("db down");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/publish-due/route";

// Маршрут импортирует prisma-синглтон, но пути отказа возвращаются до
// любого обращения к БД — dev.db в тестах не трогается.

const saved = process.env.CRON_SECRET;

afterEach(() => {
  if (saved === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved;
});

function req(auth?: string) {
  return new NextRequest("http://localhost/api/cron/publish-due", {
    method: "POST",
    ...(auth ? { headers: { authorization: auth } } : {}),
  });
}

describe("POST /api/cron/publish-due: авторизация", () => {
  it("без CRON_SECRET — fail closed (503), триггер закрыт", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("Bearer anything"));
    expect(res.status).toBe(503);
  });

  it("без заголовка — 401", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it.each(["Bearer wrong", "Basic czNjcjN0", "s3cr3t"])("неверный формат/секрет (%s) — 401", async (auth) => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await POST(req(auth));
    expect(res.status).toBe(401);
  });
});

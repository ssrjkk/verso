import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { appRouter } from "@/server/routers/_app";

// Контракт P0-B: доставка идёт через node:http(s) с DNS-пиннингом, а не через
// fetch, и является fire-and-forget (сеть не держит публикацию). Поэтому тест
// проверяет реальный провод: локальный echo-сервер, точный HMAC по сырому телу
// и запись lastStatus после доставки. fetch-мок здесь больше не контракт.

type Hit = { path: string; event: string; sign: string; body: string };

let servers: Server[] = [];
let hits: Hit[] = [];
let savedAllowPrivate: string | undefined;

async function echoServer(): Promise<number> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => {
      raw += c.toString();
    });
    req.on("end", () => {
      hits.push({
        path: req.url ?? "",
        event: String(req.headers["x-verso-event"] ?? ""),
        sign: String(req.headers["x-verso-sign"] ?? ""),
        body: raw,
      });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

beforeEach(() => {
  hits = [];
  // Флаг разрешён только тестовому харнессу: доставка идёт на 127.0.0.1.
  savedAllowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE;
  process.env.WEBHOOK_ALLOW_PRIVATE = "1";
});

afterEach(() => {
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
  servers = [];
  if (savedAllowPrivate === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE;
  else process.env.WEBHOOK_ALLOW_PRIVATE = savedAllowPrivate;
});

function caller(role: "ADMIN" | "MANAGER" | "VIEWER", prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u1", email: "u@t.dev", name: "U", role } as never,
  } as never);
}

describe("entry.publish -> webhooks, без БД", () => {
  it("MANAGER: PUBLISHED, доставка на echo с X-Verso-Event и HMAC", async () => {
    const port = await echoServer();
    const prisma = {
      entry: {
        findUnique: vi.fn(async () => ({ id: "e1" })),
        update: vi.fn(async (a: { data: Record<string, unknown> }) => ({
          id: "e1",
          title: "T",
          ...a.data,
        })),
      },
      webhookEndpoint: {
        findMany: vi.fn(async () => [
          {
            id: "w1",
            url: `http://127.0.0.1:${port}/hook`,
            secret: "s3",
            events: "entry.published,entry.updated",
            isActive: true,
          },
          // Не подписан на entry.published — не должен получить запрос.
          {
            id: "w2",
            url: `http://127.0.0.1:${port}/other`,
            secret: "x",
            events: "entry.created",
            isActive: true,
          },
        ]),
        // Контракт P0-B: результат доставки фиксируется в БД (lastStatus).
        update: vi.fn(async () => ({})),
      },
    };

    const out = await caller("MANAGER", prisma).entry.publish({ id: "e1" });
    expect(out.status).toBe("PUBLISHED");
    expect(out.publishedAt).toBeInstanceOf(Date);

    await expect.poll(() => hits.length, { timeout: 5000 }).toBe(1);
    const hit = hits[0];
    expect(hit.path, "событие получил только подписанный endpoint").toBe("/hook");
    expect(hit.event).toBe("entry.published");

    // Подпись проверяется по сырому телу — ровно так, как её проверит получатель.
    expect(hit.sign).toBe(
      `sha256=${createHmac("sha256", "s3").update(hit.body).digest("hex")}`,
    );
    const body = JSON.parse(hit.body) as {
      event: string;
      data: { id: string; status: string };
    };
    expect(body.event).toBe("entry.published");
    expect(body.data.id).toBe("e1");
    expect(body.data.status).toBe("PUBLISHED");

    // lastStatus пишется по факту доставки (после ответа сервера).
    await expect
      .poll(() => prisma.webhookEndpoint.update.mock.calls.length, { timeout: 5000 })
      .toBe(1);
    expect(prisma.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { lastStatus: "200", lastDeliveryAt: expect.any(Date) },
    });
  });

  it("VIEWER: FORBIDDEN, вебхук не стреляет", async () => {
    const port = await echoServer();
    const prisma = {
      entry: {
        findUnique: vi.fn(async () => ({ id: "e1" })),
        update: vi.fn(),
      },
      webhookEndpoint: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
      },
    };

    await expect(caller("VIEWER", prisma).entry.publish({ id: "e1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(prisma.entry.update).not.toHaveBeenCalled();
    expect(prisma.webhookEndpoint.findMany).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hits, `сервер ${port} не должен был получить запрос`).toHaveLength(0);
  });
});

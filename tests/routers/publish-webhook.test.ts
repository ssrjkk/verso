import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/lib/prisma-client";
import { drainWebhookDeliveries } from "@/lib/webhook-outbox";
import { appRouter } from "@/server/routers/_app";

// Kick после коммита — фоновый по контракту. В тесте отключаем его и
// запускаем drain явно: тогда проверка провода и HMAC детерминирована.
vi.mock("@/lib/webhook-outbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhook-outbox")>();
  return { ...actual, kickWebhookDrain: vi.fn() };
});

// Контракт: entry.publish пишет событие в транзакционный outbox, а drain
// доставляет его через node:http(s) с DNS-пиннингом. Проверяем реальный
// провод: SQLite + локальный echo-сервер + точный HMAC по сырому телу.

type Hit = { path: string; event: string; sign: string; body: string };

let dir = "";
let prisma: PrismaClient;
let servers: Server[] = [];
let hits: Hit[] = [];
let savedAllowPrivate: string | undefined;
let seq = 0;

async function echoServer(): Promise<number> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
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

function caller(role: "ADMIN" | "MANAGER" | "VIEWER", client: PrismaClient) {
  return appRouter.createCaller({
    prisma: client,
    session: null,
    user: { id: "u1", email: "u@t.dev", name: "U", role } as never,
  } as never);
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-publish-webhook-"));
  const dbFile = path.join(dir, "test.db").replace(/\\/g, "/");
  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "pipe",
  });
  prisma = createPrismaClient(`file:${dbFile}`);
  await prisma.$connect();
  savedAllowPrivate = process.env.WEBHOOK_ALLOW_PRIVATE;
  process.env.WEBHOOK_ALLOW_PRIVATE = "1";
}, 180000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
  if (savedAllowPrivate === undefined) delete process.env.WEBHOOK_ALLOW_PRIVATE;
  else process.env.WEBHOOK_ALLOW_PRIVATE = savedAllowPrivate;
});

afterEach(() => {
  for (const server of servers) {
    server.closeAllConnections?.();
    server.close();
  }
  servers = [];
});

let entryId = "";

beforeEach(async () => {
  hits = [];
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.revision.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.user.deleteMany();

  seq += 1;
  const stamp = `${Date.now()}-${seq}`;
  await prisma.user.create({
    data: { id: "u1", name: "U", email: `u-${stamp}@t.dev`, role: "MANAGER" },
  });
  const collection = await prisma.collection.create({
    data: { id: `c-${stamp}`, name: "C", slug: `c-${stamp}` },
  });
  entryId = `e-${stamp}`;
  await prisma.entry.create({
    data: {
      id: entryId,
      collectionId: collection.id,
      title: "T",
      slug: "t",
      authorId: "u1",
    },
  });
});

describe("entry.publish -> outbox -> webhooks", () => {
  it("MANAGER: PUBLISHED, доставка на echo с X-Verso-Event и HMAC", async () => {
    const port = await echoServer();
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        id: "w1",
        name: "hook",
        url: `http://127.0.0.1:${port}/hook`,
        secret: "s3",
        events: "entry.published,entry.updated",
        isActive: true,
      },
    });
    // Не подписан на entry.published — не должен получить запрос.
    await prisma.webhookEndpoint.create({
      data: {
        id: "w2",
        name: "other",
        url: `http://127.0.0.1:${port}/other`,
        secret: "x",
        events: "entry.created",
        isActive: true,
      },
    });

    const out = await caller("MANAGER", prisma).entry.publish({ id: entryId });
    expect(out.status).toBe("PUBLISHED");
    expect(out.publishedAt).toBeInstanceOf(Date);

    const queued = await prisma.webhookDelivery.findMany();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      endpointId: endpoint.id,
      event: "entry.published",
      status: "PENDING",
    });

    const drain = await drainWebhookDeliveries(prisma);
    expect(drain).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0 });

    expect(hits).toHaveLength(1);
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
    expect(body.data.id).toBe(entryId);
    expect(body.data.status).toBe("PUBLISHED");

    expect(
      (await prisma.webhookEndpoint.findUnique({ where: { id: endpoint.id } }))
        ?.lastStatus,
    ).toBe("200");
    expect(await prisma.webhookDelivery.findFirst()).toMatchObject({
      status: "DELIVERED",
      attempts: 1,
      responseStatus: 200,
    });
  });

  it("VIEWER: FORBIDDEN, в outbox ничего не попадает", async () => {
    const port = await echoServer();
    await prisma.webhookEndpoint.create({
      data: {
        id: "w1",
        name: "hook",
        url: `http://127.0.0.1:${port}/hook`,
        secret: "s3",
        events: "entry.published",
        isActive: true,
      },
    });

    await expect(
      caller("VIEWER", prisma).entry.publish({ id: entryId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await prisma.webhookDelivery.count()).toBe(0);
    expect(
      (await prisma.entry.findUnique({ where: { id: entryId } }))?.status,
    ).toBe("DRAFT");
    expect(hits).toHaveLength(0);
  });
});

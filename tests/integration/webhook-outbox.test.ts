import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/lib/prisma-client";
import {
  drainWebhookDeliveries,
  enqueueWebhooks,
} from "@/lib/webhook-outbox";

type Hit = { path: string; event: string; sign: string; body: string };

let dir = "";
let prisma: PrismaClient;
let servers: Server[] = [];
let hits: Hit[] = [];
let savedAllowPrivate: string | undefined;
let seq = 0;

async function echoServer(statuses: number[] = [200]): Promise<number> {
  let call = 0;
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
      const status = statuses[Math.min(call, statuses.length - 1)] ?? 200;
      call += 1;
      res.statusCode = status;
      res.end("ok");
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createEndpoint(data: {
  events?: string;
  isActive?: boolean;
  secret?: string;
  port: number;
  path?: string;
}) {
  return prisma.webhookEndpoint.create({
    data: {
      id: uid("w"),
      name: uid("hook"),
      url: `http://127.0.0.1:${data.port}${data.path ?? "/hook"}`,
      secret: data.secret ?? "s3",
      events: data.events ?? "entry.published",
      isActive: data.isActive ?? true,
    },
  });
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-webhook-outbox-"));
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

beforeEach(async () => {
  hits = [];
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
});

describe("webhook outbox", () => {
  it("enqueue: только активные endpoint'ы, подписанные на событие", async () => {
    const active = await createEndpoint({
      port: await echoServer(),
      events: "entry.published,entry.updated",
    });
    await createEndpoint({
      port: await echoServer(),
      events: "entry.published",
      isActive: false,
    });
    await createEndpoint({
      port: await echoServer(),
      events: "entry.updated",
    });

    expect(await enqueueWebhooks(prisma, "entry.published", { id: "e1" })).toBe(1);

    const rows = await prisma.webhookDelivery.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      endpointId: active.id,
      event: "entry.published",
      status: "PENDING",
      attempts: 0,
    });
    expect(JSON.parse(rows[0].payloadJson)).toEqual({ id: "e1" });
  });

  it("drain: успешная доставка, HMAC, lastStatus и без повторов", async () => {
    const port = await echoServer([200]);
    const endpoint = await createEndpoint({ port, secret: "s3" });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1", status: "PUBLISHED" });

    const now = new Date(Date.now() + 60_000);
    const result = await drainWebhookDeliveries(prisma, { now });
    expect(result).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0 });

    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("/hook");
    expect(hits[0].event).toBe("entry.published");
    expect(hits[0].sign).toBe(
      `sha256=${createHmac("sha256", "s3").update(hits[0].body).digest("hex")}`,
    );
    expect(JSON.parse(hits[0].body)).toEqual({
      event: "entry.published",
      data: { id: "e1", status: "PUBLISHED" },
    });

    const row = await prisma.webhookDelivery.findFirst();
    expect(row).toMatchObject({
      status: "DELIVERED",
      attempts: 1,
      responseStatus: 200,
      error: null,
      deliveredAt: now,
      lastAttemptAt: now,
    });
    expect(
      (await prisma.webhookEndpoint.findUnique({ where: { id: endpoint.id } }))?.lastStatus,
    ).toBe("200");

    const second = await drainWebhookDeliveries(prisma, { now });
    expect(second.claimed).toBe(0);
    expect(hits).toHaveLength(1);
  });

  it("retry: 5xx оставляет PENDING с exponential backoff до успеха", async () => {
    const port = await echoServer([500, 200]);
    await createEndpoint({ port });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1" });

    const now = new Date(Date.now() + 60_000);
    const first = await drainWebhookDeliveries(prisma, {
      now,
      baseBackoffMs: 1000,
    });
    expect(first).toEqual({ claimed: 1, delivered: 0, retried: 1, failed: 0 });

    let row = await prisma.webhookDelivery.findFirst();
    expect(row).toMatchObject({
      status: "PENDING",
      attempts: 1,
      responseStatus: 500,
      error: "HTTP 500",
    });
    expect(row?.nextAttemptAt).toEqual(new Date(now.getTime() + 1000));

    // До созревания backoff строка не забирается.
    expect((await drainWebhookDeliveries(prisma, { now, baseBackoffMs: 1000 })).claimed).toBe(0);

    const second = await drainWebhookDeliveries(prisma, {
      now: new Date(now.getTime() + 1000),
      baseBackoffMs: 1000,
    });
    expect(second).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0 });

    row = await prisma.webhookDelivery.findFirst();
    expect(row).toMatchObject({
      status: "DELIVERED",
      attempts: 2,
      responseStatus: 200,
      error: null,
    });
    expect(hits).toHaveLength(2);
  });

  it("permanent failure: после max attempts доставка становится FAILED", async () => {
    const port = await echoServer([500]);
    await createEndpoint({ port });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1" });

    const now = new Date(Date.now() + 60_000);
    const first = await drainWebhookDeliveries(prisma, {
      now,
      maxAttempts: 2,
      baseBackoffMs: 10,
    });
    expect(first.retried).toBe(1);

    const second = await drainWebhookDeliveries(prisma, {
      now: new Date(now.getTime() + 10),
      maxAttempts: 2,
      baseBackoffMs: 10,
    });
    expect(second).toEqual({ claimed: 1, delivered: 0, retried: 0, failed: 1 });

    const row = await prisma.webhookDelivery.findFirst();
    expect(row).toMatchObject({
      status: "FAILED",
      attempts: 2,
      responseStatus: 500,
      error: "HTTP 500",
    });
    expect(
      (await drainWebhookDeliveries(prisma, { now: new Date(now.getTime() + 10_000) }))
        .claimed,
    ).toBe(0);
    expect(hits).toHaveLength(2);
  });

  it("inactive endpoint: событие не отправляется и помечается FAILED", async () => {
    const port = await echoServer([200]);
    const endpoint = await createEndpoint({ port });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1" });
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { isActive: false },
    });

    const result = await drainWebhookDeliveries(prisma);
    expect(result).toEqual({ claimed: 1, delivered: 0, retried: 0, failed: 1 });
    expect(hits).toHaveLength(0);

    const row = await prisma.webhookDelivery.findFirst();
    expect(row).toMatchObject({
      status: "FAILED",
      attempts: 0,
      error: "Endpoint disabled",
    });
  });

  it("параллельные drain'ы отправляют доставку ровно один раз", async () => {
    const port = await echoServer([200]);
    await createEndpoint({ port });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1" });

    const now = new Date(Date.now() + 60_000);
    const [a, b] = await Promise.all([
      drainWebhookDeliveries(prisma, { now }),
      drainWebhookDeliveries(prisma, { now }),
    ]);

    expect(a.claimed + b.claimed).toBe(1);
    expect(a.delivered + b.delivered).toBe(1);
    expect(hits).toHaveLength(1);
    expect((await prisma.webhookDelivery.findFirst())?.status).toBe("DELIVERED");
  });

  it("просроченный lease DELIVERING подхватывается после падения процесса", async () => {
    const port = await echoServer([200]);
    const endpoint = await createEndpoint({ port });
    const now = new Date(Date.now() + 60_000);
    await prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: "entry.published",
        payloadJson: JSON.stringify({ id: "e1" }),
        status: "DELIVERING",
        attempts: 1,
        // Процесс взял lease и умер: срок уже истёк.
        nextAttemptAt: new Date(now.getTime() - 60_000),
      },
    });

    const result = await drainWebhookDeliveries(prisma, { now });
    expect(result).toEqual({ claimed: 1, delivered: 1, retried: 0, failed: 0 });
    expect(hits).toHaveLength(1);
    expect(await prisma.webhookDelivery.findFirst()).toMatchObject({
      status: "DELIVERED",
      attempts: 2,
    });
  });

  it("удаление endpoint каскадно удаляет его доставки", async () => {
    const endpoint = await createEndpoint({ port: await echoServer() });
    await enqueueWebhooks(prisma, "entry.published", { id: "e1" });
    await prisma.webhookEndpoint.delete({ where: { id: endpoint.id } });
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });
});

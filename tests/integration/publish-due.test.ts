import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { publishDue } from "@/lib/publish-due";

let dir = "";
let prisma: PrismaClient;
let servers: Server[] = [];
let hits: Array<{ event: string; body: string }> = [];
let savedAllowPrivate: string | undefined;
let seq = 0;

async function echoServer(): Promise<number> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => {
      raw += c.toString();
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(raw) as { event?: string };
        hits.push({ event: String(req.headers["x-verso-event"] ?? parsed.event ?? ""), body: raw });
      } catch {
        /* ignore malformed */
      }
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

function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function seedEntry(opts: {
  status: string;
  scheduledFor?: Date | null;
  authorId: string;
  collectionId: string;
}): Promise<string> {
  const id = uid("e");
  await prisma.entry.create({
    data: {
      id,
      collectionId: opts.collectionId,
      title: id,
      slug: id,
      status: opts.status,
      scheduledFor: opts.scheduledFor ?? null,
      authorId: opts.authorId,
    },
  });
  return id;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-publish-due-"));
  const dbFile = path.join(dir, "test.db").replace(/\\/g, "/");
  execSync("npx prisma db push", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
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
  for (const s of servers) {
    s.closeAllConnections?.();
    s.close();
  }
  servers = [];
});

let authorId = "";
let collectionId = "";
let hookPort = 0;

beforeEach(async () => {
  hits = [];
  await prisma.revision.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.user.deleteMany();
  const u = uid("u");
  await prisma.user.create({ data: { id: u, name: u, email: `${u}@t.dev`, role: "ADMIN" } });
  authorId = u;
  const c = uid("c");
  await prisma.collection.create({ data: { id: c, name: c, slug: c } });
  collectionId = c;
  hookPort = await echoServer();
  await prisma.webhookEndpoint.create({
    data: {
      id: uid("w"),
      name: "due-hook",
      url: `http://127.0.0.1:${hookPort}/hook`,
      secret: "s",
      events: "entry.published",
      isActive: true,
    },
  });
});

describe("publishDue (real SQLite + real echo webhook)", () => {
  it("просроченная SCHEDULED → PUBLISHED + publishedAt + 1 ревизия + 1 вебхук", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const id = await seedEntry({
      status: "SCHEDULED",
      scheduledFor: new Date("2026-06-01T11:59:00.000Z"),
      authorId,
      collectionId,
    });
    await prisma.pageBlock.create({
      data: { entryId: id, type: "HERO", order: 0, propsJson: '{"title":"Hi"}' },
    });
    const tag = await prisma.tag.create({ data: { name: `tag-${id}` } });
    await prisma.entryTag.create({ data: { entryId: id, tagId: tag.id } });

    const published = await publishDue(prisma, now);
    expect(published).toEqual([id]);

    const row = await prisma.entry.findUnique({ where: { id } });
    expect(row?.status).toBe("PUBLISHED");
    expect(row?.publishedAt).toEqual(now);

    expect(await prisma.revision.count({ where: { entryId: id } })).toBe(1);

    // Снапшот — общий формат buildEntrySnapshot: скаляры без relations,
    // блоки и теги рядом. Иначе откат теряет теги, а блоки дублируются.
    const revision = await prisma.revision.findFirst({ where: { entryId: id } });
    const snapshot = JSON.parse(revision!.snapshotJson) as {
      entry: Record<string, unknown>;
      blocks: unknown[];
      tags?: string[];
    };
    expect(snapshot.entry.blocks).toBeUndefined();
    expect(snapshot.entry.tags).toBeUndefined();
    expect(snapshot.blocks).toHaveLength(1);
    expect(snapshot.tags).toEqual([tag.name]);

    await expect.poll(() => hits.length, { timeout: 5000 }).toBe(1);
    expect(hits[0].event).toBe("entry.published");
    // Payload вебхука должен совпадать по форме с entry.publish — с тегами.
    const payload = JSON.parse(hits[0].body) as {
      data: { tags?: Array<{ tag: { name: string } }> };
    };
    expect(payload.data.tags?.[0]?.tag.name).toBe(tag.name);
    // lastStatus пишется после HTTP-ответа (fire-and-forget): ждём запись в БД,
    // а не читаем однократно — иначе гонка между echo-хитом и update.
    await expect
      .poll(async () => (await prisma.webhookEndpoint.findFirst())?.lastStatus, { timeout: 5000 })
      .toBe("200");
  });

  it("будущая SCHEDULED не трогается", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const id = await seedEntry({
      status: "SCHEDULED",
      scheduledFor: new Date("2026-06-01T12:00:01.000Z"),
      authorId,
      collectionId,
    });

    expect(await publishDue(prisma, now)).toEqual([]);
    expect((await prisma.entry.findUnique({ where: { id } }))?.status).toBe("SCHEDULED");
    expect(await prisma.revision.count({ where: { entryId: id } })).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hits).toHaveLength(0);
  });

  it("SCHEDULED без даты не трогается; PUBLISHED не дублирует ревизию", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const noDate = await seedEntry({ status: "SCHEDULED", authorId, collectionId });
    const live = await seedEntry({
      status: "PUBLISHED",
      scheduledFor: new Date("2020-01-01T00:00:00.000Z"),
      authorId,
      collectionId,
    });

    expect(await publishDue(prisma, now)).toEqual([]);
    expect((await prisma.entry.findUnique({ where: { id: noDate } }))?.status).toBe("SCHEDULED");
    expect(await prisma.revision.count({ where: { entryId: live } })).toBe(0);
  });

  it("повторный прогон идемпотентен: 0 ревизий, 0 вебхуков", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const id = await seedEntry({
      status: "SCHEDULED",
      scheduledFor: new Date("2026-05-01T00:00:00.000Z"),
      authorId,
      collectionId,
    });

    expect(await publishDue(prisma, now)).toEqual([id]);
    await expect.poll(() => hits.length, { timeout: 5000 }).toBe(1);

    expect(await publishDue(prisma, now)).toEqual([]);
    expect(await prisma.revision.count({ where: { entryId: id } })).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(hits).toHaveLength(1);
  });

  it("параллельный двойной прогон: ровно 1 ревизия и 1 вебхук", async () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const id = await seedEntry({
      status: "SCHEDULED",
      scheduledFor: new Date("2026-05-01T00:00:00.000Z"),
      authorId,
      collectionId,
    });

    const [a, b] = await Promise.all([publishDue(prisma, now), publishDue(prisma, now)]);
    expect(a.length + b.length, "запись опубликована ровно одним прогоном").toBe(1);

    expect(await prisma.revision.count({ where: { entryId: id } })).toBe(1);
    await expect.poll(() => hits.length, { timeout: 5000 }).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(hits, "второй прогон не досылает").toHaveLength(1);
  }, 30000);
});

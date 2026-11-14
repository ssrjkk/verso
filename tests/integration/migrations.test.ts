import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/lib/prisma-client";

let dir = "";
let prisma: PrismaClient;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-migrations-"));
  const dbFile = path.join(dir, "test.db").replace(/\\/g, "/");
  execSync("npx prisma migrate deploy", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "pipe",
  });
  prisma = createPrismaClient(`file:${dbFile}`);
  await prisma.$connect();
}, 180000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("Prisma migrations and SQLite runtime", () => {
  it("чистая БД собирается миграциями и содержит индексы запросов", async () => {
    const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "migration_name"',
    );
    const appliedNames = applied.map((r) => r.migration_name);
    expect(appliedNames).toContain("20261114000000_baseline");
    expect(appliedNames).toContain("20261114000100_indexes");

    const expected = [
      "Session_userId_idx",
      "Account_userId_idx",
      "Account_providerId_accountId_idx",
      "Verification_identifier_idx",
      "Entry_status_scheduledFor_idx",
      "Entry_collectionId_status_publishedAt_idx",
      "Entry_collectionId_status_updatedAt_idx",
      "Entry_collectionId_updatedAt_idx",
      "Entry_stageId_idx",
      "Entry_updatedAt_idx",
      "EntryTag_tagId_idx",
      "MediaAsset_folder_createdAt_idx",
      "EditorialTask_dueDate_idx",
      "EditorialTask_entryId_idx",
      "EditorialTask_assigneeId_idx",
      "ActivityLog_entryId_createdAt_idx",
      "WebhookEndpoint_isActive_idx",
    ];
    const placeholders = expected.map(() => "?").join(", ");
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM "sqlite_master" WHERE "type" = 'index' AND "name" IN (${placeholders})`,
      ...expected,
    );
    expect(new Set(rows.map((r) => r.name))).toEqual(new Set(expected));
  });

  it("соединение включает WAL, NORMAL sync, foreign_keys и busy_timeout", async () => {
    const [journal] = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>(
      "PRAGMA journal_mode",
    );
    const [sync] = await prisma.$queryRawUnsafe<Array<{ synchronous: number | bigint }>>(
      "PRAGMA synchronous",
    );
    const [foreignKeys] = await prisma.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>(
      "PRAGMA foreign_keys",
    );
    const [busy] = await prisma.$queryRawUnsafe<Array<{ timeout: number | bigint }>>(
      "PRAGMA busy_timeout",
    );

    expect(journal.journal_mode.toLowerCase()).toBe("wal");
    expect(String(sync.synchronous)).toBe("1"); // NORMAL
    expect(String(foreignKeys.foreign_keys)).toBe("1");
    expect(String(busy.timeout)).toBe("5000");
  });

  it("каскады работают на уровне SQLite, а не только в схеме", async () => {
    const ts = Date.now();
    const user = await prisma.user.create({
      data: { id: `u-${ts}`, name: "cascade", email: `cascade-${ts}@t.dev` },
    });
    const collection = await prisma.collection.create({
      data: { id: `c-${ts}`, name: "cascade", slug: `cascade-${ts}` },
    });
    const entry = await prisma.entry.create({
      data: {
        id: `e-${ts}`,
        collectionId: collection.id,
        title: "cascade",
        slug: "cascade",
        authorId: user.id,
      },
    });
    await prisma.pageBlock.create({
      data: { entryId: entry.id, type: "HERO", propsJson: "{}" },
    });

    await prisma.collection.delete({ where: { id: collection.id } });

    expect(await prisma.entry.count({ where: { id: entry.id } })).toBe(0);
    expect(await prisma.pageBlock.count({ where: { entryId: entry.id } })).toBe(0);
  });
});

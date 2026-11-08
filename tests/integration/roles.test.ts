import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  LastAdminError,
  OwnRoleChangeError,
  UserNotFoundError,
  setUserRole,
} from "@/lib/roles";

let dir = "";
let prisma: PrismaClient;
let seq = 0;

function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function user(role: "ADMIN" | "MANAGER" | "VIEWER") {
  const id = uid("u");
  await prisma.user.create({ data: { id, name: id, email: `${id}@t.dev`, role } });
  return id;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-roles-"));
  const dbFile = path.join(dir, "test.db").replace(/\\/g, "/");
  execSync("npx prisma db push", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    stdio: "pipe",
  });
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });
  await prisma.$connect();
}, 180000);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Каждый кейс проверяет инвариант с нуля: иначе ADMIN'ы из прошлых тестов
  // маскируют проверку «последнего администратора».
  await prisma.user.deleteMany();
});

describe("setUserRole (real SQLite)", () => {
  it("нельзя понизить последнего администратора", async () => {
    const target = await user("ADMIN");
    const actor = await user("VIEWER");
    await expect(setUserRole(prisma, actor, target, "MANAGER")).rejects.toBeInstanceOf(LastAdminError);
    const row = await prisma.user.findUnique({ where: { id: target }, select: { role: true } });
    expect(row?.role).toBe("ADMIN");
  });

  it("нельзя менять собственную роль", async () => {
    const caller = await user("ADMIN");
    await expect(setUserRole(prisma, caller, caller, "MANAGER")).rejects.toBeInstanceOf(
      OwnRoleChangeError,
    );
    const row = await prisma.user.findUnique({ where: { id: caller }, select: { role: true } });
    expect(row?.role).toBe("ADMIN");
  });

  it("несуществующий пользователь → UserNotFoundError", async () => {
    const actor = await user("ADMIN");
    await expect(setUserRole(prisma, actor, "missing-id", "VIEWER")).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it("повышение VIEWER → MANAGER работает", async () => {
    const actor = await user("ADMIN");
    const target = await user("VIEWER");
    const updated = await setUserRole(prisma, actor, target, "MANAGER");
    expect(updated.role).toBe("MANAGER");
  });

  it("параллельные demote не оставляют 0 администраторов", { timeout: 30000 }, async () => {
    const a = await user("ADMIN");
    const b = await user("ADMIN");
    const results = await Promise.allSettled([
      setUserRole(prisma, a, b, "MANAGER"),
      setUserRole(prisma, b, a, "MANAGER"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(LastAdminError);
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBeGreaterThanOrEqual(1);
  });
});

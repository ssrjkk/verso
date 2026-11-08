import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { applySignupRolePolicy } from "@/lib/first-admin";

let dir = "";
let prisma: PrismaClient;

function clientFor(file: string) {
  const adapter = new PrismaBetterSqlite3({ url: `file:${file}` });
  return new PrismaClient({ adapter });
}

beforeAll(
  async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "verso-firstadmin-"));
    const dbFile = path.join(dir, "test.db").replace(/\\/g, "/");
    execSync("npx prisma db push", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
      stdio: "pipe",
    });
    prisma = clientFor(dbFile);
    await prisma.$connect();
  },
  180000,
);

afterAll(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("first-admin bootstrap (real SQLite)", () => {
  it(
    "первый пользователь становится ADMIN ровно один раз даже при параллельных вызовах",
    { timeout: 60000 },
    async () => {
      const ids = Array.from({ length: 5 }, (_, i) => `u${Date.now()}-${i}`);
      for (const id of ids) {
        await prisma.user.create({ data: { id, name: id, email: `${id}@t.dev` } });
      }
      const results = await Promise.all(ids.map((id) => applySignupRolePolicy(prisma, id)));
      expect(results.filter((r) => r === "promoted")).toHaveLength(1);
      expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
    },
  );

  it("при существующем ADMIN новый пользователь остаётся VIEWER", async () => {
    const id = `late-${Date.now()}`;
    await prisma.user.create({ data: { id, name: "late", email: `${id}@t.dev`, role: "VIEWER" } });
    // даже если клиент подсунул ADMIN напрямую в БД до хука — политика фиксирует VIEWER
    await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
    const out = await applySignupRolePolicy(prisma, id);
    expect(out).toBe("kept");
    const row = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    expect(row?.role).toBe("VIEWER");
    expect(await prisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  });
});

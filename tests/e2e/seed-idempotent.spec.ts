import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import Database from "better-sqlite3";

const DB = "prisma/e2e.db";

function counts() {
  const db = new Database(DB, { readonly: true });
  try {
    const q = (t: string) => (db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c;
    const dupes = db
      .prepare(`SELECT slug FROM "Collection" GROUP BY slug HAVING COUNT(*) > 1`).all();
    return { users: q("User"), stages: q("WorkflowStage"), collections: q("Collection"), dupes };
  } finally {
    db.close();
  }
}

test("seed idempotent: повторный прогон не плодит дубли", () => {
  const before = counts();
  expect(before.users).toBeGreaterThanOrEqual(3);
  execSync("npx tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: "file:./prisma/e2e.db" },
    stdio: "pipe",
  });
  const after = counts();
  expect(after.users).toEqual(before.users);
  expect(after.stages).toEqual(before.stages);
  expect(after.collections).toBeGreaterThanOrEqual(before.collections);
  expect(after.dupes).toEqual([]);
});

// E2E webServer: изолированная БД prisma/e2e.db, сид, next start на 3100.
// Запуск: npx playwright test (сборка проверяется автоматически ниже).
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// Сторож свежести: e2e запрещено идти на протухшем бандле.
// Если любой исходник новее .next/BUILD_ID — сначала полный build.
const root = process.cwd();
let buildFresh = false;
try {
  const builtAt = fs.statSync(path.join(root, ".next", "BUILD_ID")).mtimeMs;
  let newest = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "public") continue;
        walk(p);
      } else if (/\.(ts|tsx|css|mjs|js|json|prisma)$/.test(e.name)) {
        const t = fs.statSync(p).mtimeMs;
        if (t > newest) newest = t;
      }
    }
  };
  for (const d of ["src", "prisma"]) {
    const f = path.join(root, d);
    if (fs.existsSync(f)) walk(f);
  }
  for (const f of ["package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "prisma.config.ts"]) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) newest = Math.max(newest, fs.statSync(p).mtimeMs);
  }
  buildFresh = newest <= builtAt + 1000;
} catch {
  buildFresh = false;
}
if (!buildFresh) {
  console.log("[webServer] sources newer than build — rebuilding...");
  run("npm", ["run", "build"]);
} else {
  console.log("[webServer] build is fresh, skipping rebuild");
}
process.env.DATABASE_URL = "file:./prisma/e2e.db";
process.env.VERSO_TEST_HARNESS ??= "1";
process.env.SEED_ALLOW ??= "1";
process.env.BETTER_AUTH_SECRET ??= "e2e-test-secret-32-chars-minimum!!";
process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3100";

// Детерминированный baseline: e2e.db пересоздаётся при каждом старте сервера.
// Иначе пользователи/роли от прошлых прогонов накапливаются и ломают
// инварианты (например, «последний ADMIN»).
console.log("[webServer] resetting e2e.db");
for (const f of ["e2e.db", "e2e.db-journal", "e2e.db-wal", "e2e.db-shm"]) {
  fs.rmSync(path.join(root, "prisma", f), { force: true });
}

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["tsx", "prisma/seed.ts"]);

const server = spawn("npx", ["next", "start", "-p", "3100"], { stdio: "inherit", shell: true });
const kill = () => server.kill();
process.on("SIGTERM", kill);
process.on("SIGINT", kill);
await new Promise(() => {});

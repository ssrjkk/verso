// E2E webServer: изолированная БД prisma/e2e.db, сид, next start на 3100.
// Запуск: npx playwright test (требует собранный .next — см. test:all).
import { spawnSync, spawn } from "node:child_process";

process.env.DATABASE_URL = "file:./prisma/e2e.db";
process.env.BETTER_AUTH_SECRET ??= "e2e-test-secret-32-chars-minimum!!";
process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3100";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run("npx", ["prisma", "db", "push"]);
run("npx", ["tsx", "prisma/seed.ts"]);

const server = spawn("npx", ["next", "start", "-p", "3100"], { stdio: "inherit", shell: true });
const kill = () => server.kill();
process.on("SIGTERM", kill);
process.on("SIGINT", kill);
await new Promise(() => {});

import { test, expect, type APIRequestContext } from "@playwright/test";

type Role = "ADMIN" | "MANAGER" | "VIEWER";
type UserRow = { id: string; email: string; role: Role };

const ADMIN = "tests/e2e/.auth/admin.json";
const EDITOR = "tests/e2e/.auth/editor.json";
const VIEWER = "tests/e2e/.auth/viewer.json";

async function call(
  request: APIRequestContext,
  path: string,
  json?: unknown,
  isQuery = false,
) {
  const payload = json === undefined
    ? { "0": { json: null, meta: { values: ["undefined"], v: 1 } } }
    : { "0": { json } };
  const r = isQuery
    ? await request.get(`/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`)
    : await request.post(`/api/trpc/${path}?batch=1`, {
        headers: { "content-type": "application/json" },
        data: payload,
      });
  const j = (await r.json()) as Array<{
    result?: { data: { json: unknown } };
    error?: { json: { data: { code: string; message?: string } } };
  }>;
  return { status: r.status(), op: j[0] };
}

async function users(request: APIRequestContext): Promise<UserRow[]> {
  const { op } = await call(request, "user.list", undefined, true);
  if (op.error) throw new Error(`user.list failed: ${op.error.json.data.code}`);
  return op.result!.data.json as UserRow[];
}

async function setRole(request: APIRequestContext, userId: string, role: Role) {
  return call(request, "user.setRole", { userId, role });
}

test("viewer не имеет доступа к управлению пользователями", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: VIEWER });
  try {
    const list = await call(ctx.request, "user.list", undefined, true);
    expect(list.op.error?.json.data.code).toBe("FORBIDDEN");
    const set = await setRole(ctx.request, "any-id", "ADMIN");
    expect(set.op.error?.json.data.code).toBe("FORBIDDEN");
  } finally {
    await ctx.close();
  }
});

test("admin не может менять собственную роль", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ADMIN });
  try {
    const me = (await users(ctx.request)).find((u) => u.email === "admin@verso.dev");
    expect(me).toBeTruthy();
    const res = await setRole(ctx.request, me!.id, "MANAGER");
    expect(res.op.error?.json.data.code).toBe("FORBIDDEN");
    const after = (await users(ctx.request)).find((u) => u.id === me!.id);
    expect(after?.role).toBe("ADMIN");
  } finally {
    await ctx.close();
  }
});

test("блок «Пользователи»: виден только ADMIN, смена роли исполняется", async ({ browser }) => {
  const ts = Date.now();
  const email = `e2e-role-ui-${ts}@example.dev`;
  const admin = await browser.newContext({ storageState: ADMIN });
  const viewer = await browser.newContext({ storageState: VIEWER });
  const anon = await browser.newContext();
  try {
    const signup = await anon.request.post("/api/auth/sign-up/email", {
      headers: { "content-type": "application/json" },
      data: { name: `Role UI ${ts}`, email, password: "Test12345!@#" },
    });
    expect(signup.ok(), `signup ${signup.status()}`).toBeTruthy();

    const page = await admin.newPage();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Пользователи" })).toBeVisible();

    const select = page.getByLabel(`Роль пользователя ${email}`);
    await expect(select).toBeVisible();
    const changed = page.waitForResponse(
      (r) => r.url().includes("user.setRole") && r.request().method() === "POST",
    );
    await select.selectOption("MANAGER");
    await changed;
    await expect(select).toHaveValue("MANAGER");

    const all = await users(admin.request);
    expect(all.find((u) => u.email === email)?.role).toBe("MANAGER");

    const viewerPage = await viewer.newPage();
    await viewerPage.goto("/settings");
    await expect(viewerPage.getByRole("heading", { name: "Настройки · API-ключи" })).toBeVisible();
    await expect(viewerPage.getByRole("heading", { name: "Пользователи" })).toHaveCount(0);
  } finally {
    try {
      const all = await users(admin.request);
      const temp = all.find((u) => u.email === email);
      if (temp && temp.role !== "VIEWER") await setRole(admin.request, temp.id, "VIEWER");
    } catch {
      // cleanup best-effort: e2e.db пересоздаётся при следующем старте
    }
    await admin.close();
    await viewer.close();
    await anon.close();
  }
});

test("гонка: два админа не могут понизить друг друга до нуля админов", async ({ browser }) => {
  const admin = await browser.newContext({ storageState: ADMIN });
  const editor = await browser.newContext({ storageState: EDITOR });
  let adminId = "";
  let editorId = "";
  try {
    const all = await users(admin.request);
    adminId = all.find((u) => u.email === "admin@verso.dev")?.id ?? "";
    editorId = all.find((u) => u.email === "editor@verso.dev")?.id ?? "";
    expect(adminId && editorId).toBeTruthy();

    // Страховка от прошлого прерванного прогона.
    if (all.find((u) => u.id === editorId)?.role !== "MANAGER") {
      const reset = await setRole(admin.request, editorId, "MANAGER");
      expect(reset.op.error, "reset editor to MANAGER").toBeUndefined();
    }

    const promote = await setRole(admin.request, editorId, "ADMIN");
    expect(promote.op.error, "promote editor").toBeUndefined();

    const [a, b] = await Promise.all([
      setRole(admin.request, editorId, "MANAGER"),
      setRole(editor.request, adminId, "MANAGER"),
    ]);

    const results = [a, b];
    const ok = results.filter((r) => !r.op.error);
    const failed = results.filter((r) => r.op.error);
    expect(ok, "ровно одна смена проходит").toHaveLength(1);
    expect(failed, "ровно одна смена отклоняется").toHaveLength(1);
    // Отказ зависит от того, успел ли проигравший пройти adminProcedure:
    // CONFLICT — сработал guard последнего админа, FORBIDDEN — сессия уже
    // потеряла роль ADMIN. Оба исхода безопасны; важен итог: ровно 1 ADMIN.
    expect(["CONFLICT", "FORBIDDEN"]).toContain(failed[0].op.error?.json.data.code);

    const current = await users(admin.request).catch(() => users(editor.request));
    expect(current.filter((u) => u.role === "ADMIN")).toHaveLength(1);
  } finally {
    // Восстановление ролей независимо от исхода.
    try {
      let list: UserRow[] | null = null;
      try {
        list = await users(admin.request);
      } catch {
        list = await users(editor.request);
      }
      const adminRow = list.find((u) => u.id === adminId);
      if (adminRow && adminRow.role !== "ADMIN") {
        const fix = await setRole(editor.request, adminId, "ADMIN");
        expect(fix.op.error).toBeUndefined();
      }
      const refreshed = await users(admin.request);
      if (refreshed.find((u) => u.id === editorId)?.role === "ADMIN") {
        await setRole(admin.request, editorId, "MANAGER");
      }
    } finally {
      await admin.close();
      await editor.close();
    }
  }
});

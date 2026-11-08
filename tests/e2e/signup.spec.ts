import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function trpc(page: Page, path: string, json?: unknown, isQuery = false) {
  const payload = json === undefined
    ? { "0": { json: null, meta: { values: ["undefined"], v: 1 } } }
    : { "0": { json } };
  const r = isQuery
    ? await page.request.get(`/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`)
    : await page.request.post(`/api/trpc/${path}?batch=1`, {
        headers: { "content-type": "application/json" },
        data: payload,
      });
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

async function trpcAs(request: APIRequestContext, path: string, json?: unknown, isQuery = false) {
  const payload = json === undefined
    ? { "0": { json: null, meta: { values: ["undefined"], v: 1 } } }
    : { "0": { json } };
  const r = isQuery
    ? await request.get(`/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`)
    : await request.post(`/api/trpc/${path}?batch=1`, {
        headers: { "content-type": "application/json" },
        data: payload,
      });
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

// RED TEAM: даже если подсунуть role:"ADMIN" в тело signup — итог VIEWER.
test("signup ignores injected role, stays VIEWER", async ({ browser }) => {
  const ts = Date.now();
  const email = `e2e-red-${ts}@example.dev`;
  const ctx = await browser.newContext();
  try {
    const res = await ctx.request.post("/api/auth/sign-up/email", {
      headers: { "content-type": "application/json" },
      data: { name: `E2E Red ${ts}`, email, password: "Test12345!@#", role: "ADMIN" },
    });
    expect(res.ok(), `signup status ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { user?: { role?: string } };
    expect(body.user?.role, "роль в ответе sign-up").toBe("VIEWER");

    const admin = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
    try {
      const { op } = await trpcAs(admin.request, "user.list", undefined, true);
      const users = (op.result?.data?.json ?? []) as Array<{ email: string; role: string }>;
      const me = users.find((u) => u.email === email);
      expect(me, "new user present in admin user.list").toBeTruthy();
      expect(me!.role).toBe("VIEWER");
    } finally {
      await admin.close();
    }
  } finally {
    await ctx.close();
  }
});

// Новый пользователь по умолчанию VIEWER: читать можно, писать — 403.
test("fresh signup is VIEWER: read ok, write forbidden", async ({ browser }) => {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    const ts = Date.now();
    const email = `e2e-new-${ts}@example.dev`;
    await page.goto("/sign-up");
    await page.locator("#signup-name").fill(`E2E ${ts}`);
    await page.locator("#signup-email").fill(email);
    await page.locator("#signup-password").fill("Test12345!");
    await page.locator("form button").first().click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    const { op: read } = await trpc(page, "collection.list", undefined, true);
    expect(read.error, "viewer can read").toBeUndefined();
    const { op: write } = await trpc(page, "entry.create", { collectionId: "xxx", title: "Nope" });
    expect(write.error?.json.data.code).toBe("FORBIDDEN");
  } finally {
    await ctx.close();
  }
});

test("duplicate signup shows error, no redirect", async ({ browser }) => {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.goto("/sign-up");
    await page.locator("#signup-name").fill("Dup");
    await page.locator("#signup-email").fill("editor@verso.dev");
    await page.locator("#signup-password").fill("Test12345!");
    await page.locator("form button").first().click();
    // Точный текст вместо getByRole("alert"): в Next 16 role="alert" есть и у
    // #__next-route-announcer__, из-за чего общий селектор флакает strict mode.
    await expect(page.getByText("User already exists")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/sign-up/);
  } finally {
    await ctx.close();
  }
});
